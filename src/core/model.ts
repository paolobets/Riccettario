/**
 * Modello dati della ricetta.
 *
 * Ispirato alla specifica Soustack (stack `quantified`, `structured`, `scaling@1`,
 * `timed`) con un'estensione nostra: la modalità `sublinear` per sale, spezie e
 * lieviti, e la scalatura "pivot" (si cambia un ingrediente e il resto segue).
 */

/** Unità di misura supportate. La stringa vuota indica "senza unità" (es. 2 uova). */
export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'cucchiaio'
  | 'cucchiaino'
  | 'tazza'
  | 'bicchiere'
  | 'pizzico'
  | 'pz'
  | 'bustina'
  | 'foglia'
  | 'spicchio'
  | 'rametto'
  | 'fetta'
  | 'q.b.'
  | ''

export interface Quantity {
  amount: number
  unit: Unit
}

/** Regola di scalatura di un ingrediente. */
export type ScalingRule =
  /** Moltiplicato per il fattore (default). */
  | { mode: 'linear' }
  /** Non cambia mai (1 foglia di alloro, la teglia). */
  | { mode: 'fixed' }
  /** Scala a incrementi interi: uova, fette, spicchi. */
  | {
      mode: 'discrete'
      step?: number
      rounding?: 'nearest' | 'ceil' | 'floor'
      min?: number
      max?: number
    }
  /** Solo informativo, non si scala meccanicamente ("sale q.b."). */
  | { mode: 'toTaste' }
  /** Percentuale rispetto a un ingrediente base (percentuali del panettiere). */
  | { mode: 'bakersPercent'; percent: number; of: string }
  /**
   * Cresce meno che linearmente: quantità × fattore^esponente.
   * Con esponente 0.8 raddoppiare la ricetta porta il sale a ~1.74×.
   */
  | { mode: 'sublinear'; exponent?: number }

export type ScalingMode = ScalingRule['mode']

export interface Ingredient {
  /** Identificatore stabile, usato nei passaggi come `{id}`. */
  id: string
  name: string
  quantity?: Quantity
  /** Nota libera: "a temperatura ambiente", "tritato". */
  note?: string
  scaling?: ScalingRule
  /** Sezione di appartenenza (impasto, farcitura, ...). */
  section?: string
  optional?: boolean
}

export type StepType = 'prep' | 'cook' | 'rest' | 'wait' | 'serve'

export interface Timer {
  minutes: number
  label?: string
}

export interface Step {
  id: string
  /**
   * Testo del passaggio. I riferimenti agli ingredienti si scrivono `{id}`
   * (resa: "500 g di farina") oppure `{id|nome}` (resa: solo "farina").
   */
  text: string
  type?: StepType
  /** Durata indicativa in minuti, mostrata nella panoramica. */
  durationMin?: number
  temperatureC?: number
  equipment?: string[]
  /** Timer avviabile in modalità assistita. I timer non scalano. */
  timer?: Timer
  section?: string
  /** Passaggio che può iniziare mentre un altro è in corso (es. durante un riposo). */
  parallelWith?: string
}

export interface Yield {
  amount: number
  unit: string
}

/** Teglia o stampo per cui è scritta la ricetta: cambiandola il fattore è il rapporto tra le aree. */
export type Pan = { shape: 'round'; diameterCm: number } | { shape: 'rect'; widthCm: number; lengthCm: number }

export interface Recipe {
  id: string
  title: string
  description?: string
  /** Porzioni per cui sono scritte le quantità. */
  servings: number
  /** Resa totale di riferimento (es. 800 g di impasto), opzionale. */
  yield?: Yield
  /** Teglia di riferimento, opzionale: abilita la scalatura per teglia. */
  pan?: Pan
  /** Segnata con la stella. */
  favorite?: boolean
  tags: string[]
  sections?: string[]
  ingredients: Ingredient[]
  steps: Step[]
  notes?: string
  source?: string
  createdAt: string
  updatedAt: string
}

export const SCALING_MODE_LABELS: Record<ScalingMode, string> = {
  linear: 'Lineare',
  sublinear: 'Sub-lineare (sale, spezie, lievito)',
  discrete: 'A pezzi interi (uova, fette)',
  fixed: 'Fissa (non cambia)',
  toTaste: 'Quanto basta',
  bakersPercent: '% del panettiere',
}

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  prep: 'Preparazione',
  cook: 'Cottura',
  rest: 'Riposo',
  wait: 'Attesa',
  serve: 'Servizio',
}

export const UNITS: Unit[] = [
  'g',
  'kg',
  'ml',
  'l',
  'cucchiaio',
  'cucchiaino',
  'tazza',
  'bicchiere',
  'pizzico',
  'pz',
  'bustina',
  'foglia',
  'spicchio',
  'rametto',
  'fetta',
  'q.b.',
  '',
]

/** Genera un id leggibile a partire dal nome: "Farina 00" → "farina-00". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return prefix ? `${prefix}-${rand}` : rand
}
