import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { aiRecipeSchema, aiToRecipe, type AiRecipe } from '../schema'
import { scaleRecipe, renderStepPlain } from '@/core'

const sample: AiRecipe = {
  title: 'Focaccia',
  description: '',
  servings: 6,
  yieldAmount: 900,
  yieldUnit: 'g',
  panShape: 'rect',
  panWidthCm: 30,
  panLengthCm: 0,
  tags: ['Lievitati', ' base '],
  ingredients: [
    { id: 'Farina 0', name: 'farina 0', amount: 500, unit: 'g', scaling: 'linear', bakersPercent: null, bakersOf: '', note: '', section: '', optional: false },
    { id: 'acqua', name: 'acqua', amount: 350, unit: 'ml', scaling: 'bakersPercent', bakersPercent: 70, bakersOf: 'Farina 0', note: '', section: '', optional: false },
    { id: 'sale', name: 'sale', amount: 10, unit: 'g', scaling: 'sublinear', bakersPercent: null, bakersOf: '', note: '', section: '', optional: false },
    { id: 'rosmarino', name: 'rosmarino', amount: null, unit: 'q.b.', scaling: 'toTaste', bakersPercent: null, bakersOf: '', note: '', section: '', optional: true },
    { id: 'olive', name: 'olive', amount: 12, unit: '', scaling: 'discrete', bakersPercent: null, bakersOf: 'inesistente', note: 'denocciolate', section: 'Condimento', optional: false },
    { id: 'olio', name: 'olio', amount: 30, unit: 'g', scaling: 'bakersPercent', bakersPercent: 6, bakersOf: 'inesistente', note: '', section: '', optional: false },
  ],
  steps: [
    { text: 'Mescola {Farina 0} e {acqua}.', type: 'prep', durationMin: 10, temperatureC: null, timerMinutes: null, timerLabel: '', equipment: ['ciotola'], section: '', parallelWithStep: null },
    { text: 'Lascia lievitare.', type: 'rest', durationMin: 120, temperatureC: null, timerMinutes: 120, timerLabel: 'Lievitazione', equipment: [], section: '', parallelWithStep: null },
    { text: 'Snocciola le {olive|nome} e trita il {rosmarino|nome}.', type: 'prep', durationMin: 5, temperatureC: null, timerMinutes: null, timerLabel: '', equipment: [], section: 'Condimento', parallelWithStep: 1 },
    { text: 'Condisci con {olio} e {burro}.', type: 'cook', durationMin: null, temperatureC: 220, timerMinutes: 20, timerLabel: '', equipment: [], section: '', parallelWithStep: 5 },
  ],
  notes: '',
  source: 'nonna',
}

describe('aiToRecipe', () => {
  const { recipe, warnings } = aiToRecipe(sample)

  it('normalizza id, tag e riferimenti', () => {
    expect(recipe.ingredients.map((i) => i.id)).toEqual(['farina-0', 'acqua', 'sale', 'rosmarino', 'olive', 'olio'])
    expect(recipe.tags).toEqual(['lievitati', 'base'])
    expect(recipe.steps[0]!.text).toBe('Mescola {farina-0} e {acqua}.')
    expect(recipe.steps[2]!.text).toBe('Snocciola le {olive|nome} e trita il {rosmarino|nome}.')
  })

  it('risolve le percentuali del panettiere e scarta quelle senza base', () => {
    expect(recipe.ingredients[1]!.scaling).toEqual({ mode: 'bakersPercent', percent: 70, of: 'farina-0' })
    expect(recipe.ingredients[5]!.scaling).toBeUndefined()
    expect(warnings.some((w) => w.includes('olio'))).toBe(true)
  })

  it('gestisce q.b., discreti e facoltativi', () => {
    expect(recipe.ingredients[3]!.quantity).toEqual({ amount: 1, unit: 'q.b.' })
    expect(recipe.ingredients[3]!.scaling).toEqual({ mode: 'toTaste' })
    expect(recipe.ingredients[3]!.optional).toBe(true)
    expect(recipe.ingredients[4]!.scaling).toEqual({ mode: 'discrete' })
    expect(recipe.ingredients[4]!.section).toBe('Condimento')
  })

  it('segnala i riferimenti sconosciuti e li lascia intatti', () => {
    expect(recipe.steps[3]!.text).toContain('{burro}')
    expect(warnings.some((w) => w.includes('burro'))).toBe(true)
  })

  it('traduce timer, sezioni e passaggi paralleli', () => {
    expect(recipe.steps[1]!.timer).toEqual({ minutes: 120, label: 'Lievitazione' })
    expect(recipe.steps[2]!.parallelWith).toBe(recipe.steps[1]!.id)
    expect(recipe.steps[3]!.parallelWith).toBeUndefined() // indice non valido (futuro)
    expect(recipe.sections).toEqual(['Condimento'])
    expect(recipe.yield).toEqual({ amount: 900, unit: 'g' })
    expect(recipe.source).toBe('nonna')
    expect(recipe.pan).toEqual({ shape: 'rect', widthCm: 30, lengthCm: 30 })
    expect(aiToRecipe({ ...sample, panShape: 'round', panWidthCm: 24 }).recipe.pan).toEqual({ shape: 'round', diameterCm: 24 })
    expect(aiToRecipe({ ...sample, panShape: '', panWidthCm: 0 }).recipe.pan).toBeUndefined()
  })

  it('produce una ricetta che il motore sa scalare', () => {
    const scaled = scaleRecipe(recipe, 2)
    expect(scaled.byId.get('acqua')!.scaled!.amount).toBe(700)
    expect(renderStepPlain(recipe.steps[0]!, scaled)).toBe('Mescola 1 kg di farina 0 e 700 ml di acqua.')
  })

  it('resta entro il limite API di 16 parametri con tipi unione', () => {
    const json = JSON.stringify(zodOutputFormat(aiRecipeSchema).schema)
    const unions = (json.match(/"anyOf":/g)?.length ?? 0) + (json.match(/"type":\[/g)?.length ?? 0)
    expect(unions).toBeLessThanOrEqual(16)
  })

  it('lo schema zod accetta il campione', () => {
    expect(aiRecipeSchema.safeParse(sample).success).toBe(true)
  })
})
