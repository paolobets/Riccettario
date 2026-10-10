/**
 * Motore di scalatura. Deterministico, senza dipendenze dall'interfaccia,
 * funziona offline. L'AI, quando arriverà, lavora sopra questo livello.
 */
import type { Ingredient, Quantity, Recipe, ScalingRule } from './model'
import { roundPractical, roundingDelta, toBase } from './units'

export interface ScaledIngredient extends Ingredient {
  /** Quantità originale (nell'unità scritta nella ricetta). */
  original?: Quantity
  /** Quantità calcolata prima dell'arrotondamento, in unità base. */
  exact?: Quantity
  /** Quantità arrotondata a una misura pratica, in unità base. */
  scaled?: Quantity
  /** True se l'arrotondamento ha spostato il valore in modo apprezzabile. */
  adjusted: boolean
  warning?: string
}

export interface ScaledRecipe {
  recipe: Recipe
  factor: number
  servings: number
  yield?: { amount: number; unit: string }
  ingredients: ScaledIngredient[]
  byId: Map<string, ScaledIngredient>
  warnings: string[]
}

export const DEFAULT_SUBLINEAR_EXPONENT = 0.8
/** Oltre questa soglia di arrotondamento segnaliamo l'ingrediente. */
const ADJUST_THRESHOLD = 0.08
/** Fuori da questo intervallo tempi e attrezzatura vanno verificati. */
const SAFE_FACTOR_RANGE: [number, number] = [0.5, 2]

export function ruleOf(ing: Ingredient): ScalingRule {
  return ing.scaling ?? { mode: 'linear' }
}

function applyDiscrete(amount: number, factor: number, rule: Extract<ScalingRule, { mode: 'discrete' }>): number {
  const step = rule.step ?? 1
  const raw = (amount * factor) / step
  let units: number
  switch (rule.rounding ?? 'nearest') {
    case 'ceil':
      units = Math.ceil(raw - 1e-9)
      break
    case 'floor':
      units = Math.floor(raw + 1e-9)
      break
    default:
      units = Math.round(raw)
  }
  let result = units * step
  if (rule.min !== undefined) result = Math.max(rule.min, result)
  if (rule.max !== undefined) result = Math.min(rule.max, result)
  return result
}

/**
 * Calcola la quantità esatta (non arrotondata) di un ingrediente per un fattore.
 * `resolveBase` serve alle percentuali del panettiere per leggere l'ingrediente base.
 */
export function scaleAmount(
  ing: Ingredient,
  factor: number,
  resolveBase: (id: string) => Quantity | undefined,
): Quantity | undefined {
  if (!ing.quantity) return undefined
  const base = toBase(ing.quantity)
  const rule = ruleOf(ing)
  switch (rule.mode) {
    case 'linear':
      return { amount: base.amount * factor, unit: base.unit }
    case 'fixed':
    case 'toTaste':
      return base
    case 'sublinear': {
      const exp = rule.exponent ?? DEFAULT_SUBLINEAR_EXPONENT
      return { amount: base.amount * Math.pow(factor, exp), unit: base.unit }
    }
    case 'discrete':
      return { amount: applyDiscrete(base.amount, factor, rule), unit: base.unit }
    case 'bakersPercent': {
      const b = resolveBase(rule.of)
      if (!b) return { amount: base.amount * factor, unit: base.unit }
      return { amount: (toBase(b).amount * rule.percent) / 100, unit: base.unit }
    }
  }
}

export function scaleRecipe(recipe: Recipe, factor: number): ScaledRecipe {
  if (!Number.isFinite(factor) || factor <= 0) factor = 1
  const originals = new Map(recipe.ingredients.map((i) => [i.id, i]))
  const exactCache = new Map<string, Quantity | undefined>()

  const resolveExact = (id: string, visiting: Set<string>): Quantity | undefined => {
    if (exactCache.has(id)) return exactCache.get(id)
    const ing = originals.get(id)
    if (!ing || visiting.has(id)) return undefined
    visiting.add(id)
    const q = scaleAmount(ing, factor, (baseId) => resolveExact(baseId, visiting))
    exactCache.set(id, q)
    return q
  }

  const warnings: string[] = []
  const ingredients: ScaledIngredient[] = recipe.ingredients.map((ing) => {
    const exact = resolveExact(ing.id, new Set())
    if (!exact) return { ...ing, adjusted: false }
    const rule = ruleOf(ing)
    const noRounding = rule.mode === 'discrete' || rule.mode === 'fixed' || rule.mode === 'toTaste'
    const scaled = noRounding ? exact : roundPractical(exact)
    let adjusted = false
    let warning: string | undefined
    if (rule.mode === 'discrete' && ing.quantity) {
      const linear = toBase(ing.quantity).amount * factor
      const delta = linear === 0 ? 0 : (scaled.amount - linear) / linear
      if (Math.abs(delta) > ADJUST_THRESHOLD) {
        adjusted = true
        warning = `Arrotondato a pezzi interi (lineare sarebbe ${(Math.round(linear * 100) / 100).toLocaleString('it-IT')})`
      }
    } else if (!noRounding) {
      adjusted = Math.abs(roundingDelta(exact, scaled)) > ADJUST_THRESHOLD
    }
    return { ...ing, original: ing.quantity, exact, scaled, adjusted, warning }
  })

  if (factor < SAFE_FACTOR_RANGE[0] || factor > SAFE_FACTOR_RANGE[1]) {
    warnings.push(
      'Fattore molto diverso da 1: verifica tempi di cottura e dimensioni di pentole e teglie.',
    )
  }
  const sublinearCount = ingredients.filter((i) => ruleOf(i).mode === 'sublinear').length
  if (sublinearCount > 0 && Math.abs(factor - 1) > 0.25) {
    warnings.push('Sale, spezie e lieviti sono scalati meno che linearmente: assaggia e correggi.')
  }

  return {
    recipe,
    factor,
    servings: recipe.servings * factor,
    yield: recipe.yield ? { amount: recipe.yield.amount * factor, unit: recipe.yield.unit } : undefined,
    ingredients,
    byId: new Map(ingredients.map((i) => [i.id, i])),
    warnings,
  }
}

