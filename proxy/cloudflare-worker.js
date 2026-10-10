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
 */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

    const token = request.headers.get('x-api-key')
    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) {
      return new Response(JSON.stringify({ error: { message: 'Token del proxy non valido' } }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } })
    }

    const url = new URL(request.url)
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
