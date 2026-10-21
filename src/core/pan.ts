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

/** Grammi di impasto per cm² tipici: con la stessa altezza la cottura resta quella della ricetta. */
export const DOUGH_TYPES = {
  pizza: { label: 'pizza in teglia', gPerCm2: 0.55 },
  focaccia: { label: 'focaccia', gPerCm2: 0.6 },
  pinsa: { label: 'pinsa', gPerCm2: 0.4 },
} as const

export type DoughType = keyof typeof DOUGH_TYPES

/** Riconosce dal titolo o dai tag se la ricetta è un impasto da teglia. */
export function doughTypeOf(recipe: Recipe): DoughType | undefined {
  const text = [recipe.title, ...recipe.tags].join(' ').toLowerCase()
  if (/\bpins/.test(text)) return 'pinsa'
  if (/focacc/.test(text)) return 'focaccia'
  if (/\bpizz/.test(text)) return 'pizza'
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
