/**
 * Ricette composte: un ingrediente può essere un'altra ricetta ("300 g di
 * frolla alle noci", "1 dose di crema al mascarpone"). Qui si calcola quanto
 * preparare della base, si "spiana" una ricetta fino agli ingredienti semplici
 * (per la spesa e le etichette) e si evitano i cicli.
 */
import type { Quantity, Recipe, Unit } from './model'
import { scaleRecipe, type ScaledIngredient } from './scaling'
import { isMassUnit, isVolumeUnit, toBase } from './units'

/** Oltre questa profondità le basi non si aprono più: una crostata con una crema con una crema basta. */
export const MAX_BASE_DEPTH = 3

export type RecipeLookup = (id: string) => Recipe | undefined

/** Senza unità o "pz" la quantità di una base conta le dosi, non i grammi. */
export function isDoseUnit(unit: Unit): boolean {
  return unit === '' || unit === 'pz'
}

export function formatDoses(n: number): string {
  const v = Math.round(n * 100) / 100
  return `${v.toLocaleString('it-IT')} ${v === 1 ? 'dose' : 'dosi'}`
}

export interface BaseFactor {
  /** Fattore con cui preparare la base; `null` se non si può ricavare. */
  factor: number | null
  problem?: string
}

/**
 * Quanto preparare della base per una quantità (già scalata, in unità base):
 * a dosi è il numero stesso, a peso o volume è il rapporto con la resa della base.
 */
export function baseFactor(q: Quantity | undefined, base: Recipe): BaseFactor {
  if (!q || !(q.amount > 0)) return { factor: null, problem: 'Senza quantità non so quanta base preparare.' }
  const b = toBase(q)
  if (isDoseUnit(b.unit)) return { factor: b.amount }
  const y = base.yield ? toBase({ amount: base.yield.amount, unit: base.yield.unit as Unit }) : null
  if (isMassUnit(b.unit)) {
    if (!y || !isMassUnit(y.unit) || !(y.amount > 0)) return { factor: null, problem: `«${base.title}» non ha una resa in grammi: indicala nella base, oppure misura questa quantità a dosi.` }
    return { factor: b.amount / y.amount }
  }
  if (isVolumeUnit(b.unit)) {
    if (!y || !isVolumeUnit(y.unit) || !(y.amount > 0)) return { factor: null, problem: `«${base.title}» non ha una resa in millilitri: indicala nella base, oppure misura questa quantità a dosi.` }
    return { factor: b.amount / y.amount }
  }
  return { factor: null, problem: 'Una base si misura in grammi, millilitri o dosi.' }
}

export interface BaseUse {
  ingredient: ScaledIngredient
  base: Recipe | undefined
  factor: number | null
  problem?: string
}

/** Le basi usate direttamente da un elenco di ingredienti già scalati. */
export function resolveBases(ingredients: ScaledIngredient[], lookup: RecipeLookup): BaseUse[] {
  const out: BaseUse[] = []
  for (const ing of ingredients) {
    if (!ing.recipeId) continue
    const base = lookup(ing.recipeId)
    if (!base) {
      out.push({ ingredient: ing, base: undefined, factor: null, problem: 'La ricetta di questa base non c\'è più: resta come ingrediente semplice.' })
      continue
    }
    const { factor, problem } = baseFactor(ing.scaled, base)
    out.push({ ingredient: ing, base, factor, problem })
  }
  return out
}

/**
 * Ingredienti semplici di una ricetta, basi comprese: ogni base viene aperta e
 * scalata con il suo fattore, i suoi ingredienti prendono come sezione il nome
 * della base. Una base che non si può aprire resta com'è.
 */
export function flattenIngredients(recipe: Recipe, factor: number, lookup: RecipeLookup, depth = 0, visited: Set<string> = new Set([recipe.id])): ScaledIngredient[] {
  const out: ScaledIngredient[] = []
  for (const ing of scaleRecipe(recipe, factor).ingredients) {
    const base = ing.recipeId ? lookup(ing.recipeId) : undefined
    const bf = base ? baseFactor(ing.scaled, base) : null
    if (!base || !bf?.factor || visited.has(base.id) || depth >= MAX_BASE_DEPTH) {
      out.push(ing)
      continue
    }
    const inner = flattenIngredients(base, bf.factor, lookup, depth + 1, new Set([...visited, base.id]))
    for (const sub of inner) out.push({ ...sub, id: `${ing.id}/${sub.id}`, section: ing.name, optional: ing.optional || sub.optional })
  }
  return out
}

