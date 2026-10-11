/**
 * Backend del Ricettario: accesso con email e password (o password personale
 * per i tester), sessioni per dispositivo, proxy verso l'API di Anthropic con
 * budget e misura dei consumi, sincronizzazione dell'archivio. Dati su D1.
 *
 * Usato in due modi, con lo stesso codice:
 * - come funzione di Cloudflare Pages su /api (functions/api/[[path]].js), insieme all'app;
 * - come worker a sé (proxy/cloudflare-worker.js), per chi tiene l'app su GitHub Pages.
 *
 * Variabili e segreti:
 *   ANTHROPIC_API_KEY   la chiave vera (segreto)
 *   ADMIN_TOKEN         password dell'amministratore per le rotte /admin da terminale (segreto)
 *   OPEN_SIGNUP         "true" per permettere la registrazione senza invito (default: serve un invito)
 *   RESEND_API_KEY      facoltativo, per mandare le email di reset della password (segreto)
 *   MAIL_FROM           mittente delle email, es. "Ricettario <noreply@tuodominio.it>"
 *   APP_ORIGIN          facoltativo, origine dell'app per i link nelle email (default: quella della richiesta)
 *   USERS               facoltativo, JSON {"nome": "password"}: utenti creati in D1 alla prima
 *                       richiesta con quella password; senza D1 è l'unico elenco utenti (segreto)
 *   PROXY_TOKEN         compatibilità: una sola password, utente "default" (segreto, facoltativo)
 *   MONTHLY_BUDGET_USD  budget per utente al mese se l'utente non ne ha uno proprio, default 3
 *   DAILY_BUDGET_USD    tetto giornaliero per tutti gli utenti insieme, default 5
 *   ALLOWED_ORIGIN      origine ammessa per il CORS, default *
 * Binding:
 *   DB                  database D1. Senza, funzionano solo proxy e /fetch: niente accessi,
 *                       budget, misura né sincronizzazione.
 *
 * Chi chiama si presenta con l'header x-api-key: un token di sessione (sess_…)
 * ottenuto da /auth/login o /auth/register, oppure la password personale di un
 * tester creato dall'amministratore.
 *
 * Rotte (relative al prefisso, "/api" su Pages, "" sul worker):
 *   GET  /health                        stato
 *   GET  /auth/invite?code=             l'invito è valido? per chi, con che piano
 *   POST /auth/register                 {invite?, email, password, name?, device?} → {token, user}
 *   POST /auth/login                    {email (o nome), password, device?} → {token, user}
 *   POST /auth/forgot                   {email} → sempre 200; manda il link se l'email è configurata
 *   POST /auth/reset                    {token, password} → {token, user}; chiude le altre sessioni
 *   POST /auth/logout                   chiude questa sessione
 *   POST /auth/logout-all               chiude le altre sessioni
 *   GET  /auth/sessions                 dispositivi collegati
 *   POST /auth/sessions/:id/revoke      scollega un dispositivo
 *   POST /auth/password                 {current, password} cambia la password
 *   GET  /me                            chi sono, piano, budget, consumo del mese, righe sincronizzate
 *   GET  /fetch?url=                    sorgente HTML di una pagina di ricetta (per l'import JSON-LD)
 *   POST /sync                          {since, recipes, sessions, chats} → {now, recipes, sessions, chats}
 *   POST /v1/messages                   inoltro ad Anthropic con controllo del budget e misura
 * Amministrazione (x-admin-token, oppure sessione di un utente con ruolo admin):
 *   GET  /admin/usage?month=            consumi del mese per utente e totale di oggi
 *   GET  /admin/users                   elenco utenti
 *   POST /admin/users                   {name, plan?, budgetUsd?, password?} → tester con password
 *   POST /admin/users/:name/reset       nuova password per un tester
 *   POST /admin/users/:name/reset-link  link per reimpostare la password (da mandare a mano)
 *   POST /admin/users/:name/role        {role: "admin" | "user"}
 *   POST /admin/users/:name/disable | /enable
 *   GET  /admin/invites                 inviti emessi
 *   POST /admin/invites                 {email?, plan?, budgetUsd?, days?} → {code, link}
 */
