/**
 * Proxy minimale per non esporre la chiave API nel browser.
 * Deploy su Cloudflare Workers (piano gratuito):
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler deploy proxy/cloudflare-worker.js --name ricettario-proxy
 *   3. wrangler secret put ANTHROPIC_API_KEY      (incolla la chiave)
 *   4. wrangler secret put PROXY_TOKEN            (una password a tua scelta)
 *   5. nell'app, Impostazioni → URL proxy: https://ricettario-proxy.<tuo-sub>.workers.dev
 *      e Chiave API: la password scelta al punto 4.
 * Il worker verifica la password, aggiunge la vera chiave e inoltra la richiesta ad Anthropic.
 * La rotta GET /fetch?url=… scarica il sorgente di una pagina di ricetta per conto dell'app
 * (il browser non può per via del CORS): l'app ne legge i dati JSON-LD e risparmia la lettura via AI.
 */
const MAX_PAGE_BYTES = 2_000_000
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const token = request.headers.get('x-api-key')
    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) {
      return new Response(JSON.stringify({ error: { message: 'Token del proxy non valido' } }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } })
    }

    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/fetch') return fetchPage(url.searchParams.get('url'), cors)
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

    const upstream = new Request(`https://api.anthropic.com${url.pathname}${url.search}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
        ...(request.headers.get('anthropic-beta') ? { 'anthropic-beta': request.headers.get('anthropic-beta') } : {}),
      },
      body: request.body,
    })
    const res = await fetch(upstream)
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(cors)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  },
}

/** Scarica una pagina HTML pubblica e la restituisce com'è, con un limite di dimensione. */
async function fetchPage(target, cors) {
  let parsed
  try {
    parsed = new URL(target ?? '')
  } catch {
    return new Response('URL non valido', { status: 400, headers: cors })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return new Response('Solo http e https', { status: 400, headers: cors })
  const res = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Ricettario/1.0)', accept: 'text/html,application/xhtml+xml' },
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) return new Response('Pagina non leggibile', { status: 502, headers: cors })
  const html = (await res.text()).slice(0, MAX_PAGE_BYTES)
  return new Response(html, { status: 200, headers: { ...cors, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
