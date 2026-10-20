/**
 * Punto d'ingresso per Cloudflare Workers con risorse statiche (la via che il
 * cruscotto propone oggi al posto di Pages): le richieste a /api vanno al
 * backend, tutto il resto è l'app compilata in dist/. La configurazione è in
 * wrangler.jsonc. Su Cloudflare Pages questo file non serve: lì lavora
 * functions/api/[[path]].js.
 */
import { handleProxy } from './functions/_lib/proxy.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleProxy(request, env, { prefix: '/api', waitUntil: (p) => ctx.waitUntil(p) })
    }
    return env.ASSETS.fetch(request)
  },
}
