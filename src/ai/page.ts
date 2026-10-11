import type { AiSettings } from './settings'

const MAX_HTML = 2_000_000

/**
 * Scarica il sorgente HTML di una pagina. Prova prima dal browser (funziona
 * solo se il sito permette le richieste cross-origin, raro), poi tramite il
 * proxy se configurato (rotta GET /fetch del worker). Restituisce `null` se
 * nessuna via è percorribile: l'import ricade sulla lettura fatta dall'AI.
 */
export async function fetchPageHtml(url: string, settings: AiSettings): Promise<string | null> {
  const direct = await tryFetch(url)
  if (direct !== null) return direct
  const proxy = settings.proxyUrl.trim().replace(/\/+$/, '')
  if (!proxy) return null
  return tryFetch(`${proxy}/fetch?url=${encodeURIComponent(url)}`, { 'x-api-key': settings.apiKey.trim() })
}

async function tryFetch(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) return null
    const html = await res.text()
    return html.length > MAX_HTML ? html.slice(0, MAX_HTML) : html
  } catch {
    return null
  }
}