/** Vero se usare `baseId` dentro `parentId` creerebbe un giro (la base, da qualche parte, contiene già il genitore). */
export function wouldCycle(lookup: RecipeLookup, parentId: string, baseId: string): boolean {
  if (parentId === baseId) return true
  const seen = new Set<string>()
  const stack = [baseId]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const ing of lookup(id)?.ingredients ?? []) {
      if (!ing.recipeId) continue
      if (ing.recipeId === parentId) return true
      stack.push(ing.recipeId)
    }
  }
  return false
}

/** Le ricette che usano `baseId` come base. */
export function usedAsBaseIn(recipes: Recipe[], baseId: string): Recipe[] {
  return recipes.filter((r) => r.id !== baseId && r.ingredients.some((i) => i.recipeId === baseId))
}

/** Toglie il collegamento alla base: l'ingrediente resta con nome e quantità. */
export function detachBase(recipe: Recipe, baseId: string): Recipe {
  return { ...recipe, ingredients: recipe.ingredients.map((i) => (i.recipeId === baseId ? { ...i, recipeId: undefined } : i)) }
}

// --- Scomporre una ricetta ------------------------------------------------------

export interface SplitOptions {
  ingredientIds: string[]
  stepIds: string[]
  title: string
  /** Id della nuova base; se assente ne viene generato uno. */
  baseId?: string
}

/** Selezione proposta per una sezione: i suoi ingredienti e i passaggi della sezione o che citano solo quelli. */
export function defaultSplitSelection(recipe: Recipe, section: string): { ingredientIds: string[]; stepIds: string[] } {
  const ingredientIds = recipe.ingredients.filter((i) => i.section === section).map((i) => i.id)
  const set = new Set(ingredientIds)
  const stepIds = recipe.steps
    .filter((s) => {
      if (s.section === section) return true
      const cited = [...s.text.matchAll(/\{([a-zA-Z0-9_-]+)(\|[^}]*)?\}/g)].map((m) => m[1]!)
      return cited.length > 0 && cited.every((id) => set.has(id))
    })
    .map((s) => s.id)
  return { ingredientIds, stepIds }
}

function uniqueIngredientId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/**
 * Stacca ingredienti e passaggi in una ricetta a sé (la base) e li sostituisce
 * nella madre con un ingrediente "1 dose di …" collegato. I passaggi rimasti
 * che citavano gli ingredienti staccati ora citano la base per nome.
 */
export function splitRecipe(recipe: Recipe, opts: SplitOptions, now = new Date().toISOString()): { base: Recipe; parent: Recipe } {
  const ingSet = new Set(opts.ingredientIds)
  const stepSet = new Set(opts.stepIds)
  const title = opts.title.trim() || 'Base'
  const baseId = opts.baseId ?? `r-${Math.random().toString(36).slice(2, 10)}`
  const base: Recipe = {
    id: baseId,
    title,
    servings: recipe.servings,
    tags: [...new Set(['base', ...recipe.tags.filter((t) => t === 'base')])],
    ingredients: recipe.ingredients.filter((i) => ingSet.has(i.id)).map(({ section: _s, ...i }) => i),
    steps: recipe.steps.filter((s) => stepSet.has(s.id)).map(({ section: _s, ...s }) => ({ ...s, parallelWith: s.parallelWith && stepSet.has(s.parallelWith) ? s.parallelWith : undefined })),
    createdAt: now,
    updatedAt: now,
  }
  const remaining = recipe.ingredients.filter((i) => !ingSet.has(i.id))
  const newId = uniqueIngredientId(
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'base',
    new Set(remaining.map((i) => i.id)),
  )
  const firstIdx = recipe.ingredients.findIndex((i) => ingSet.has(i.id))
  const firstSection = firstIdx >= 0 ? recipe.ingredients[firstIdx]!.section : undefined
  const link = { id: newId, name: title.toLowerCase(), quantity: { amount: 1, unit: '' as const }, recipeId: baseId, section: firstSection }
  const ingredients = [...remaining]
  ingredients.splice(Math.min(Math.max(firstIdx, 0), ingredients.length), 0, link)
  const ref = /\{([a-zA-Z0-9_-]+)(\|[^}]*)?\}/g
  const steps = recipe.steps
    .filter((s) => !stepSet.has(s.id))
    .map((s) => ({
      ...s,
      text: s.text.replace(ref, (m, id: string) => (ingSet.has(id) ? `{${newId}|nome}` : m)),
      parallelWith: s.parallelWith && !stepSet.has(s.parallelWith) ? s.parallelWith : undefined,
    }))
  const sections = [...new Set([...ingredients, ...steps].map((x) => x.section).filter((x): x is string => Boolean(x)))]
  const parent: Recipe = { ...recipe, ingredients, steps, sections: sections.length ? sections : undefined, updatedAt: now }
  return { base, parent }
}
