/**
 * Proxy verso l'API di Anthropic con password personali e misura dei costi per utente.
 *
 * Usato in due modi, con lo stesso codice:
 * - come funzione di Cloudflare Pages su /api (functions/api/[[path]].js), insieme all'app;
 * - come worker a sé (proxy/cloudflare-worker.js), per chi tiene l'app su GitHub Pages.
 *
 * Variabili e segreti:
 *   ANTHROPIC_API_KEY   la chiave vera (segreto)
 *   USERS               JSON {"nome": "password", ...}: una password per persona (segreto)
 *   PROXY_TOKEN         compatibilità: una sola password, utente "default" (segreto, facoltativo)
 *   ADMIN_TOKEN         password per GET /admin/usage (segreto)
 *   MONTHLY_BUDGET_USD  budget per utente al mese, default 3
 *   DAILY_BUDGET_USD    tetto giornaliero per tutti gli utenti insieme, default 5
 *   ALLOWED_ORIGIN      origine ammessa per il CORS, default *
 * Binding KV:
 *   USAGE               dove si sommano i consumi (senza, la misura è disattivata)
 *
 * Rotte (relative al prefisso, "/api" su Pages, "" sul worker):
 *   GET  /health                stato
 *   GET  /me                    consumo del mese di chi chiama e budget
 *   GET  /fetch?url=            sorgente HTML di una pagina di ricetta (per l'import JSON-LD)
 *   GET  /admin/usage?month=    consumi di tutti gli utenti (x-admin-token)
 *   POST /v1/messages           inoltro ad Anthropic con controllo del budget e misura
 */

/** Prezzi in USD per milione di token, come in src/ai/usage.ts. */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
const MAX_PAGE_BYTES = 2_000_000
const MONTH_TTL = 400 * 86400
const DAY_TTL = 7 * 86400

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
    'Access-Control-Allow-Headers': 'content-type, x-api-key, x-admin-token, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access',
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

/** Errore nel formato dell'API, così l'SDK dell'app lo mostra con il messaggio giusto. */
function apiError(status, type, message, headers) {
  return json({ type: 'error', error: { type, message } }, status, headers)
}

function users(env) {
  const map = {}
  if (env.USERS) {
    try {
      Object.assign(map, JSON.parse(env.USERS))
    } catch {
      // USERS non è JSON valido: nessun utente oltre a default
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

function authenticate(request, env) {
  const token = request.headers.get('x-api-key')
  if (!token) return null
  for (const [name, pw] of Object.entries(users(env))) if (sameSecret(pw, token)) return name
  return null
}

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7)
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
const empty = () => ({ costUsd: 0, requests: 0, inputTokens: 0, outputTokens: 0 })

async function readUsage(env, key) {
  if (!env.USAGE) return null
  return (await env.USAGE.get(key, 'json')) ?? empty()
}

async function addUsage(env, key, delta, ttl) {
  if (!env.USAGE) return
  const cur = (await env.USAGE.get(key, 'json')) ?? empty()
  cur.costUsd += delta.costUsd
  cur.requests += 1
  cur.inputTokens += delta.inputTokens
  cur.outputTokens += delta.outputTokens
  cur.updatedAt = new Date().toISOString()
  await env.USAGE.put(key, JSON.stringify(cur), { expirationTtl: ttl })
}

async function record(env, user, model, usage) {
  const delta = {
    costUsd: costOf(model, usage),
    inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
  }
  await Promise.all([addUsage(env, `u:${user}:${monthKey()}`, delta, MONTH_TTL), addUsage(env, `g:${dayKey()}`, delta, DAY_TTL)])
}

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

/**
 * Gestisce una richiesta. `prefix` è la parte di percorso da togliere ("/api" su Pages),
 * `waitUntil` permette di scrivere i consumi dopo aver già risposto.
 */
export async function handleProxy(request, env, { prefix = '', waitUntil = (p) => p } = {}) {
  const headers = cors(env)
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  const url = new URL(request.url)
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || '/' : url.pathname

  if (request.method === 'GET' && path === '/health') {
    return json({ ok: true, users: Object.keys(users(env)).length, metering: Boolean(env.USAGE), key: Boolean(env.ANTHROPIC_API_KEY) }, 200, headers)
  }

  if (request.method === 'GET' && path === '/admin/usage') {
    if (!env.ADMIN_TOKEN || !sameSecret(request.headers.get('x-admin-token') ?? '', env.ADMIN_TOKEN)) return apiError(401, 'authentication_error', 'Password amministratore non valida', headers)
    if (!env.USAGE) return json({ month: monthKey(), users: [], note: 'Binding KV USAGE assente: misura disattivata' }, 200, headers)
    const month = url.searchParams.get('month') ?? monthKey()
    const list = await env.USAGE.list({ prefix: 'u:' })
    const rows = []
    for (const k of list.keys) {
      const [, name, m] = k.name.split(':')
      if (m !== month) continue
      rows.push({ user: name, ...(await env.USAGE.get(k.name, 'json')) })
    }
    rows.sort((a, b) => b.costUsd - a.costUsd)
    const today = await readUsage(env, `g:${dayKey()}`)
    return json({ month, budgetUsd: Number(env.MONTHLY_BUDGET_USD ?? 3), users: rows, today }, 200, headers)
  }

  const user = authenticate(request, env)
  if (!user) return apiError(401, 'authentication_error', 'Password non valida: controlla quella inserita in Impostazioni.', headers)

  if (request.method === 'GET' && path === '/me') {
    const usage = await readUsage(env, `u:${user}:${monthKey()}`)
    return json({ user, month: monthKey(), budgetUsd: Number(env.MONTHLY_BUDGET_USD ?? 3), usage }, 200, headers)
  }

  if (request.method === 'GET' && path === '/fetch') return fetchPage(url.searchParams.get('url'), env)

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers })
  if (!env.ANTHROPIC_API_KEY) return apiError(500, 'api_error', 'Chiave Anthropic non configurata sul proxy.', headers)

  // Controllo del budget prima di spendere.
  const monthly = Number(env.MONTHLY_BUDGET_USD ?? 3)
  const daily = Number(env.DAILY_BUDGET_USD ?? 5)
  const [mine, today] = await Promise.all([readUsage(env, `u:${user}:${monthKey()}`), readUsage(env, `g:${dayKey()}`)])
  if (mine && mine.costUsd >= monthly) {
    return apiError(429, 'budget_exceeded', `Hai usato il budget di questo mese (${monthly.toFixed(2).replace('.', ',')} $). L'assistente riparte il primo del mese prossimo.`, headers)
  }
  if (today && today.costUsd >= daily) {
    return apiError(429, 'budget_exceeded', "L'app ha raggiunto il limite di spesa di oggi per tutti. Riprova domani.", headers)
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
  outHeaders.set('x-ricettario-user', user)

  if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: outHeaders })

  const type = upstream.headers.get('content-type') ?? ''
  if (type.includes('text/event-stream')) {
    const [toClient, toMeter] = upstream.body.tee()
    waitUntil(usageFromStream(toMeter).then((usage) => record(env, user, model, usage)))
    return new Response(toClient, { status: upstream.status, headers: outHeaders })
  }
  const text = await upstream.text()
  try {
    const usage = JSON.parse(text).usage
    if (usage) waitUntil(record(env, user, model, usage))
  } catch {
    // risposta non JSON: niente da misurare
  }
  return new Response(text, { status: upstream.status, headers: outHeaders })
}
