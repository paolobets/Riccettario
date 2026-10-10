import type { Quantity, Unit } from './model'
import { toDisplayUnit } from './units'

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
]

/** Formatta un numero: frazioni unicode per le misure "a cucchiaio", decimali altrimenti. */
export function formatAmount(amount: number, unit: Unit): string {
  if (!Number.isFinite(amount)) return '?'
  const useFractions =
    unit === 'cucchiaio' || unit === 'cucchiaino' || unit === 'tazza' || unit === 'bicchiere' || unit === 'pz' || unit === '' || unit === 'pizzico' || unit === 'fetta' || unit === 'spicchio'
  if (useFractions) {
    const whole = Math.floor(amount)
    const frac = amount - whole
    if (frac < 0.01) return String(whole)
    const match = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.04)
    if (match) return whole === 0 ? match[1] : `${whole} ${match[1]}`
  }
  const rounded = Math.round(amount * 100) / 100
  return rounded.toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

const UNIT_PLURALS: Partial<Record<Unit, [string, string]>> = {
  cucchiaio: ['cucchiaio', 'cucchiai'],
  cucchiaino: ['cucchiaino', 'cucchiaini'],
  tazza: ['tazza', 'tazze'],
  bicchiere: ['bicchiere', 'bicchieri'],
  pizzico: ['pizzico', 'pizzichi'],
  bustina: ['bustina', 'bustine'],
  foglia: ['foglia', 'foglie'],
  spicchio: ['spicchio', 'spicchi'],
  rametto: ['rametto', 'rametti'],
  fetta: ['fetta', 'fette'],
}

export function formatUnit(unit: Unit, amount: number): string {
  const plural = UNIT_PLURALS[unit]
  if (plural) return amount > 1 ? plural[1] : plural[0]
  return unit
}

/** "500 g", "1,5 kg", "2 cucchiai", "3" (senza unità), "q.b." */
export function formatQuantity(q: Quantity): string {
  if (q.unit === 'q.b.') return 'q.b.'
  const d = toDisplayUnit(q)
  const amount = formatAmount(d.amount, d.unit)
  const unit = formatUnit(d.unit, d.amount)
  return unit ? `${amount} ${unit}` : amount
}

/** "500 g di farina", "2 uova", "sale q.b." */
export function formatIngredientLine(name: string, q: Quantity | undefined): string {
  if (!q) return name
  if (q.unit === 'q.b.') return `${name} q.b.`
  const d = toDisplayUnit(q)
  if (d.unit === '' || d.unit === 'pz') return `${formatAmount(d.amount, d.unit)} ${name}`
  return `${formatQuantity(d)} di ${name}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function formatFactor(factor: number): string {
  return `×${(Math.round(factor * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}`
}
