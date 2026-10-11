/**
 * Worker a sé stante, per chi tiene l'app su GitHub Pages o su un altro host.
 * Su Cloudflare Pages non serve: la stessa logica gira come funzione su /api
 * (functions/api/[[path]].js). Il codice è in functions/_lib/proxy.js.
 *
 * Deploy:
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler deploy proxy/cloudflare-worker.js --name ricettario-proxy
 *   3. wrangler secret put ANTHROPIC_API_KEY      (la chiave vera)
 *   4. wrangler secret put USERS                  ({"paolo":"password-lunga", "anna":"altra-password"})
 *      oppure, per una sola persona: wrangler secret put PROXY_TOKEN
 *   5. wrangler secret put ADMIN_TOKEN            (per leggere i consumi di tutti)
 *   6. per la misura dei consumi: wrangler kv namespace create USAGE, poi il binding "USAGE"
 *      nel file wrangler.toml o nel cruscotto del worker.
 *   7. nell'app, Impostazioni → URL proxy: https://ricettario-proxy.<tuo-sub>.workers.dev
 *      e, nel campo chiave, la propria password.
 */
import { handleProxy } from '../functions/_lib/proxy.js'

export default {
  fetch: (request, env, ctx) => handleProxy(request, env, { prefix: '', waitUntil: (p) => ctx.waitUntil(p) }),
}
