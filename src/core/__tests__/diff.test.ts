import { describe, expect, it } from 'vitest'
import { recipeChanges } from '../diff'
import type { Recipe } from '../model'
import { pane } from './fixtures'

describe('recipeChanges', () => {
  it('nessuna differenza per la stessa ricetta', () => {
    expect(recipeChanges(pane, structuredClone(pane))).toEqual([])
  })

  it('elenca porzioni, dosi, teglia, ingredienti e passaggi cambiati', () => {
    const after: Recipe = {
      ...structuredClone(pane),
      servings: 6,
      pan: { shape: 'rect', widthCm: 30, lengthCm: 40 },
      dosing: { mode: 'pans', dough: 'focaccia' },
    }
    after.ingredients = after.ingredients.filter((i) => i.id !== 'pepe')
    after.ingredients[0] = { ...after.ingredients[0]!, quantity: { amount: 600, unit: 'g' } }
    after.ingredients[2] = { ...after.ingredients[2]!, scaling: undefined }
    after.ingredients.push({ id: 'burro', name: 'burro', quantity: { amount: 120, unit: 'g' } })
    after.steps[1] = { ...after.steps[1]!, timer: { minutes: 90 } }
    expect(recipeChanges(pane, after)).toEqual([
      'Porzioni: 4 → 6',
      'Dosi per: porzioni → teglie, focaccia alta',
      'Teglia: nessuna → rettangolare 30×40 cm',
      'farina: 500 g → 600 g',
      'sale: scalatura lineare',
      'Aggiunto: burro, 120 g',
      'Tolto: pepe',
      'Un passaggio modificato',
    ])
  })

  it('accoppia per nome gli ingredienti con un id nuovo', () => {
    const after = structuredClone(pane)
    after.ingredients[1] = { ...after.ingredients[1]!, id: 'acqua-2' }
    after.steps = after.steps.slice(0, 1)
    expect(recipeChanges(pane, after)).toEqual(['Passaggi: 2 → 1'])
  })
})