export function factorFromServings(recipe: Recipe, servings: number): number {
  if (recipe.servings <= 0 || servings <= 0) return 1
  return servings / recipe.servings
}

export function factorFromYield(recipe: Recipe, amount: number): number | null {
  if (!recipe.yield || recipe.yield.amount <= 0 || amount <= 0) return null
  return amount / recipe.yield.amount
}

export type PivotResult = { ok: true; factor: number } | { ok: false; reason: string }

/**
 * Scalatura "pivot": l'utente dice "ho 300 g di farina" e si ricava il fattore
 * da applicare a tutta la ricetta. `newAmount` è nell'unità base dell'ingrediente.
 */
export function factorFromPivot(recipe: Recipe, ingredientId: string, newAmount: number): PivotResult {
  const ing = recipe.ingredients.find((i) => i.id === ingredientId)
  if (!ing || !ing.quantity) return { ok: false, reason: 'Ingrediente senza quantità.' }
  if (newAmount <= 0) return { ok: false, reason: 'La quantità deve essere positiva.' }
  const orig = toBase(ing.quantity).amount
  if (orig <= 0) return { ok: false, reason: 'Quantità originale non valida.' }
  const rule = ruleOf(ing)
  switch (rule.mode) {
    case 'linear':
    case 'discrete':
      return { ok: true, factor: newAmount / orig }
    case 'sublinear': {
      const exp = rule.exponent ?? DEFAULT_SUBLINEAR_EXPONENT
      return { ok: true, factor: Math.pow(newAmount / orig, 1 / exp) }
    }
    case 'bakersPercent': {
      const base = recipe.ingredients.find((i) => i.id === rule.of)
      if (!base || !base.quantity) return { ok: false, reason: 'Ingrediente base non trovato.' }
      const baseOrig = toBase(base.quantity).amount
      const baseNew = (newAmount * 100) / rule.percent
      return { ok: true, factor: baseNew / baseOrig }
    }
    case 'fixed':
      return { ok: false, reason: 'Questo ingrediente è fisso: non può guidare la scalatura.' }
    case 'toTaste':
      return { ok: false, reason: 'Un ingrediente "quanto basta" non può guidare la scalatura.' }
  }
}

export interface FeasibleFactor {
  factor: number
  ingredientId: string
  count: number
}

/**
 * Per gli ingredienti discreti (uova) propone i fattori "fattibili" più vicini
 * a quello richiesto, cioè quelli che danno un numero intero di pezzi.
 */
export function suggestFeasibleFactors(recipe: Recipe, factor: number): FeasibleFactor[] {
  const out: FeasibleFactor[] = []
  for (const ing of recipe.ingredients) {
    const rule = ruleOf(ing)
    if (rule.mode !== 'discrete' || !ing.quantity) continue
    const step = rule.step ?? 1
    const orig = toBase(ing.quantity).amount
    if (orig <= 0) continue
    const raw = (orig * factor) / step
    const candidates = new Set([Math.floor(raw), Math.ceil(raw)])
    for (const units of candidates) {
      if (units <= 0) continue
      const count = units * step
      const f = count / orig
      if (Math.abs(f - factor) < 1e-6) continue
      out.push({ factor: f, ingredientId: ing.id, count })
    }
  }
  return out.sort((a, b) => Math.abs(a.factor - factor) - Math.abs(b.factor - factor))
}

/** True se con questo fattore ogni ingrediente discreto cade su un numero intero. */
export function isFactorFeasible(recipe: Recipe, factor: number): boolean {
  return recipe.ingredients.every((ing) => {
    const rule = ruleOf(ing)
    if (rule.mode !== 'discrete' || !ing.quantity) return true
    const step = rule.step ?? 1
    const raw = (toBase(ing.quantity).amount * factor) / step
    return Math.abs(raw - Math.round(raw)) < 1e-6
  })
}

/** Percentuali del panettiere di una ricetta rispetto a un ingrediente base. */
export function bakersPercentages(recipe: Recipe, baseId: string): Array<{ id: string; percent: number }> {
  const base = recipe.ingredients.find((i) => i.id === baseId)
  if (!base?.quantity) return []
  const b = toBase(base.quantity)
  return recipe.ingredients
    .filter((i) => i.quantity && toBase(i.quantity).unit === b.unit)
    .map((i) => ({ id: i.id, percent: (toBase(i.quantity!).amount / b.amount) * 100 }))
}
