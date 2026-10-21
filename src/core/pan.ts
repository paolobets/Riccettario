import type { Pan, Recipe } from './model'
import { toBase } from './units'

/** Area in cm², quello che conta per spessore e cottura. */
export function panArea(pan: Pan): number {
  if (pan.shape === 'round') return Math.PI * (pan.diameterCm / 2) ** 2
  return pan.widthCm * pan.lengthCm
}

export function isValidPan(pan: Pan | undefined): pan is Pan {
  if (!pan) return false
  if (pan.shape === 'round') return Number.isFinite(pan.diameterCm) && pan.diameterCm > 0
  return Number.isFinite(pan.widthCm) && pan.widthCm > 0 && Number.isFinite(pan.lengthCm) && pan.lengthCm > 0
}

/**
 * Fattore per passare dalla teglia della ricetta a `target`: rapporto tra le aree,
 * così lo spessore resta quello pensato dall'autore. `null` se la ricetta non ha una teglia.
 */
export function factorFromPan(recipe: Recipe, target: Pan): number | null {
  if (!isValidPan(recipe.pan) || !isValidPan(target)) return null
  return panArea(target) / panArea(recipe.pan)
}

/** "tonda da 24 cm", "rettangolare 30×20 cm". */
export function formatPan(pan: Pan): string {
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString('it-IT')
  return pan.shape === 'round' ? `tonda da ${n(pan.diameterCm)} cm` : `rettangolare ${n(pan.widthCm)}×${n(pan.lengthCm)} cm`
}

/** Diametro della teglia tonda con la stessa area di una rettangolare (e viceversa), per i suggerimenti. */
export function equivalentRound(pan: Pan): number {
  return Math.round(2 * Math.sqrt(panArea(pan) / Math.PI))
}

/** Una o più teglie uguali: "2 teglie 15×25". */
export interface PanCount {
  pan: Pan
  count: number
}

/** Area totale di un insieme di teglie, in cm². */
export function totalPanArea(pans: PanCount[]): number {
  return pans.reduce((sum, p) => (isValidPan(p.pan) && p.count > 0 ? sum + panArea(p.pan) * p.count : sum), 0)
}

/**
 * Indice di carico: grammi di impasto per cm² di teglia (impasto = area × indice).
 * Valori medi delle schede professionali e dei calcolatori, da correggere a gusto (±10 %):
 * 1,1–1,3 kg per una teglia 60×40 di pizza in teglia, circa 500 g per una 30×40 di genovese.
 */
export const DOUGH_TYPES = {
  pizzaTeglia: { label: 'pizza in teglia', gPerCm2: 0.5 },
  pizzaAlta: { label: 'pizza alta e soffice', gPerCm2: 0.6 },
  napoletana: { label: 'pizza tonda napoletana', gPerCm2: 0.31 },
  romana: { label: 'pizza tonda sottile', gPerCm2: 0.25 },
  focaccia: { label: 'focaccia alta', gPerCm2: 0.6 },
  genovese: { label: 'focaccia genovese', gPerCm2: 0.42 },
  pinsa: { label: 'pinsa', gPerCm2: 0.4 },
} as const

export type DoughType = keyof typeof DOUGH_TYPES

/** Riconosce dal titolo o dai tag se la ricetta è un impasto da teglia, e di che tipo. */
export function doughTypeOf(recipe: Recipe): DoughType | undefined {
  const text = [recipe.title, ...recipe.tags].join(' ').toLowerCase()
  if (/\bpins/.test(text)) return 'pinsa'
  if (/genovese|fugass/.test(text)) return 'genovese'
  if (/focacc/.test(text)) return 'focaccia'
  if (/\bpizz/.test(text)) {
    if (/napolet/.test(text)) return 'napoletana'
    if (/sottile|scrocchiarella|romana tonda/.test(text)) return 'romana'
    return 'pizzaTeglia'
  }
  return undefined
}

/**
 * Peso dell'impasto in grammi: la resa se è una massa, altrimenti la somma degli
 * ingredienti in grammi o millilitri (1 ml ≈ 1 g), solo della sezione "Impasto" se c'è.
 * Restano fuori q.b., ingredienti fissi e facoltativi.
 */
