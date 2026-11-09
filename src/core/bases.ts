/**
 * Basi: ricette (pasticcera, frolla, pralinato…) che si copiano dentro altre
 * ricette. La copia è una sezione normale e modificabile; la ricetta ricorda
 * da quale Base e da quale versione viene (`Recipe.baseCopies`), così si può
 * capire se la Base è cambiata o se la copia è stata modificata.
 */
import type { BaseCopy, Ingredient, Quantity, Recipe, Step } from './model'
import { slugify } from './model'
import { scaleRecipe } from './scaling'
import { baseFactor } from './compose'

export const BASE_TAG = 'base'

export function isBase(r: Recipe): boolean {
  return r.tags.includes(BASE_TAG)
}

export function setBase(r: Recipe, on: boolean): Recipe {
  const tags = r.tags.filter((t) => t !== BASE_TAG)
  return { ...r, tags: on ? [...tags, BASE_TAG] : tags }
}

// --- Impronte ----------------------------------------------------------------

/** FNV-1a a 32 bit, in esadecimale. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const REF = /\{([a-zA-Z0-9_-]+)(\|[^}]*)?\}/g

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function str(s: string | undefined): string | undefined {
  const t = s?.trim()
  return t ? t : undefined
}

/** Ingrediente ridotto ai campi che contano, con valori vuoti tolti. */
function normIngredient(i: Ingredient, id: (x: string) => string, section: (x: string | undefined) => string | undefined) {
  const scaling = i.scaling && i.scaling.mode !== 'linear' ? (i.scaling.mode === 'bakersPercent' ? { ...i.scaling, percent: round4(i.scaling.percent), of: id(i.scaling.of) } : i.scaling) : undefined
  // "q.b." non ha una quantità vera: il wizard la riscrive a 1 q.b.
  const quantity = i.scaling?.mode === 'toTaste' || !i.quantity ? undefined : { amount: round4(i.quantity.amount), unit: i.quantity.unit }
  return { id: id(i.id), name: i.name.trim(), quantity, note: str(i.note), scaling, section: section(i.section), optional: i.optional || undefined }
}

function normStep(s: Step, id: (x: string) => string, section: (x: string | undefined) => string | undefined) {
  return {
    id: id(s.id),
    text: s.text.trim().replace(REF, (_m, ref: string, tail: string | undefined) => `{${id(ref)}${tail ?? ''}}`),
    type: s.type || undefined,
    durationMin: s.durationMin || undefined,
    temperatureC: s.temperatureC || undefined,
    timer: s.timer?.minutes ? { minutes: s.timer.minutes, label: str(s.timer.label) } : undefined,
    equipment: s.equipment?.length ? s.equipment : undefined,
    section: section(s.section),
    parallelWith: s.parallelWith ? id(s.parallelWith) : undefined,
  }
}

/** JSON con le chiavi `undefined` omesse: uguale per `{}` e `{ x: undefined }`. */
function stable(v: unknown): string {
  return JSON.stringify(v)
}

/** Versione della Base: cambia se cambiano ingredienti, passaggi o resa. */
export function baseFingerprint(base: Recipe): string {
  const same = (x: string) => x
  const sec = (x: string | undefined) => str(x)
  return hash(
    stable({
      yield: base.yield ? { amount: round4(base.yield.amount), unit: base.yield.unit } : undefined,
      ingredients: base.ingredients.map((i) => normIngredient(i, same, sec)),
      steps: base.steps.map((s) => normStep(s, same, sec)),
    }),
  )
}

/** Vero se `s` è la sezione o una sua sottosezione ("Pasticcera: Crema"). */
export function inSection(s: string | undefined, section: string): boolean {
  return s === section || (s?.startsWith(`${section}: `) ?? false)
}

/** Impronta di una sezione copiata, per capire se è stata modificata nella ricetta. */
export function sectionFingerprint(recipe: Recipe, section: string): string {
  const prefix = recipe.baseCopies?.find((c) => c.section === section)?.prefix ?? ''
  const id = (x: string) => (prefix && x.startsWith(`${prefix}-`) ? x.slice(prefix.length + 1) : x)
  const sec = (x: string | undefined) => (x === section ? undefined : x?.slice(section.length + 2))
  return hash(
    stable({
      ingredients: recipe.ingredients.filter((i) => inSection(i.section, section)).map((i) => normIngredient(i, id, sec)),
      steps: recipe.steps.filter((s) => inSection(s.section, section)).map((s) => normStep(s, id, sec)),
    }),
  )
}

// --- Cicli -------------------------------------------------------------------

/** Vero se copiare `baseId` dentro `parentId` creerebbe un giro (la Base contiene già, copiato, il genitore). */
export function wouldCycle(recipes: Recipe[], parentId: string, baseId: string): boolean {
  if (parentId === baseId) return true
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const stack = [baseId]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const c of byId.get(id)?.baseCopies ?? []) {
      if (c.baseId === parentId) return true
      stack.push(c.baseId)
    }
  }
  return false
}

// --- Copia -------------------------------------------------------------------

export type CopyResult = { ok: true; recipe: Recipe } | { ok: false; problem: string }

function roundAmount(q: Quantity): Quantity {
  const digits = q.unit === 'g' || q.unit === 'ml' ? 10 : 100
  return { amount: Math.round(q.amount * digits) / digits, unit: q.unit }
}

