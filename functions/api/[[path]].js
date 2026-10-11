import { handleProxy } from '../_lib/proxy.js'

/** Cloudflare Pages: tutto ciò che sta sotto /api passa dal proxy, sulla stessa origine dell'app. */
export const onRequest = (context) => handleProxy(context.request, context.env, { prefix: '/api', waitUntil: (p) => context.waitUntil(p) })