export function doughWeight(recipe: Recipe): number | null {
  if (recipe.yield && recipe.yield.amount > 0) {
    const u = recipe.yield.unit.trim().toLowerCase()
    if (u === 'g') return recipe.yield.amount
    if (u === 'kg') return recipe.yield.amount * 1000
  }
  const inDough = recipe.ingredients.some((i) => i.section && /impast/i.test(i.section))
  let sum = 0
  for (const ing of recipe.ingredients) {
    if (!ing.quantity || ing.optional) continue
    if (inDough && !(ing.section && /impast/i.test(ing.section))) continue
    const mode = ing.scaling?.mode
    if (mode === 'toTaste' || mode === 'fixed') continue
    const q = toBase(ing.quantity)
    if (q.unit === 'g' || q.unit === 'ml') sum += q.amount
  }
  return sum > 0 ? sum : null
}

/**
 * Fattore per cuocere la ricetta nelle teglie scelte. Con la teglia della ricetta
 * vale il rapporto tra le aree; senza, servono i grammi di impasto per cm².
 */
export function factorFromPans(recipe: Recipe, pans: PanCount[], gPerCm2?: number): number | null {
  const area = totalPanArea(pans)
  if (area <= 0) return null
  if (isValidPan(recipe.pan)) return area / panArea(recipe.pan)
  const dough = doughWeight(recipe)
  if (!dough || !gPerCm2 || gPerCm2 <= 0) return null
  return (area * gPerCm2) / dough
}

/** Fattore per fare `count` pizze o panetti da `gramsEach` grammi di impasto. */
export function factorFromPieces(recipe: Recipe, count: number, gramsEach: number): number | null {
  const dough = doughWeight(recipe)
  if (!dough || !(count > 0) || !(gramsEach > 0)) return null
  return (count * gramsEach) / dough
}

/** Grammi di impasto della ricetta per cm² della sua teglia, se li si può calcolare. */
export function recipeDoughDensity(recipe: Recipe): number | null {
  const dough = doughWeight(recipe)
  if (!dough || !isValidPan(recipe.pan)) return null
  return dough / panArea(recipe.pan)
}

/** Come dividere `totalDough` grammi tra le teglie: in proporzione all'area, per singola teglia. */
export function splitDough(totalDough: number, pans: PanCount[]): { pan: Pan; count: number; grams: number }[] {
  const area = totalPanArea(pans)
  if (area <= 0) return []
  return pans
    .filter((p) => isValidPan(p.pan) && p.count > 0)
    .map((p) => ({ pan: p.pan, count: p.count, grams: (totalDough * panArea(p.pan)) / area }))
}

/** Lievitati cotti in stampi di carta venduti per peso del prodotto finito. */
export type MoldedType = 'panettone' | 'pandoro' | 'colomba'

export function moldedTypeOf(recipe: Recipe): MoldedType | undefined {
  const text = [recipe.title, ...recipe.tags].join(' ').toLowerCase()
  if (/panetton|veneziana/.test(text)) return 'panettone'
  if (/pandor/.test(text)) return 'pandoro'
  if (/colomb/.test(text)) return 'colomba'
  return undefined
}

/** Formati di stampo in commercio, in grammi di prodotto finito. */
export const MOLD_SIZES = [100, 250, 500, 750, 1000] as const

/** Impasto in più rispetto al peso dello stampo: copre il calo in cottura (1 kg → 1,1 kg di impasto). */
export const MOLD_OVERFILL = 0.1

/** Uno o più stampi uguali: "2 da 500 g". */
export interface MoldCount {
  grams: number
  count: number
}

/** Fattore per riempire gli stampi scelti, con l'impasto in più per il calo. */
export function factorFromMolds(recipe: Recipe, molds: MoldCount[], overfill = MOLD_OVERFILL): number | null {
  const dough = doughWeight(recipe)
  const needed = molds.reduce((sum, m) => (m.grams > 0 && m.count > 0 ? sum + m.grams * m.count : sum), 0) * (1 + overfill)
  if (!dough || needed <= 0) return null
  return needed / dough
}

/** Quanti stampi da `grams` si riempiono con `dough` grammi di impasto, e quanto avanza. */
export function moldsFromDough(dough: number, grams: number, overfill = MOLD_OVERFILL): { count: number; leftover: number } {
  const each = grams * (1 + overfill)
  if (!(dough > 0) || !(each > 0)) return { count: 0, leftover: 0 }
  // tolleranza dell'1 % per i fattori arrotondati nell'URL
  const count = Math.floor(dough / each + 0.01)
  return { count, leftover: Math.max(0, dough - count * each) }
}