function sectionsOf(r: Pick<Recipe, 'ingredients' | 'steps'>): string[] {
  return [...new Set([...r.ingredients, ...r.steps].map((x) => x.section).filter((x): x is string => Boolean(x)))]
}

function uniqueSection(recipe: Recipe, title: string): string {
  const taken = new Set([...sectionsOf(recipe), ...(recipe.baseCopies ?? []).map((c) => c.section)])
  if (!taken.has(title)) return title
  for (let n = 2; ; n++) if (!taken.has(`${title} (${n})`)) return `${title} (${n})`
}

function uniquePrefix(recipe: Recipe, base: Recipe): string {
  const root = slugify(base.title) || 'base'
  const usedPrefixes = new Set((recipe.baseCopies ?? []).map((c) => c.prefix))
  const ids = new Set([...recipe.ingredients.map((i) => i.id), ...recipe.steps.map((s) => s.id)])
  const clashes = (p: string) => usedPrefixes.has(p) || [...base.ingredients, ...base.steps].some((x) => ids.has(`${p}-${x.id}`))
  if (!clashes(root)) return root
  for (let n = 2; ; n++) if (!clashes(`${root}-${n}`)) return `${root}-${n}`
}

/** Ingredienti e passaggi della Base, scalati con `factor`, con id prefissati e sezione `section`. */
export function copiedParts(base: Recipe, factor: number, prefix: string, section: string): { ingredients: Ingredient[]; steps: Step[] } {
  const pid = (id: string) => (prefix ? `${prefix}-${id}` : id)
  const sec = (inner: string | undefined) => (inner ? `${section}: ${inner}` : section)
  const scaled = scaleRecipe(base, factor)
  const ingredients = scaled.ingredients.map<Ingredient>((s) => {
    const { original: _o, exact, scaled: _s, adjusted: _a, warning: _w, recipeId: _r, ...ing } = s
    return {
      ...ing,
      id: pid(ing.id),
      quantity: exact ? roundAmount(exact) : ing.quantity,
      scaling: ing.scaling?.mode === 'bakersPercent' ? { ...ing.scaling, of: pid(ing.scaling.of) } : ing.scaling,
      section: sec(ing.section),
    }
  })
  const steps = base.steps.map<Step>((s) => ({
    ...s,
    id: pid(s.id),
    text: s.text.replace(REF, (_m, ref: string, tail: string | undefined) => `{${pid(ref)}${tail ?? ''}}`),
    parallelWith: s.parallelWith ? pid(s.parallelWith) : undefined,
    section: sec(s.section),
  }))
  return { ingredients, steps }
}

/** Dove vanno i passaggi di una copia nuova: dopo quelli delle copie già presenti, altrimenti in testa. */
function stepInsertIndex(recipe: Recipe): number {
  const copies = recipe.baseCopies ?? []
  let last = -1
  recipe.steps.forEach((s, i) => {
    if (copies.some((c) => inSection(s.section, c.section))) last = i
  })
  return last + 1
}

/** Ricalcola l'elenco delle sezioni dagli elementi. */
export function withSections(recipe: Recipe): Recipe {
  const sections = sectionsOf(recipe)
  return { ...recipe, sections: sections.length ? sections : undefined }
}

/**
 * Copia una Base dentro una ricetta, scalata alla quantità chiesta, come
 * sezione col titolo della Base. Con `replaceIngredientId` la riga indicata
 * sparisce e la sezione entra al suo posto; nei passaggi i riferimenti alla
 * riga diventano il suo nome.
 */
export function copyBaseInto(recipe: Recipe, base: Recipe, quantity: Quantity, opts: { replaceIngredientId?: string } = {}): CopyResult {
  if (quantity.unit === 'q.b.') return { ok: false, problem: 'Una Base si misura in grammi, millilitri o dosi.' }
  const { factor, problem } = baseFactor(quantity, base)
  if (factor === null) return { ok: false, problem: problem ?? 'Quantità non utilizzabile.' }

  const replaced = opts.replaceIngredientId ? recipe.ingredients.find((i) => i.id === opts.replaceIngredientId) : undefined
  const section = uniqueSection(recipe, base.title.trim() || 'Base')
  const prefix = uniquePrefix(recipe, base)
  const parts = copiedParts(base, factor, prefix, section)

  const ingredients = recipe.ingredients.filter((i) => i !== replaced)
  const at = replaced ? recipe.ingredients.indexOf(replaced) : ingredients.length
  ingredients.splice(at, 0, ...parts.ingredients)

  const ownSteps = replaced
    ? recipe.steps.map((s) => ({ ...s, text: s.text.replace(REF, (m, ref: string) => (ref === replaced.id ? replaced.name : m)) }))
    : recipe.steps
  const steps = [...ownSteps]
  steps.splice(stepInsertIndex(recipe), 0, ...parts.steps)

  const next = withSections({ ...recipe, ingredients, steps })
  const copy: BaseCopy = { section, baseId: base.id, baseVersion: baseFingerprint(base), quantity, prefix, copied: '' }
  const withCopy: Recipe = { ...next, baseCopies: [...(recipe.baseCopies ?? []), copy] }
  copy.copied = sectionFingerprint(withCopy, section)
  return { ok: true, recipe: withCopy }
}
