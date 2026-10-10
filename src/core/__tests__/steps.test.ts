import { describe, expect, it } from 'vitest'
import { scaleRecipe } from '../scaling'
import { ingredientIdsInStep, parallelStepsFor, renderStep, renderStepPlain, totalDuration } from '../steps'
import { pane } from './fixtures'

describe('steps', () => {
  it('estrae gli id citati', () => {
    expect(ingredientIdsInStep(pane.steps[0]!)).toEqual(['farina', 'acqua', 'sale'])
  })
  it('rende le quantità riscalate nel testo', () => {
    const r = scaleRecipe(pane, 2)
    expect(renderStepPlain(pane.steps[0]!, r)).toBe('Mescola 1 kg di farina con 700 ml di acqua e sale.')
    expect(renderStepPlain(pane.steps[1]!, r)).toBe('Aggiungi 4 uova e lascia riposare.')
  })
  it('segnala riferimenti mancanti', () => {
    const r = scaleRecipe(pane, 1)
    const segs = renderStep({ id: 'x', text: 'Usa {burro}.' }, r)
    expect(segs[1]).toMatchObject({ kind: 'missing', id: 'burro' })
  })
  it('trova i passaggi paralleli', () => {
    const steps = [
      { id: 'a', text: 'Riposa', type: 'rest' as const },
      { id: 'b', text: 'Prepara il sugo', parallelWith: 'a' },
      { id: 'c', text: 'Impiatta' },
    ]
    expect(parallelStepsFor(steps, 'a').map((p) => [p.step.id, p.index])).toEqual([['b', 1]])
    expect(parallelStepsFor(steps, 'c')).toEqual([])
  })
  it('somma le durate', () => {
    expect(totalDuration(pane.steps)).toBe(70)
  })
})
