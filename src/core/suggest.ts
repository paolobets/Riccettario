/**
 * "Cosa preparo?": classifica le ricette del ricettario in base al tempo
 * disponibile, a quello che c'è in casa e a quanto tempo fa sono state cucinate.
 * Dominio puro: niente React, niente Dexie, niente casualità (l'interfaccia
 * decide come scorrere i risultati).
 */
import type { Recipe } from './model'
import { activeDuration } from './steps'

export interface CookedRecord {
  recipeId: string
  /** Assente se la cottura non è stata conclusa. */
  finishedAt?: string
}

export interface SuggestOptions {
  /** Minuti ai fornelli al massimo; assente = nessun limite. */
  maxActiveMinutes?: number
  /** Testo libero con quello che c'è in casa: "zucchine, uova, pecorino". */
  pantry?: string
  /** Tag che escludono una ricetta dalla scelta (basi, salse…). */
  excludeTags?: string[]
  now?: Date
}

export interface Suggestion {
  recipe: Recipe
  score: number
  /** Nomi degli ingredienti della ricetta che corrispondono alla dispensa. */
  matched: string[]
  activeMinutes: number
  /** Giorni dall'ultima cottura conclusa, `null` se mai cucinata. */
  daysSinceCooked: number | null
}

const STOP = new Set(['di', 'del', 'della', 'dei', 'delle', 'e', 'o', 'con', 'senza', 'un', 'una', 'il', 'la', 'lo', 'gli', 'le', 'in', 'a', 'al', 'alla', 'per', 'da', 'qb'])

/** Radice grossolana per far combaciare singolare e plurale: "zucchine" e "zucchina" → "zucchin". */
export function stem(word: string): string {
  const w = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
  return w.length >= 4 ? w.slice(0, w.length - 1) : w
}

/** Parole significative di un testo libero, già ridotte alla radice e senza doppioni. */
export function pantryWords(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[\s,;.]+/)) {
    const w = raw.toLowerCase().replace(/[^a-zà-ú]/g, '')
    if (w.length < 3 || STOP.has(w)) continue
    const s = stem(w)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

/** Ingredienti della ricetta che corrispondono ad almeno una parola della dispensa. */
export function matchedIngredients(recipe: Recipe, words: string[]): string[] {
  if (words.length === 0) return []
  return recipe.ingredients
    .filter((ing) => {
      const parts = ing.name.split(/[\s,()]+/).map(stem).filter((p) => p.length >= 3)
      return parts.some((p) => words.includes(p))
    })
    .map((ing) => ing.name)
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
}

/** Ultima cottura conclusa per ricetta, in giorni da oggi. */
export function lastCookedDays(cooked: CookedRecord[], now: Date): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of cooked) {
    if (!c.finishedAt) continue
    const d = daysSince(c.finishedAt, now)
    const prev = map.get(c.recipeId)
    if (prev === undefined || d < prev) map.set(c.recipeId, d)
  }
  return map
}

/**
 * Ordina le ricette dalla più adatta. Il punteggio premia gli ingredienti
 * già in casa (3 punti ciascuno) e le ricette non cucinate di recente
 * (mai o da più di due settimane: +2; ultima settimana: 0; ultimi tre giorni: -3).
 * Le ricette oltre il limite di tempo vengono escluse, non penalizzate.
 */
export function rankSuggestions(recipes: Recipe[], cooked: CookedRecord[], opts: SuggestOptions = {}): Suggestion[] {
  const now = opts.now ?? new Date()
  const words = pantryWords(opts.pantry ?? '')
  const last = lastCookedDays(cooked, now)
  const excluded = new Set((opts.excludeTags ?? []).map((t) => t.toLowerCase()))
  const out: Suggestion[] = []
  for (const recipe of recipes) {
    if (recipe.tags.some((t) => excluded.has(t.toLowerCase()))) continue
    const activeMinutes = activeDuration(recipe.steps)
    if (opts.maxActiveMinutes !== undefined && activeMinutes > opts.maxActiveMinutes) continue
    const matched = matchedIngredients(recipe, words)
    const days = last.get(recipe.id) ?? null
    const recency = days === null || days >= 14 ? 2 : days >= 7 ? 0 : days >= 3 ? -1 : -3
    out.push({ recipe, score: matched.length * 3 + recency, matched, activeMinutes, daysSinceCooked: days })
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title, 'it'))
}
