/**
 * Basi: ricette (pasticcera, frolla, pralinato…) che si copiano dentro altre
 * ricette. La copia è una sezione normale e modificabile; la ricetta ricorda
 * da quale Base e da quale versione viene (`Recipe.baseCopies`), così si può
 * capire se la Base è cambiata o se la copia è stata modificata.
 */
import type { BaseCopy, Ingredient, Quantity, Recipe, Step, Unit } from './model'
import { slugify } from './model'
import { scaleRecipe } from './scaling'
import { estimateGrams } from './label'
import { isDoseUnit, isMassUnit, isVolumeUnit, toBase } from './units'

export const BASE_TAG = 'base'

export function isBase(r: Recipe): boolean {
  return r.tags.includes(BASE_TAG)
}

export function setBase(r: Recipe, on: boolean): Recipe {
  const tags = r.tags.filter((t) => t !== BASE_TAG)
  return { ...r, tags: on ? [...tags, BASE_TAG] : tags }
}

export interface BaseFactor {
  /** Fattore con cui preparare la Base; `null` se non si può ricavare. */
  factor: number | null
  problem?: string
}

/**
 * Quanto preparare della Base per una quantità: a dosi è il numero stesso, a
 * peso o volume è il rapporto con la resa della Base.
 */
export function baseFactor(q: Quantity | undefined, base: Recipe): BaseFactor {
  if (!q || !(q.amount > 0)) return { factor: null, problem: 'Senza quantità non so quanta Base preparare.' }
  const b = toBase(q)
  if (isDoseUnit(b.unit)) return { factor: b.amount }
  const y = base.yield ? toBase({ amount: base.yield.amount, unit: base.yield.unit as Unit }) : null
  if (isMassUnit(b.unit)) {
    if (!y || !isMassUnit(y.unit) || !(y.amount > 0)) return { factor: null, problem: `«${base.title}» non ha una resa in grammi: indicala nella Base, oppure misura questa quantità a dosi.` }
    return { factor: b.amount / y.amount }
  }
  if (isVolumeUnit(b.unit)) {
    if (!y || !isVolumeUnit(y.unit) || !(y.amount > 0)) return { factor: null, problem: `«${base.title}» non ha una resa in millilitri: indicala nella Base, oppure misura questa quantità a dosi.` }
    return { factor: b.amount / y.amount }
  }
  return { factor: null, problem: 'Una Base si misura in grammi, millilitri o dosi.' }
}

/** Unità con cui si può misurare una Base: quelle della sua resa, più le dosi (unità vuota). */
export function baseUnits(base: Recipe): Unit[] {
  const y = base.yield?.unit as Unit | undefined
  if (y && isMassUnit(y)) return ['g', 'kg', '']
  if (y && isVolumeUnit(y)) return ['ml', 'l', '']
  return ['']
}

/**
 * Quantità da proporre nel dialogo delle Basi. Sostituendo una riga si propone
 * la sua quantità se si può usare ("pz" vale come dosi); se non si può, il campo
 * resta vuoto e la quantità si chiede. Aggiungendo, si propone la resa intera.
 */
