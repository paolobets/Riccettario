/**
 * Backend del Ricettario: proxy verso l'API di Anthropic, utenti con password
 * personale, budget, misura dei consumi per richiesta e sincronizzazione
 * dell'archivio tra dispositivi. Dati su D1 (binding `DB`).
 *
 * Usato in due modi, con lo stesso codice:
 * - come funzione di Cloudflare Pages su /api (functions/api/[[path]].js), insieme all'app;
 * - come worker a sé (proxy/cloudflare-worker.js), per chi tiene l'app su GitHub Pages.
 *
 * Variabili e segreti:
 *   ANTHROPIC_API_KEY   la chiave vera (segreto)
 *   ADMIN_TOKEN         password dell'amministratore per le rotte /admin (segreto)
 *   USERS               facoltativo, JSON {"nome": "password"}: utenti creati in D1 alla prima
 *                       richiesta con quella password; senza D1 è l'unico elenco utenti (segreto)
 *   PROXY_TOKEN         compatibilità: una sola password, utente "default" (segreto, facoltativo)
 *   MONTHLY_BUDGET_USD  budget per utente al mese se l'utente non ne ha uno proprio, default 3
 *   DAILY_BUDGET_USD    tetto giornaliero per tutti gli utenti insieme, default 5
 *   ALLOWED_ORIGIN      origine ammessa per il CORS, default *
 * Binding:
 *   DB                  database D1. Senza, funzionano solo proxy e /fetch: niente budget,
 *                       misura né sincronizzazione.
 *
 * Rotte (relative al prefisso, "/api" su Pages, "" sul worker):
 *   GET  /health                   stato
 *   GET  /me                       chi sono, piano, budget, consumo del mese, righe sincronizzate
 *   GET  /fetch?url=               sorgente HTML di una pagina di ricetta (per l'import JSON-LD)
 *   POST /sync                     {since, recipes, sessions, chats} → {now, recipes, sessions, chats}
 *   POST /v1/messages              inoltro ad Anthropic con controllo del budget e misura
 *   GET  /admin/usage?month=       consumi del mese per utente e totale di oggi (x-admin-token)
 *   GET  /admin/users              elenco utenti
 *   POST /admin/users              {name, plan?, budgetUsd?, password?} → utente creato con la password
 *   POST /admin/users/:name/reset  nuova password
 *   POST /admin/users/:name/disable | /enable
 */
import { counts, createUser, dayUsage, ensureSchema, findUserByName, findUserByToken, listUsers, logUsage, monthUsage, monthUsageByUser, resetPassword, setDisabled, sync, touchUser } from './db.js'

/** Prezzi in USD per milione di token, come in src/ai/usage.ts. */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
const MAX_PAGE_BYTES = 2_000_000
const MAX_SYNC_BYTES = 8_000_000

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
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
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

/**
 * Riconosce chi chiama dalla password. Con D1 cerca in tabella; se la password è
 * nel segreto USERS e l'utente non esiste ancora, lo crea (così i primi utenti
 * si caricano senza comandi). Senza D1 vale solo il segreto USERS.
 */
async function authenticate(request, env) {
  const token = request.headers.get('x-api-key')
  if (!token) return null
  if (env.DB) {
    await ensureSchema(env.DB)
    const found = await findUserByToken(env.DB, token)
    if (found) return { id: found.id, name: found.name, plan: found.plan, budgetUsd: found.budget_usd }
    const name = envUserFor(env, token)
    if (!name) return null
    const existing = await findUserByName(env.DB, name)
    if (existing) return null // utente già in tabella con un'altra password: vince la tabella
    const created = await createUser(env.DB, { name, password: token })
    return { id: created.id, name, plan: created.plan, budgetUsd: null }
  }
  const name = envUserFor(env, token)
  return name ? { id: name, name, plan: 'tester', budgetUsd: null } : null
}

function isAdmin(request, env) {
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

async function adminRoutes(request, env, path, headers) {
  if (!isAdmin(request, env)) return apiError(401, 'authentication_error', 'Password amministratore non valida', headers)
  if (!env.DB) return json({ error: 'Binding D1 "DB" assente: utenti e consumi non disponibili' }, 503, headers)
  await ensureSchema(env.DB)
  const url = new URL(request.url)

  if (request.method === 'GET' && path === '/admin/usage') {
    const month = url.searchParams.get('month') ?? monthKey()
    return json({ month, defaultBudgetUsd: Number(env.MONTHLY_BUDGET_USD ?? 3), users: await monthUsageByUser(env.DB, month), today: await dayUsage(env.DB, dayKey()) }, 200, headers)
  }
  if (request.method === 'GET' && path === '/admin/users') return json({ users: await listUsers(env.DB) }, 200, headers)
  if (request.method === 'POST' && path === '/admin/users') {
    let body
    try {
      body = await readJson(request, 10_000)
    } catch {
      return apiError(400, 'invalid_request_error', 'Corpo non valido', headers)
    }
    const name = String(body?.name ?? '')
      .trim()
      .toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(name)) return apiError(400, 'invalid_request_error', 'Nome non valido: lettere minuscole, cifre, punto, trattino, da 2 a 31 caratteri', headers)
    if (await findUserByName(env.DB, name)) return apiError(409, 'invalid_request_error', `L'utente ${name} esiste già`, headers)
    const user = await createUser(env.DB, { name, password: body?.password || undefined, plan: body?.plan || 'tester', budgetUsd: body?.budgetUsd ?? null })
    return json({ ...user, note: 'Conserva la password: non viene mostrata di nuovo.' }, 201, headers)
  }
  const m = path.match(/^\/admin\/users\/([a-z0-9._-]+)\/(reset|disable|enable)$/)
  if (request.method === 'POST' && m) {
    const [, name, action] = m
    if (action === 'reset') {
      const password = await resetPassword(env.DB, name)
      return password ? json({ name, password }, 200, headers) : apiError(404, 'not_found_error', 'Utente non trovato', headers)
    }
    const ok = await setDisabled(env.DB, name, action === 'disable')
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
    return json({ ok: true, database: Boolean(env.DB), key: Boolean(env.ANTHROPIC_API_KEY), admin: Boolean(env.ADMIN_TOKEN), envUsers: Object.keys(envUsers(env)).length }, 200, headers)
  }
  if (path.startsWith('/admin/')) return adminRoutes(request, env, path, headers)

  const user = await authenticate(request, env)
  if (!user) return apiError(401, 'authentication_error', 'Password non valida: controlla quella inserita in Impostazioni.', headers)
  const budgetUsd = user.budgetUsd ?? Number(env.MONTHLY_BUDGET_USD ?? 3)

  if (request.method === 'GET' && path === '/me') {
    const usage = env.DB ? await monthUsage(env.DB, user.id, monthKey()) : null
    const stored = env.DB ? await counts(env.DB, user.id) : null
    return json({ user: user.name, plan: user.plan, month: monthKey(), budgetUsd, usage, stored, sync: Boolean(env.DB) }, 200, headers)
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
