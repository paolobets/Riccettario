import type { Quantity, Unit } from './model'

/** Unità per cui ha senso un arrotondamento "da cucina". */
export function isCountUnit(unit: Unit): boolean {
  return unit === 'pz' || unit === '' || unit === 'bustina' || unit === 'foglia' || unit === 'spicchio' || unit === 'rametto' || unit === 'fetta'
}

export function isMassUnit(unit: Unit): boolean {
  return unit === 'g' || unit === 'kg'
}

export function isVolumeUnit(unit: Unit): boolean {
  return unit === 'ml' || unit === 'l'
}

/** Porta una quantità nell'unità base (g, ml) per fare i conti. */
export function toBase(q: Quantity): Quantity {
  if (q.unit === 'kg') return { amount: q.amount * 1000, unit: 'g' }
  if (q.unit === 'l') return { amount: q.amount * 1000, unit: 'ml' }
  return q
}

/** Sceglie l'unità più leggibile: 1500 g → 1,5 kg. */
export function toDisplayUnit(q: Quantity): Quantity {
  if (q.unit === 'g' && q.amount >= 1000) return { amount: q.amount / 1000, unit: 'kg' }
  if (q.unit === 'ml' && q.amount >= 1000) return { amount: q.amount / 1000, unit: 'l' }
  return q
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

/**
 * Arrotonda a una misura realizzabile in cucina. Lavora sull'unità base.
 * - grammi/ml: 0,5 sotto i 10, 1 sotto i 100, 5 sotto i 1000, 10 oltre
 * - cucchiai e cucchiaini: quarti
 * - tazze e bicchieri: ottavi
 * - pizzichi e conteggi: mezzi
 */
export function roundPractical(q: Quantity): Quantity {
  const base = toBase(q)
  const a = base.amount
  if (a === 0) return { amount: 0, unit: base.unit }
  let step: number
  switch (base.unit) {
    case 'g':
    case 'ml':
      step = a < 10 ? 0.5 : a < 100 ? 1 : a < 1000 ? 5 : 10
      break
    case 'cucchiaio':
    case 'cucchiaino':
      step = 0.25
      break
    case 'tazza':
    case 'bicchiere':
      step = 0.125
      break
    default:
      step = 0.5
  }
  const rounded = Math.max(step, roundTo(a, step))
  // evita 2.9999999
  return { amount: Number(rounded.toFixed(4)), unit: base.unit }
}

/** Scarto relativo tra valore calcolato e valore arrotondato. */
export function roundingDelta(exact: Quantity, rounded: Quantity): number {
  const e = toBase(exact).amount
  const r = toBase(rounded).amount
  if (e === 0) return 0
  return (r - e) / e
}