import {
  counts,
  countUsers,
  createEmailUser,
  createUser,
  dayUsage,
  ensureSchema,
  findUserByEmail,
  findUserById,
  findUserByName,
  findUserByToken,
  listUsers,
  logUsage,
  monthUsage,
  monthUsageByUser,
  resetPassword,
  setDisabled,
  setPassword,
  setRole,
  sha256,
  sync,
  touchUser,
  uniqueName,
} from './db.js'
import {
  clearFailures,
  consumeInvite,
  consumeResetToken,
  createInvite,
  createResetToken,
  createSession,
  hashPassword,
  isLocked,
  listInvites,
  listSessions,
  normalizeEmail,
  passwordProblem,
  registerFailure,
  revokeAllSessions,
  revokeSession,
  sendMail,
  userFromSession,
  validInvite,
  verifyPassword,
} from './auth.js'

/** Prezzi in USD per milione di token, come in src/ai/usage.ts. */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
const MAX_PAGE_BYTES = 2_000_000
const MAX_SYNC_BYTES = 8_000_000
const SESSION_PREFIX = 'sess_'

export function costOf(model, usage) {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']
  const read = usage.cache_read_input_tokens ?? 0
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const write5m = (usage.cache_creation_input_tokens ?? 0) - write1h
  return ((usage.input_tokens ?? 0) * p.input + read * p.cacheRead + write5m * p.input * 1.25 + write1h * p.input * 2 + (usage.output_tokens ?? 0) * p.output) / 1_000_000
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-api-key, x-admin-token, x-ricettario-feature, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access',
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
}

/** Errore nel formato dell'API, così l'SDK dell'app lo mostra con il messaggio giusto. */
function apiError(status, type, message, headers) {
  return json({ type: 'error', error: { type, message } }, status, headers)
}

function envUsers(env) {
  const map = {}
  if (env.USERS) {
    try {
      Object.assign(map, JSON.parse(env.USERS))
    } catch {
      // USERS non è JSON valido
    }
  }
  if (env.PROXY_TOKEN) map.default = env.PROXY_TOKEN
  return map
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function envUserFor(env, token) {
  for (const [name, pw] of Object.entries(envUsers(env))) if (sameSecret(pw, token)) return name
  return null
}

const publicUser = (u) => ({ name: u.name, email: u.email ?? null, plan: u.plan, role: u.role ?? 'user' })
const openSignup = (env) => String(env.OPEN_SIGNUP ?? '').toLowerCase() === 'true'
const mailConfigured = (env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM)
const clientIp = (request) => request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto'
const appOrigin = (request, env) => (env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/+$/, '')

/**
 * Riconosce chi chiama dall'header x-api-key: token di sessione, oppure
 * password personale di un tester. Con D1 cerca in tabella; se la password è
 * nel segreto USERS e l'utente non esiste ancora, lo crea (così i primi utenti
 * si caricano senza comandi). Senza D1 vale solo il segreto USERS.
 */
async function authenticate(request, env) {
  const token = request.headers.get('x-api-key')
  if (!token) return null
  if (env.DB) {
    await ensureSchema(env.DB)
    if (token.startsWith(SESSION_PREFIX)) return userFromSession(env.DB, token)
    const found = await findUserByToken(env.DB, token)
    if (found) return { id: found.id, name: found.name, email: found.email, plan: found.plan, role: found.role, budgetUsd: found.budget_usd, sessionId: null }
    const name = envUserFor(env, token)
    if (!name) return null
    const existing = await findUserByName(env.DB, name)
    if (existing) return null // utente già in tabella con un'altra password: vince la tabella
    const created = await createUser(env.DB, { name, password: token })
    return { id: created.id, name, email: null, plan: created.plan, role: 'user', budgetUsd: null, sessionId: null }
  }
  const name = envUserFor(env, token)
  return name ? { id: name, name, email: null, plan: 'tester', role: 'user', budgetUsd: null, sessionId: null } : null
}

function isAdminToken(request, env) {
  return Boolean(env.ADMIN_TOKEN) && sameSecret(request.headers.get('x-admin-token') ?? '', env.ADMIN_TOKEN)
}

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7)
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)