export function pickerQuantity(base: Recipe, initial: Quantity | undefined, replacing: boolean): { amount: string; unit: Unit } {
  const units = baseUnits(base)
  const q = initial && initial.unit === 'pz' ? { amount: initial.amount, unit: '' as Unit } : initial
  if (q && units.includes(q.unit) && baseFactor(q, base).factor !== null) return { amount: String(q.amount), unit: q.unit }
  const y = base.yield?.unit as Unit | undefined
  const unit = units[0]!
  if (replacing) return { amount: '', unit }
  if (base.yield && y && units.includes(y)) return { amount: String(base.yield.amount), unit: y }
  return { amount: '1', unit }
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

/**
 * JSON degli oggetti normalizzati. Le chiavi `undefined` spariscono, quindi `{}` e
 * `{ x: undefined }` danno lo stesso testo; l'ordine delle chiavi è fisso perché
 * gli oggetti li costruiscono sempre `normIngredient` e `normStep`.
 */
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

/** Le sezioni che appartengono a una copia: la sua e le sottosezioni che ha creato. */
export function copySections(copy: Pick<BaseCopy, 'section' | 'inner'>): string[] {
  return [copy.section, ...(copy.inner ?? [])]
}

/**
 * Filtro per gli elementi di una sezione: per una sezione copiata comprende le
 * sottosezioni registrate nella copia, mai altre sezioni che per caso iniziano
 * con lo stesso nome ("Pasticcera: decoro" scritta a mano).
 */
export function sectionMatcher(recipe: Recipe, section: string): (s: string | undefined) => boolean {
  const copy = recipe.baseCopies?.find((c) => c.section === section)
  const names = new Set(copy ? copySections(copy) : [section])
  return (s) => s !== undefined && names.has(s)
}

/** Impronta di una sezione copiata, per capire se è stata modificata nella ricetta. */
export function sectionFingerprint(recipe: Recipe, section: string): string {
  const prefix = recipe.baseCopies?.find((c) => c.section === section)?.prefix ?? ''
  const inside = sectionMatcher(recipe, section)
  const id = (x: string) => (prefix && x.startsWith(`${prefix}-`) ? x.slice(prefix.length + 1) : x)
  const sec = (x: string | undefined) => (x === section ? undefined : x?.slice(section.length + 2))
  return hash(
    stable({
      ingredients: recipe.ingredients.filter((i) => inside(i.section)).map((i) => normIngredient(i, id, sec)),
      steps: recipe.steps.filter((s) => inside(s.section)).map((s) => normStep(s, id, sec)),
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
  const taken = new Set([...sectionsOf(recipe), ...(recipe.baseCopies ?? []).flatMap(copySections)])
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
export function copiedParts(base: Recipe, factor: number, prefix: string, section: string): { ingredients: Ingredient[]; steps: Step[]; inner: string[] } {
  const pid = (id: string) => (prefix ? `${prefix}-${id}` : id)
  const sec = (inner: string | undefined) => (inner ? `${section}: ${inner}` : section)
  const scaled = scaleRecipe(base, factor)
  const ingredients = scaled.ingredients.map<Ingredient>((s) => {
    const { original: _o, exact, scaled: _s, adjusted: _a, warning: _w, ...ing } = s
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
  const inner = [...new Set([...ingredients, ...steps].map((x) => x.section).filter((x): x is string => Boolean(x) && x !== section))]
  return { ingredients, steps, inner }
}

/** Dove vanno i passaggi di una copia nuova: dopo quelli delle copie già presenti, altrimenti in testa. */
function stepInsertIndex(recipe: Recipe): number {
  const copies = recipe.baseCopies ?? []
  let last = -1
  recipe.steps.forEach((s, i) => {
    if (copies.some((c) => s.section !== undefined && copySections(c).includes(s.section))) last = i
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

  // Una percentuale del panettiere sulla riga tolta non ha più una base: l'ingrediente torna lineare.
  const ingredients = recipe.ingredients
    .filter((i) => i !== replaced)
    .map((i) => (replaced && i.scaling?.mode === 'bakersPercent' && i.scaling.of === replaced.id ? { ...i, scaling: undefined } : i))
  const at = replaced ? recipe.ingredients.indexOf(replaced) : ingredients.length
  ingredients.splice(at, 0, ...parts.ingredients)

  const ownSteps = replaced
    ? recipe.steps.map((s) => ({ ...s, text: s.text.replace(REF, (m, ref: string) => (ref === replaced.id ? replaced.name : m)) }))
    : recipe.steps
  const steps = [...ownSteps]
  steps.splice(stepInsertIndex(recipe), 0, ...parts.steps)

  const next = withSections({ ...recipe, ingredients, steps })
  const copy: BaseCopy = { section, baseId: base.id, baseVersion: baseFingerprint(base), quantity, prefix, copied: '', ...(parts.inner.length ? { inner: parts.inner } : {}) }
  const withCopy: Recipe = { ...next, baseCopies: [...(recipe.baseCopies ?? []), copy] }
  copy.copied = sectionFingerprint(withCopy, section)
  return { ok: true, recipe: withCopy }
}

// --- Stato, usi, aggiornamento -------------------------------------------------

/**
 * Stato di una copia rispetto alla sua Base:
 * `current` uguale all'ultima versione, `outdated` la Base è cambiata,
 * `modified` modificata nella ricetta (vale anche se la Base è cambiata),
 * `orphan` la Base non esiste più.
 */
export type CopyStatus = 'current' | 'outdated' | 'modified' | 'orphan'

export function copyStatus(recipe: Recipe, copy: BaseCopy, base: Recipe | undefined): CopyStatus {
  if (!base) return 'orphan'
  if (sectionFingerprint(recipe, copy.section) !== copy.copied) return 'modified'
  return baseFingerprint(base) === copy.baseVersion ? 'current' : 'outdated'
}

export interface BaseUsage {
  recipe: Recipe
  copy: BaseCopy
  status: CopyStatus
}

/** Le ricette che hanno copiato direttamente questa Base, una voce per copia, in ordine di titolo. */
export function baseUsages(recipes: Recipe[], base: Recipe): BaseUsage[] {
  const out: BaseUsage[] = []
  for (const r of recipes) {
    if (r.id === base.id) continue
    for (const c of r.baseCopies ?? []) if (c.baseId === base.id) out.push({ recipe: r, copy: c, status: copyStatus(r, c, base) })
  }
  return out.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'it') || a.copy.section.localeCompare(b.copy.section, 'it'))
}

/**
 * Sostituisce la sezione copiata con la versione attuale della Base, alla
 * stessa quantità chiesta (il fattore si ricalcola sulla resa nuova) e con lo
 * stesso prefisso, così i riferimenti esterni restano validi. Un riferimento
 * esterno a un ingrediente che non c'è più diventa il suo nome.
 */
export function updateBaseCopy(recipe: Recipe, section: string, base: Recipe): CopyResult {
  const copy = recipe.baseCopies?.find((c) => c.section === section)
  if (!copy) return { ok: false, problem: `Nella ricetta non c'è la sezione «${section}» presa da una Base.` }
  const { factor } = baseFactor(copy.quantity, base)
  if (factor === null) return { ok: false, problem: 'La resa della Base è cambiata: scegli di nuovo la quantità.' }

  const parts = copiedParts(base, factor, copy.prefix, section)
  const inside = sectionMatcher(recipe, section)
  const oldIngredients = recipe.ingredients.filter((i) => inside(i.section))
  const ingAt = recipe.ingredients.findIndex((i) => inside(i.section))
  const stepAt = recipe.steps.findIndex((s) => inside(s.section))

  const outside = recipe.ingredients.filter((i) => !inside(i.section))
  const outsideSteps = recipe.steps.filter((s) => !inside(s.section))
  const outsideIds = new Set([...outside.map((i) => i.id), ...outsideSteps.map((s) => s.id)])
  const clash = [...parts.ingredients, ...parts.steps].find((x) => outsideIds.has(x.id))
  if (clash) {
    const what = 'name' in clash ? `«${clash.name}»` : `il passaggio «${clash.text.slice(0, 30)}»`
    return { ok: false, problem: `La versione nuova ha ${what} con lo stesso codice di un elemento fuori dalla sezione: rinominalo nella ricetta e riprova.` }
  }

  const newIds = new Set(parts.ingredients.map((i) => i.id))
  const newStepIds = new Set(parts.steps.map((s) => s.id))
  const gone = new Map(oldIngredients.filter((i) => !newIds.has(i.id)).map((i) => [i.id, i.name]))
  const oldStepIds = new Set(recipe.steps.filter((s) => inside(s.section)).map((s) => s.id))
  // Fuori dalla sezione nulla deve puntare a ciò che la versione nuova ha tolto.
  const ingredients = outside.map((i) => (i.scaling?.mode === 'bakersPercent' && gone.has(i.scaling.of) ? { ...i, scaling: undefined } : i))
  ingredients.splice(ingAt >= 0 ? ingAt : ingredients.length, 0, ...parts.ingredients)
  const steps: Step[] = outsideSteps.map((s) => ({
    ...s,
    text: s.text.replace(REF, (m, ref: string) => gone.get(ref) ?? m),
    parallelWith: s.parallelWith && oldStepIds.has(s.parallelWith) && !newStepIds.has(s.parallelWith) ? undefined : s.parallelWith,
  }))
  steps.splice(stepAt >= 0 ? stepAt : stepInsertIndex(recipe), 0, ...parts.steps)

  const next = withSections({ ...recipe, ingredients, steps })
  const { inner: _old, ...rest } = copy
  const updated: BaseCopy = { ...rest, baseVersion: baseFingerprint(base), copied: '', ...(parts.inner.length ? { inner: parts.inner } : {}) }
  const withCopy: Recipe = { ...next, baseCopies: (recipe.baseCopies ?? []).map((c) => (c === copy ? updated : c)) }
  updated.copied = sectionFingerprint(withCopy, section)
  return { ok: true, recipe: withCopy }
}

/** Dimentica l'origine delle copie di una Base (cancellata): ingredienti e passaggi restano. */
export function forgetBase(recipe: Recipe, baseId: string): Recipe {
  const baseCopies = (recipe.baseCopies ?? []).filter((c) => c.baseId !== baseId)
  return { ...recipe, baseCopies: baseCopies.length ? baseCopies : undefined }
}

// --- Salva come Base -----------------------------------------------------------

export interface SaveAsBaseOptions {
  ingredientIds: string[]
  stepIds: string[]
  title: string
  /** Id della Base nuova; se assente ne viene generato uno. */
  baseId?: string
}

/** Selezione proposta per una sezione: i suoi ingredienti e i passaggi della sezione o che citano solo quelli. */
export function defaultSelection(recipe: Recipe, section: string): { ingredientIds: string[]; stepIds: string[] } {
  const inside = sectionMatcher(recipe, section)
  const ingredientIds = recipe.ingredients.filter((i) => inside(i.section)).map((i) => i.id)
  const set = new Set(ingredientIds)
  const stepIds = recipe.steps
    .filter((s) => {
      if (inside(s.section)) return true
      const cited = [...s.text.matchAll(REF)].map((m) => m[1]!)
      return cited.length > 0 && cited.every((id) => set.has(id))
    })
    .map((s) => s.id)
  return { ingredientIds, stepIds }
}

/** Raggruppa gli elementi scelti alla posizione del primo, nell'ordine in cui erano. */
function gather<T extends { id: string }>(items: T[], chosen: Set<string>, move: (x: T) => T): T[] {
  const first = items.findIndex((x) => chosen.has(x.id))
  if (first < 0) return items
  const picked = items.filter((x) => chosen.has(x.id)).map(move)
  const rest = items.filter((x) => !chosen.has(x.id))
  const at = items.slice(0, first).filter((x) => !chosen.has(x.id)).length
  rest.splice(at, 0, ...picked)
  return rest
}

/**
 * Fa una Base nuova con gli ingredienti e i passaggi scelti (stessi id, senza
 * sezione). Nella ricetta gli elementi restano, raccolti nella sezione col
 * titolo della Base, e la sezione risulta copiata da questa Base.
 */
export function saveSelectionAsBase(recipe: Recipe, opts: SaveAsBaseOptions, now = new Date().toISOString()): { base: Recipe; recipe: Recipe } {
  const ingSet = new Set(opts.ingredientIds)
  const stepSet = new Set(opts.stepIds)
  const title = opts.title.trim() || 'Base'
  const baseId = opts.baseId ?? `r-${Math.random().toString(36).slice(2, 10)}`
  const names = new Map(recipe.ingredients.map((i) => [i.id, i.name]))
  const grams = scaleRecipe(recipe, 1)
    .ingredients.filter((i) => ingSet.has(i.id))
    .reduce((sum, i) => sum + (estimateGrams(i) ?? 0), 0)
  const base: Recipe = {
    id: baseId,
    title,
    servings: recipe.servings,
    yield: grams > 0 ? { amount: Math.round(grams), unit: 'g' } : undefined,
    tags: [BASE_TAG],
    // Nella Base nulla deve puntare fuori dalla scelta: i riferimenti a ingredienti non scelti diventano il loro nome,
    // una percentuale del panettiere su un ingrediente non scelto torna lineare.
    ingredients: recipe.ingredients
      .filter((i) => ingSet.has(i.id))
      .map(({ section: _s, ...i }) => (i.scaling?.mode === 'bakersPercent' && !ingSet.has(i.scaling.of) ? { ...i, scaling: undefined } : i)),
    steps: recipe.steps
      .filter((s) => stepSet.has(s.id))
      .map(({ section: _s, ...s }) => ({
        ...s,
        text: s.text.replace(REF, (m, ref: string) => (ingSet.has(ref) ? m : (names.get(ref) ?? m))),
        parallelWith: s.parallelWith && stepSet.has(s.parallelWith) ? s.parallelWith : undefined,
      })),
    createdAt: now,
    updatedAt: now,
  }

  // Il nome della sezione si sceglie senza contare gli elementi che ci finiscono dentro.
  const others: Recipe = { ...recipe, ingredients: recipe.ingredients.filter((i) => !ingSet.has(i.id)), steps: recipe.steps.filter((s) => !stepSet.has(s.id)) }
  const othersSections = sectionsOf(others)
  // Le copie tengono solo le sezioni che conservano qualcosa: una sottosezione svuotata non occupa più il nome.
  const trim = (c: BaseCopy, present: string[]): BaseCopy => {
    const inner = (c.inner ?? []).filter((x) => present.includes(x))
    const { inner: _i, ...rest } = c
    return inner.length ? { ...rest, inner } : rest
  }
  const othersCopies = (recipe.baseCopies ?? []).map((c) => trim(c, othersSections)).filter((c) => copySections(c).some((x) => othersSections.includes(x)))
  const section = uniqueSection({ ...others, baseCopies: othersCopies }, title)

  const moved = withSections({
    ...recipe,
    ingredients: gather(recipe.ingredients, ingSet, (i) => ({ ...i, section })),
    steps: gather(recipe.steps, stepSet, (s) => ({ ...s, section })),
  })
  const left = moved.sections ?? []
  const kept = (recipe.baseCopies ?? [])
    .filter((c) => c.section !== section)
    .map((c) => trim(c, left.filter((x) => x !== section)))
    .filter((c) => copySections(c).some((x) => left.includes(x) && x !== section))
  const copy: BaseCopy = { section, baseId, baseVersion: baseFingerprint(base), quantity: { amount: 1, unit: '' }, prefix: '', copied: '' }
  const out: Recipe = { ...moved, baseCopies: [...kept, copy], updatedAt: now }
  copy.copied = sectionFingerprint(out, section)
  return { base, recipe: out }
}
