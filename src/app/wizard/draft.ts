/**
 * Bozza del wizard: la ricetta con le quantità come stringhe per l'editing,
 * e le conversioni da e verso `Recipe`.
 */
import { dosingOf, newId, type DosingMode, type DoughType, type Ingredient, type Pan, type Recipe, type ScalingMode, type ScalingRule, type Step, type StepType, type Unit } from '@/core'

/** Stato del form: come Recipe ma con quantità come stringhe per l'editing. */
export interface IngredientDraft {
  id: string
  name: string
  amount: string
  unit: Unit
  mode: ScalingMode
  percent: string
  of: string
  note: string
  section: string
  optional: boolean
  /** Se è una base: id della ricetta. */
  recipeId: string
}
export interface StepDraft {
  id: string
  text: string
  type: StepType | ''
  durationMin: string
  temperatureC: string
  timerMinutes: string
  timerLabel: string
  equipment: string
  section: string
  parallelWith: string
}

export function emptyIngredient(): IngredientDraft {
  return { id: newId('i'), name: '', amount: '', unit: 'g', mode: 'linear', percent: '', of: '', note: '', section: '', optional: false, recipeId: '' }
}
export function emptyStep(): StepDraft {
  return { id: newId('s'), text: '', type: '', durationMin: '', temperatureC: '', timerMinutes: '', timerLabel: '', equipment: '', section: '', parallelWith: '' }
}

export function fromRecipe(r: Recipe) {
  return {
    title: r.title,
    description: r.description ?? '',
    servings: String(r.servings),
    yieldAmount: r.yield ? String(r.yield.amount) : '',
    yieldUnit: r.yield?.unit ?? '',
    panShape: (r.pan?.shape ?? '') as Pan['shape'] | '',
    panA: r.pan ? String(r.pan.shape === 'round' ? r.pan.diameterCm : r.pan.widthCm) : '',
    panB: r.pan?.shape === 'rect' ? String(r.pan.lengthCm) : '',
    dosingMode: dosingOf(r).mode as DosingMode,
    dough: (dosingOf(r).dough ?? '') as DoughType | '',
    pieceGrams: dosingOf(r).pieceGrams ? String(dosingOf(r).pieceGrams) : '',
    tags: r.tags.join(', '),
    notes: r.notes ?? '',
    source: r.source ?? '',
    ingredients: r.ingredients.map<IngredientDraft>((i) => ({
      id: i.id,
      name: i.name,
      amount: i.quantity ? String(i.quantity.amount) : '',
      unit: i.quantity?.unit ?? '',
      mode: i.scaling?.mode ?? 'linear',
      percent: i.scaling?.mode === 'bakersPercent' ? String(i.scaling.percent) : '',
      of: i.scaling?.mode === 'bakersPercent' ? i.scaling.of : '',
      note: i.note ?? '',
      section: i.section ?? '',
      optional: i.optional ?? false,
      recipeId: i.recipeId ?? '',
    })),
    steps: r.steps.map<StepDraft>((s) => ({
      id: s.id,
      text: s.text,
      type: s.type ?? '',
      durationMin: s.durationMin ? String(s.durationMin) : '',
      temperatureC: s.temperatureC ? String(s.temperatureC) : '',
      timerMinutes: s.timer ? String(s.timer.minutes) : '',
      timerLabel: s.timer?.label ?? '',
      equipment: s.equipment?.join(', ') ?? '',
      section: s.section ?? '',
      parallelWith: s.parallelWith ?? '',
    })),
    baseCopies: r.baseCopies ?? [],
  }
}
export type Draft = ReturnType<typeof fromRecipe>

export function num(s: string): number | undefined {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined
}

/**
 * Ricostruisce la ricetta dalla bozza partendo dall'originale: i campi che il
 * wizard non gestisce (etichetta, preferito, ...) restano com'erano.
 */
export function toRecipe(d: Draft, original: Recipe): Recipe {
  const originalById = new Map(original.ingredients.map((i) => [i.id, i]))
  const ingredients: Ingredient[] = d.ingredients
    .filter((i) => i.name.trim())
    .map((i) => {
      const amount = num(i.amount)
      let scaling: ScalingRule | undefined
      switch (i.mode) {
        case 'linear':
          scaling = undefined
          break
        case 'bakersPercent':
          scaling = { mode: 'bakersPercent', percent: num(i.percent) ?? 0, of: i.of }
          break
        default: {
          // La bozza non mostra passo, arrotondamento ed esponente: se la regola non cambia si tiene quella originale.
          const prev = originalById.get(i.id)?.scaling
          scaling = prev?.mode === i.mode ? prev : ({ mode: i.mode } as ScalingRule)
        }
      }
      const unit: Unit = i.mode === 'toTaste' ? 'q.b.' : i.unit
      return {
        id: i.id,
        name: i.name.trim(),
        quantity: amount !== undefined ? { amount, unit } : i.mode === 'toTaste' ? { amount: 1, unit: 'q.b.' } : undefined,
        scaling,
        note: i.note.trim() || undefined,
        section: i.section.trim() || undefined,
        optional: i.optional || undefined,
        recipeId: i.recipeId || undefined,
      }
    })
  const steps: Step[] = d.steps
    .filter((s) => s.text.trim())
    .map((s) => {
      const timerMinutes = num(s.timerMinutes)
      const equipment = s.equipment.split(',').map((e) => e.trim()).filter(Boolean)
      return {
        id: s.id,
        text: s.text.trim(),
        type: s.type || undefined,
        durationMin: num(s.durationMin),
        temperatureC: num(s.temperatureC),
        timer: timerMinutes ? { minutes: timerMinutes, label: s.timerLabel.trim() || undefined } : undefined,
        equipment: equipment.length ? equipment : undefined,
        section: s.section.trim() || undefined,
        parallelWith: s.parallelWith && d.steps.some((o) => o.id === s.parallelWith && o.id !== s.id) ? s.parallelWith : undefined,
      }
    })
  const sections = [...new Set([...ingredients, ...steps].map((x) => x.section).filter((x): x is string => Boolean(x)))]
  // L'origine di una sezione copiata vale finché la sezione (o una sua sottosezione) esiste ancora.
  const baseCopies = d.baseCopies.filter((c) => sections.some((x) => x === c.section || x.startsWith(`${c.section}: `)))
  const yieldAmount = num(d.yieldAmount)
  const panA = num(d.panA)
  const panB = num(d.panB)
  const pan: Pan | undefined =
    d.panShape === 'round' && panA ? { shape: 'round', diameterCm: panA } : d.panShape === 'rect' && panA && panB ? { shape: 'rect', widthCm: panA, lengthCm: panB } : undefined
  return {
    ...original,
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    servings: num(d.servings) ?? 1,
    yield: yieldAmount ? { amount: yieldAmount, unit: d.yieldUnit.trim() || 'g' } : undefined,
    pan,
    dosing: {
      mode: d.dosingMode,
      dough: d.dosingMode === 'pans' && d.dough ? d.dough : undefined,
      pieceGrams: d.dosingMode === 'pieces' ? num(d.pieceGrams) : undefined,
    },
    tags: d.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    sections: sections.length ? sections : undefined,
    ingredients,
    steps,
    baseCopies: baseCopies.length ? baseCopies : undefined,
    notes: d.notes.trim() || undefined,
    source: d.source.trim() || undefined,
  }
}
