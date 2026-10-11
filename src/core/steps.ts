import type { Step } from './model'
import { formatIngredientLine } from './format'
import type { ScaledIngredient, ScaledRecipe } from './scaling'

export type StepSegment =
  | { kind: 'text'; text: string }
  | { kind: 'ingredient'; ingredient: ScaledIngredient; text: string; nameOnly: boolean }
  | { kind: 'missing'; id: string; text: string }

const REF = /\{([a-zA-Z0-9_-]+)(?:\|([^}]*))?\}/g

/** Id degli ingredienti citati in un passaggio, nell'ordine di apparizione. */
export function ingredientIdsInStep(step: Step): string[] {
  const ids: string[] = []
  for (const m of step.text.matchAll(REF)) {
    const id = m[1]!
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Id degli ingredienti citati con la quantità (`{id}`), escludendo i riferimenti al solo nome (`{id|nome}`). */
export function quantifiedIngredientIdsInStep(step: Step): string[] {
  const ids: string[] = []
  for (const m of step.text.matchAll(REF)) {
    const id = m[1]!
    if (m[2] === undefined && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Spezza il testo del passaggio in segmenti, sostituendo `{id}` con la quantità
 * già riscalata ("350 g di acqua") e `{id|nome}` con il solo nome.
 */
export function renderStep(step: Step, scaled: ScaledRecipe): StepSegment[] {
  const out: StepSegment[] = []
  let last = 0
  for (const m of step.text.matchAll(REF)) {
    const start = m.index ?? 0
    if (start > last) out.push({ kind: 'text', text: step.text.slice(last, start) })
    const id = m[1]!
    const modifier = m[2]
    const ing = scaled.byId.get(id)
    if (!ing) {
      out.push({ kind: 'missing', id, text: id })
    } else {
      const nameOnly = modifier !== undefined
      const text = nameOnly ? ing.name : formatIngredientLine(ing.name, ing.scaled, Boolean(ing.recipeId))
      out.push({ kind: 'ingredient', ingredient: ing, text, nameOnly })
    }
    last = start + m[0].length
  }
  if (last < step.text.length) out.push({ kind: 'text', text: step.text.slice(last) })
  return out
}

export function renderStepPlain(step: Step, scaled: ScaledRecipe): string {
  return renderStep(step, scaled)
    .map((s) => s.text)
    .join('')
}

/** Passaggi che possono essere svolti mentre `stepId` è in corso (riposo, attesa, cottura lunga). */
export function parallelStepsFor(steps: Step[], stepId: string): Array<{ step: Step; index: number }> {
  return steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.parallelWith === stepId)
}

/** Durata totale indicativa della ricetta (somma delle durate dei passaggi). */
export function totalDuration(steps: Step[]): number {
  return steps.reduce((acc, s) => acc + (s.durationMin ?? s.timer?.minutes ?? 0), 0)
}

export function activeDuration(steps: Step[]): number {
  return steps
    .filter((s) => s.type !== 'rest' && s.type !== 'wait')
    .reduce((acc, s) => acc + (s.durationMin ?? s.timer?.minutes ?? 0), 0)
}
