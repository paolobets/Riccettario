import type { Pan, Recipe } from './model'

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