/** Legge gli eventi SSE di una risposta in streaming e ne ricava l'uso complessivo. */
async function usageFromStream(stream) {
  const text = await new Response(stream).text()
  const usage = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    let ev
    try {
      ev = JSON.parse(line.slice(5).trim())
    } catch {
      continue
    }
    if (ev.type === 'message_start' && ev.message?.usage) Object.assign(usage, ev.message.usage)
    if (ev.type === 'message_delta' && ev.usage) Object.assign(usage, ev.usage)
  }
  return usage
}

async function fetchPage(target, env) {
  let parsed
  try {
    parsed = new URL(target ?? '')
  } catch {
    return new Response('URL non valido', { status: 400, headers: cors(env) })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return new Response('Solo http e https', { status: 400, headers: cors(env) })
  const res = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Ricettario/1.0)', accept: 'text/html,application/xhtml+xml' },
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) return new Response('Pagina non leggibile', { status: 502, headers: cors(env) })
  const html = (await res.text()).slice(0, MAX_PAGE_BYTES)
  return new Response(html, { status: 200, headers: { ...cors(env), 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

async function readJson(request, maxBytes) {
  const text = await request.text()
  if (text.length > maxBytes) throw new Error('troppo grande')
  return JSON.parse(text)
}

async function bodyOf(request, headers, maxBytes = 10_000) {
  try {
    const b = await readJson(request, maxBytes)
    return [b && typeof b === 'object' ? b : {}, null]
  } catch {
    return [null, apiError(400, 'invalid_request_error', 'Corpo della richiesta non valido.', headers)]
  }
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

// --- Accesso ---------------------------------------------------------------------

async function sessionReply(db, user, device, headers, status = 200) {
  const session = await createSession(db, user.id, device)
  await touchUser(db, user.id)
  return json({ token: session.token, sessionId: session.id, user: publicUser(user) }, status, headers)
}

/** Verifica la password di un utente: hash lento se c'è, altrimenti la chiave diretta dei tester nati prima. */
async function checkPassword(user, password) {
  if (user?.password_hash) return verifyPassword(password, user.password_hash)
  if (user?.token_hash) return sameSecret(await sha256(password), user.token_hash)
  // Nessun utente: consuma comunque il tempo di un hash, così la risposta non rivela se l'email esiste.
  await hashPassword(password)
  return false
}

async function authRoutes(request, env, path, headers) {
  if (!env.DB) return apiError(503, 'api_error', 'Accesso non disponibile: il server non ha un database.', headers)
  await ensureSchema(env.DB)
  const db = env.DB
  const url = new URL(request.url)
  const ip = clientIp(request)
  const ipKey = `ip:${ip}`
  const locked = () => apiError(429, 'rate_limit_error', 'Troppi tentativi: riprova tra un quarto d\'ora.', headers)

  if (request.method === 'GET' && path === '/auth/invite') {
    const inv = await validInvite(db, url.searchParams.get('code'))
    if (!inv) return json({ valid: false, open: openSignup(env) }, 200, headers)
    return json({ valid: true, email: inv.email, plan: inv.plan, expiresAt: inv.expires_at }, 200, headers)
  }

  if (request.method === 'POST' && path === '/auth/register') {
    if (await isLocked(db, ipKey)) return locked()
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const email = normalizeEmail(body.email)
    if (!email) return apiError(400, 'invalid_request_error', 'Indirizzo email non valido.', headers)
    const problem = passwordProblem(body.password, email)
    if (problem) return apiError(400, 'invalid_request_error', problem, headers)
    let invite = null
    if (!openSignup(env) || body.invite) {
      invite = await validInvite(db, str(body.invite, 100))
      if (!invite) {
        await registerFailure(db, ipKey)
        return apiError(400, 'invalid_request_error', openSignup(env) ? 'Invito non valido o scaduto.' : 'Per registrarti serve un invito valido: chiedilo a chi gestisce l\'app.', headers)
      }
      if (invite.email && invite.email !== email) return apiError(400, 'invalid_request_error', 'Questo invito è per un altro indirizzo email.', headers)
    }
    if (await findUserByEmail(db, email)) return apiError(409, 'invalid_request_error', 'Esiste già un account con questa email: accedi, oppure usa "Password dimenticata".', headers)
    const first = (await countUsers(db)) === 0
    const user = await createEmailUser(db, {
      email,
      password: body.password,
      name: await uniqueName(db, str(body.name, 60) || email),
      plan: invite?.plan ?? (openSignup(env) ? 'free' : 'tester'),
      budgetUsd: invite?.budget_usd ?? null,
      role: first ? 'admin' : 'user',
    })
    if (invite) await consumeInvite(db, invite.code, user.id)
    await clearFailures(db, ipKey)
    return sessionReply(db, user, str(body.device, 120), headers, 201)
  }

  if (request.method === 'POST' && path === '/auth/login') {
    if (await isLocked(db, ipKey)) return locked()
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const identifier = str(body.email, 254).trim()
    const password = str(body.password, 1000)
    const email = normalizeEmail(identifier)
    const accountKey = `login:${email ?? identifier.toLowerCase()}`
    if (identifier && (await isLocked(db, accountKey))) return locked()
    let user = identifier ? (email ? await findUserByEmail(db, email) : await findUserByName(db, identifier.toLowerCase())) : null
    let ok = Boolean(password) && (await checkPassword(user, password))
    if (!ok && !user && !email && identifier && envUserFor(env, password) === identifier.toLowerCase()) {
      // Tester del segreto USERS che entra dalla pagina prima di aver mai usato la password: lo creiamo adesso.
      user = { ...(await createUser(db, { name: identifier.toLowerCase(), password })), email: null, disabled: 0 }
      ok = true
    }
    if (!ok) {
      await Promise.all([registerFailure(db, ipKey), identifier ? registerFailure(db, accountKey) : null])
      return apiError(401, 'authentication_error', 'Email o password non corretti.', headers)
    }
    if (user.disabled) return apiError(403, 'permission_error', 'Questo account è sospeso: scrivi a chi gestisce l\'app.', headers)
    await Promise.all([clearFailures(db, ipKey), clearFailures(db, accountKey)])
    return sessionReply(db, user, str(body.device, 120), headers)
  }

  if (request.method === 'POST' && path === '/auth/forgot') {
    if (await isLocked(db, ipKey)) return locked()
    await registerFailure(db, ipKey) // ogni richiesta conta: al massimo cinque ogni quarto d'ora per indirizzo
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const email = normalizeEmail(body.email)
    const user = email ? await findUserByEmail(db, email) : null
    if (user && !user.disabled && mailConfigured(env)) {
      const token = await createResetToken(db, user.id)
      const link = `${appOrigin(request, env)}/reimposta?token=${encodeURIComponent(token)}`
      await sendMail(env, {
        to: email,
        subject: 'Reimposta la password del Ricettario',
        text: `Ciao,\n\nper scegliere una nuova password del Ricettario apri questo link entro un'ora:\n\n${link}\n\nSe non hai chiesto tu di reimpostarla, ignora questo messaggio: la password resta quella di sempre.`,
      })
    }
    return json({ ok: true, mail: mailConfigured(env) }, 200, headers)
  }

  if (request.method === 'POST' && path === '/auth/reset') {
    if (await isLocked(db, ipKey)) return locked()
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const problem = passwordProblem(body.password)
    if (problem) return apiError(400, 'invalid_request_error', problem, headers)
    const userId = await consumeResetToken(db, str(body.token, 200))
    if (!userId) {
      await registerFailure(db, ipKey)
      return apiError(400, 'invalid_request_error', 'Link non valido o scaduto: richiedine uno nuovo.', headers)
    }
    const user = await findUserById(db, userId)
    if (!user || user.disabled) return apiError(403, 'permission_error', 'Questo account è sospeso: scrivi a chi gestisce l\'app.', headers)
    await setPassword(db, userId, body.password, { asToken: !user.email })
    await revokeAllSessions(db, userId)
    await clearFailures(db, `login:${user.email ?? user.name}`)
    return sessionReply(db, user, str(body.device, 120), headers)
  }

  // Da qui in poi serve una sessione.
  const user = await authenticate(request, env)
  if (!user) return apiError(401, 'authentication_error', 'Sessione scaduta: accedi di nuovo.', headers)

  if (request.method === 'POST' && path === '/auth/logout') {
    if (user.sessionId) await revokeSession(db, user.id, user.sessionId)
    return json({ ok: true }, 200, headers)
  }
  if (request.method === 'POST' && path === '/auth/logout-all') {
    await revokeAllSessions(db, user.id, user.sessionId)
    return json({ ok: true }, 200, headers)
  }
  if (request.method === 'GET' && path === '/auth/sessions') {
    const sessions = (await listSessions(db, user.id)).map((s) => ({ id: s.id, device: s.device, createdAt: s.created_at, lastUsedAt: s.last_used_at, current: s.id === user.sessionId }))
    return json({ sessions }, 200, headers)
  }
  const rev = path.match(/^\/auth\/sessions\/([A-Za-z0-9_-]+)\/revoke$/)
  if (request.method === 'POST' && rev) {
    const ok = await revokeSession(db, user.id, rev[1])
    return ok ? json({ ok: true }, 200, headers) : apiError(404, 'not_found_error', 'Dispositivo non trovato.', headers)
  }
  if (request.method === 'POST' && path === '/auth/password') {
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const full = await findUserById(db, user.id)
    if (!(await checkPassword(full, str(body.current, 1000)))) return apiError(401, 'authentication_error', 'La password attuale non è corretta.', headers)
    const problem = passwordProblem(body.password, full.email ?? '')
    if (problem) return apiError(400, 'invalid_request_error', problem, headers)
    await setPassword(db, user.id, body.password, { asToken: !full.email })
    await revokeAllSessions(db, user.id, user.sessionId)
    return json({ ok: true }, 200, headers)
  }
  return apiError(404, 'not_found_error', 'Rotta non trovata', headers)
}

// --- Amministrazione -------------------------------------------------------------

async function adminRoutes(request, env, path, headers) {
  if (!env.DB) return json({ error: 'Binding D1 "DB" assente: utenti e consumi non disponibili' }, 503, headers)
  await ensureSchema(env.DB)
  let admin = isAdminToken(request, env) ? 'admin' : null
  if (!admin) {
    const user = await authenticate(request, env)
    if (user?.role === 'admin') admin = user.name
  }
  if (!admin) return apiError(401, 'authentication_error', 'Serve la password amministratore o un account con ruolo admin.', headers)
  const url = new URL(request.url)
  const origin = appOrigin(request, env)

  if (request.method === 'GET' && path === '/admin/usage') {
    const month = url.searchParams.get('month') ?? monthKey()
    return json({ month, defaultBudgetUsd: Number(env.MONTHLY_BUDGET_USD ?? 3), users: await monthUsageByUser(env.DB, month), today: await dayUsage(env.DB, dayKey()) }, 200, headers)
  }
  if (request.method === 'GET' && path === '/admin/users') return json({ users: await listUsers(env.DB) }, 200, headers)
  if (request.method === 'POST' && path === '/admin/users') {
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const name = str(body.name, 60).trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(name)) return apiError(400, 'invalid_request_error', 'Nome non valido: lettere minuscole, cifre, punto, trattino, da 2 a 31 caratteri', headers)
    if (await findUserByName(env.DB, name)) return apiError(409, 'invalid_request_error', `L'utente ${name} esiste già`, headers)
    const user = await createUser(env.DB, { name, password: body.password || undefined, plan: body.plan || 'tester', budgetUsd: body.budgetUsd ?? null })
    return json({ ...user, note: 'Conserva la password: non viene mostrata di nuovo.' }, 201, headers)
  }
  if (request.method === 'GET' && path === '/admin/invites') {
    const invites = (await listInvites(env.DB)).map((i) => ({ ...i, link: `${origin}/registrati?invito=${i.code}` }))
    return json({ invites, open: openSignup(env) }, 200, headers)
  }
  if (request.method === 'POST' && path === '/admin/invites') {
    const [body, bad] = await bodyOf(request, headers)
    if (bad) return bad
    const email = body.email ? normalizeEmail(body.email) : null
    if (body.email && !email) return apiError(400, 'invalid_request_error', 'Indirizzo email non valido.', headers)
    const days = Math.min(90, Math.max(1, Number(body.days) || 14))
    const code = await createInvite(env.DB, { email, plan: str(body.plan, 20) || 'tester', budgetUsd: body.budgetUsd ?? null, days, createdBy: admin })
    return json({ code, email, plan: str(body.plan, 20) || 'tester', days, link: `${origin}/registrati?invito=${code}` }, 201, headers)
  }
  const m = path.match(/^\/admin\/users\/([a-z0-9._-]+)\/(reset|reset-link|role|disable|enable)$/)
  if (request.method === 'POST' && m) {
    const [, name, action] = m
    if (action === 'reset') {
      const password = await resetPassword(env.DB, name)
      return password ? json({ name, password }, 200, headers) : apiError(404, 'not_found_error', 'Utente non trovato', headers)
    }
    if (action === 'reset-link') {
      const user = await findUserByName(env.DB, name)
      if (!user) return apiError(404, 'not_found_error', 'Utente non trovato', headers)
      const token = await createResetToken(env.DB, user.id)
      return json({ name, link: `${origin}/reimposta?token=${encodeURIComponent(token)}`, minutes: 60 }, 200, headers)
    }
    if (action === 'role') {
      const [body, bad] = await bodyOf(request, headers)
      if (bad) return bad
      if (!['admin', 'user'].includes(body.role)) return apiError(400, 'invalid_request_error', 'Ruolo non valido: admin o user', headers)
      const ok = await setRole(env.DB, name, body.role)
      return ok ? json({ name, role: body.role }, 200, headers) : apiError(404, 'not_found_error', 'Utente non trovato', headers)
    }
    const ok = await setDisabled(env.DB, name, action === 'disable')
    if (ok && action === 'disable') {
      const user = await findUserByName(env.DB, name)
      if (user) await revokeAllSessions(env.DB, user.id)
    }
    return ok ? json({ name, disabled: action === 'disable' }, 200, headers) : apiError(404, 'not_found_error', 'Utente non trovato', headers)
  }
  return apiError(404, 'not_found_error', 'Rotta non trovata', headers)
}

/**
 * Gestisce una richiesta. `prefix` è la parte di percorso da togliere ("/api" su Pages),
 * `waitUntil` permette di registrare i consumi dopo aver già risposto.
 */
export async function handleProxy(request, env, { prefix = '', waitUntil = (p) => p } = {}) {
  const headers = cors(env)
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  const url = new URL(request.url)
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || '/' : url.pathname

  if (request.method === 'GET' && path === '/health') {
    return json(
      { ok: true, database: Boolean(env.DB), key: Boolean(env.ANTHROPIC_API_KEY), admin: Boolean(env.ADMIN_TOKEN), signup: openSignup(env) ? 'open' : 'invite', mail: mailConfigured(env), envUsers: Object.keys(envUsers(env)).length },
      200,
      headers,
    )
  }
  if (path.startsWith('/auth/')) return authRoutes(request, env, path, headers)
  if (path.startsWith('/admin/')) return adminRoutes(request, env, path, headers)

  const user = await authenticate(request, env)
  if (!user) {
    const token = request.headers.get('x-api-key') ?? ''
    return apiError(401, 'authentication_error', token.startsWith(SESSION_PREFIX) ? 'Sessione scaduta: accedi di nuovo.' : 'Password non valida: controlla quella inserita in Impostazioni.', headers)
  }
  const budgetUsd = user.budgetUsd ?? Number(env.MONTHLY_BUDGET_USD ?? 3)

  if (request.method === 'GET' && path === '/me') {
    const usage = env.DB ? await monthUsage(env.DB, user.id, monthKey()) : null
    const stored = env.DB ? await counts(env.DB, user.id) : null
    return json({ user: user.name, email: user.email ?? null, role: user.role ?? 'user', plan: user.plan, session: Boolean(user.sessionId), month: monthKey(), budgetUsd, usage, stored, sync: Boolean(env.DB) }, 200, headers)
  }

  if (request.method === 'GET' && path === '/fetch') return fetchPage(url.searchParams.get('url'), env)

  if (request.method === 'POST' && path === '/sync') {
    if (!env.DB) return apiError(503, 'api_error', 'Sincronizzazione non disponibile su questo server.', headers)
    let body
    try {
      body = await readJson(request, MAX_SYNC_BYTES)
    } catch {
      return apiError(400, 'invalid_request_error', 'Dati di sincronizzazione non validi o troppo grandi.', headers)
    }
    const result = await sync(env.DB, user.id, body ?? {})
    waitUntil(touchUser(env.DB, user.id))
    return json(result, 200, headers)
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers })
  if (!env.ANTHROPIC_API_KEY) return apiError(500, 'api_error', 'Chiave Anthropic non configurata sul server.', headers)

  // Controllo del budget prima di spendere.
  if (env.DB) {
    const daily = Number(env.DAILY_BUDGET_USD ?? 5)
    const [mine, today] = await Promise.all([monthUsage(env.DB, user.id, monthKey()), dayUsage(env.DB, dayKey())])
    if (mine.costUsd >= budgetUsd) {
      return apiError(429, 'budget_exceeded', `Hai usato il budget di questo mese (${budgetUsd.toFixed(2).replace('.', ',')} $). L'assistente riparte il primo del mese prossimo.`, headers)
    }
    if (today.costUsd >= daily) return apiError(429, 'budget_exceeded', "L'app ha raggiunto il limite di spesa di oggi per tutti. Riprova domani.", headers)
  }

  const body = await request.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return apiError(400, 'invalid_request_error', 'Corpo della richiesta non valido.', headers)
  }
  const model = parsed?.model
  if (!PRICES[model]) return apiError(400, 'invalid_request_error', `Modello non ammesso: ${model}`, headers)
  const feature = (request.headers.get('x-ricettario-feature') ?? '').slice(0, 40) || null

  const upstream = await fetch(`https://api.anthropic.com${path}${url.search}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
      ...(request.headers.get('anthropic-beta') ? { 'anthropic-beta': request.headers.get('anthropic-beta') } : {}),
    },
    body,
  })
  const outHeaders = new Headers(upstream.headers)
  for (const [k, v] of Object.entries(headers)) outHeaders.set(k, v)
  outHeaders.set('x-ricettario-user', user.name)

  if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: outHeaders })

  const record = async (usage) => {
    if (!env.DB || !usage) return
    await logUsage(env.DB, { userId: user.id, feature, model, usage, costUsd: costOf(model, usage) })
    await touchUser(env.DB, user.id)
  }
  const type = upstream.headers.get('content-type') ?? ''
  if (type.includes('text/event-stream')) {
    const [toClient, toMeter] = upstream.body.tee()
    waitUntil(usageFromStream(toMeter).then(record))
    return new Response(toClient, { status: upstream.status, headers: outHeaders })
  }
  const text = await upstream.text()
  try {
    waitUntil(record(JSON.parse(text).usage))
  } catch {
    // risposta non JSON: niente da misurare
  }
  return new Response(text, { status: upstream.status, headers: outHeaders })
}
