/**
 * Lettura dei dati strutturati schema.org/Recipe (JSON-LD) che quasi tutti i
 * siti di ricette espongono. Niente DOM: si estraggono i blocchi
 * <script type="application/ld+json"> con un'espressione regolare, così il
 * modulo gira anche nei test in Node.
 *
 * Il risultato è un testo pulito (titolo, porzioni, ingredienti, passaggi)
 * da dare all'import da testo: 1-2k token invece dei 10-30k di una pagina
 * intera letta dall'AI.
 */

export interface SchemaRecipeText {
  title: string
  text: string
  servings?: number
  source?: string
}

type Json = Record<string, unknown>

const SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

/** Tutti gli oggetti JSON-LD presenti nell'HTML; i blocchi non validi vengono ignorati. */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = []
  for (const m of html.matchAll(SCRIPT_RE)) {
    const raw = (m[1] ?? '').trim()
    if (!raw) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      // alcuni siti mettono commenti HTML o virgole finali: proviamo a ripulire il minimo
      try {
        out.push(JSON.parse(raw.replace(/<!--[\s\S]*?-->/g, '').replace(/,\s*([}\]])/g, '$1')))
      } catch {
        // blocco non interpretabile
      }
    }
  }
  return out
}

function isRecipeType(t: unknown): boolean {
  if (typeof t === 'string') return t === 'Recipe' || t.endsWith('/Recipe')
  if (Array.isArray(t)) return t.some(isRecipeType)
  return false
}

/** Cerca un nodo di tipo Recipe, anche dentro @graph, array e nodi annidati (mainEntity). */
export function findRecipe(nodes: unknown[]): Json | null {
  const queue: unknown[] = [...nodes]
  let guard = 0
  while (queue.length > 0 && guard++ < 500) {
    const n = queue.shift()
    if (!n || typeof n !== 'object') continue
    if (Array.isArray(n)) {
      queue.push(...n)
      continue
    }
    const obj = n as Json
    if (isRecipeType(obj['@type'])) return obj
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'about']) {
      if (obj[key]) queue.push(obj[key])
    }
  }
  return null
}

function text(v: unknown): string {
  if (typeof v === 'string') return decodeEntities(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ')
  if (v && typeof v === 'object') {
    const o = v as Json
    return text(o['name'] ?? o['text'] ?? o['@value'] ?? '')
  }
  return ''
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
}

/** "4 porzioni", "Serves 6", ["8", "8 persone"] → 4, 6, 8. */
export function parseServings(v: unknown): number | undefined {
  const s = text(v)
  const m = s.match(/\d+(?:[.,]\d+)?/)
  if (!m) return undefined
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : undefined
}

/** Passaggi da recipeInstructions: stringa, lista di stringhe, HowToStep, HowToSection con itemListElement. */
export function instructionLines(v: unknown, section?: string): string[] {
  if (!v) return []
  if (typeof v === 'string') {
    return decodeEntities(v)
      .replace(/<br\s*\/?>|<\/(p|li|div)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (section ? `[${section}] ${l}` : l))
  }
  if (Array.isArray(v)) return v.flatMap((x) => instructionLines(x, section))
  if (typeof v === 'object') {
    const o = v as Json
    const type = String(o['@type'] ?? '')
    if (type.includes('HowToSection') || o['itemListElement']) {
      const name = text(o['name'])
      return instructionLines(o['itemListElement'], name || section)
    }
    const raw = o['text'] ?? o['name']
    if (typeof raw === 'string') return instructionLines(raw, section)
    const t = text(raw)
    return t ? [section ? `[${section}] ${t}` : t] : []
  }
  return []
}

/** Converte il nodo Recipe in un testo compatto per l'import da testo. */
export function recipeToText(r: Json, url?: string): SchemaRecipeText | null {
  const title = text(r['name'] ?? r['headline'])
  const ingredients = ([] as unknown[]).concat(r['recipeIngredient'] ?? r['ingredients'] ?? []).map(text).filter(Boolean)
  const steps = instructionLines(r['recipeInstructions'])
  if (!title || ingredients.length === 0) return null
  const servings = parseServings(r['recipeYield'])
  const description = text(r['description'])
  const author = text(r['author'])
  const lines: string[] = [title]
  if (description) lines.push(description)
  if (servings) lines.push(`Porzioni: ${servings}`)
  else if (r['recipeYield']) lines.push(`Resa: ${text(r['recipeYield'])}`)
  const times = [
    ['Preparazione', r['prepTime']],
    ['Cottura', r['cookTime']],
    ['Totale', r['totalTime']],
  ]
    .filter(([, v]) => typeof v === 'string' && v)
    .map(([k, v]) => `${k}: ${humanDuration(v as string)}`)
  if (times.length) lines.push(times.join(', '))
  lines.push('', 'Ingredienti:', ...ingredients.map((i) => `- ${i}`))
  if (steps.length) lines.push('', 'Preparazione:', ...steps.map((s, i) => `${i + 1}. ${s}`))
  const source = [author, url].filter(Boolean).join(', ')
  if (source) lines.push('', `Fonte: ${source}`)
  return { title, text: lines.join('\n'), servings, source: source || undefined }
}

/** "PT1H30M" → "1 h 30 min"; lascia stare le stringhe non ISO. */
export function humanDuration(iso: string): string {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m || (!m[1] && !m[2] && !m[3])) return iso
  const parts: string[] = []
  if (m[1]) parts.push(`${m[1]} g`)
  if (m[2]) parts.push(`${m[2]} h`)
  if (m[3]) parts.push(`${m[3]} min`)
  return parts.join(' ')
}

/** Dal sorgente HTML di una pagina al testo della ricetta, o `null` se la pagina non espone dati strutturati. */
export function recipeTextFromHtml(html: string, url?: string): SchemaRecipeText | null {
  const node = findRecipe(extractJsonLd(html))
  return node ? recipeToText(node, url) : null
}
