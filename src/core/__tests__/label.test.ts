import { describe, expect, it } from 'vitest'
import type { Recipe } from '../model'
import { collectAllergens, detectAllergens, estimateGrams, labelItems, labelText } from '../label'
import { scaleRecipe } from '../scaling'

describe('allergeni dai nomi', () => {
  it('riconosce i casi comuni e scarta i falsi amici', () => {
    expect(detectAllergens('farina 00')).toEqual(['glutine'])
    expect(detectAllergens('burro')).toEqual(['latte'])
    expect(detectAllergens('noci')).toEqual(['frutta_a_guscio'])
    expect(detectAllergens('noce moscata')).toEqual([])
    expect(detectAllergens('arachidi tostate')).toEqual(['arachidi'])
    expect(detectAllergens('noccioline americane')).toEqual(['arachidi'])
    expect(detectAllergens('latte di cocco')).toEqual([])
    expect(detectAllergens('farina di riso')).toEqual([])
    expect(detectAllergens('uova')).toEqual(['uova'])
    expect(detectAllergens('vino bianco')).toEqual(['solfiti'])
    expect(detectAllergens('colla di pesce')).toEqual(['pesce'])
    expect(detectAllergens('salsa di soia')).toEqual(['soia'])
    expect(detectAllergens('semi di sesamo')).toEqual(['sesamo'])
    expect(detectAllergens('zucchero')).toEqual([])
  })
})

const now = '2026-01-01T00:00:00.000Z'
const frolla: Recipe = {
  id: 'frolla',
  title: 'Frolla',
  servings: 1,
  yield: { amount: 450, unit: 'g' },
  tags: [],
  ingredients: [
    { id: 'farina', name: 'farina 00', quantity: { amount: 250, unit: 'g' } },
    { id: 'burro', name: 'burro', quantity: { amount: 125, unit: 'g' } },
    { id: 'zucchero', name: 'zucchero', quantity: { amount: 75, unit: 'g' } },
    { id: 'uovo', name: 'uovo', quantity: { amount: 1, unit: '' }, scaling: { mode: 'discrete' } },
  ],
  steps: [],
  createdAt: now,
  updatedAt: now,
}
const crostata: Recipe = {
  id: 'crostata',
  title: 'Crostata',
  servings: 8,
  tags: [],
  ingredients: [
    { id: 'frolla', name: 'frolla', quantity: { amount: 450, unit: 'g' }, recipeId: 'frolla' },
    { id: 'marmellata', name: 'marmellata di albicocche', quantity: { amount: 300, unit: 'g' } },
    { id: 'mandorle', name: 'mandorle a lamelle', quantity: { amount: 30, unit: 'g' } },
    { id: 'sale', name: 'sale', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
  ],
  steps: [],
  createdAt: now,
  updatedAt: now,
}
const lookup = (id: string) => [frolla, crostata].find((r) => r.id === id)

describe('etichetta', () => {
  it('stima i grammi anche per uova e cucchiai', () => {
    const s = scaleRecipe(frolla, 1)
    expect(estimateGrams(s.byId.get('uovo')!)).toBe(55)
    expect(estimateGrams(s.byId.get('farina')!)).toBe(250)
  })
  it('ordina per peso, apre le basi tra parentesi, mette il q.b. in fondo', () => {
    const items = labelItems(crostata, 1, lookup)
    expect(items.map((i) => i.name)).toEqual(['frolla', 'marmellata di albicocche', 'mandorle a lamelle', 'sale'])
    expect(items[0]!.parts!.map((p) => p.name)).toEqual(['farina 00', 'burro', 'zucchero', 'uovo'])
    expect(items[0]!.allergens).toEqual(['glutine', 'uova', 'latte'])
    expect(collectAllergens(items)).toEqual(['glutine', 'uova', 'latte', 'frutta_a_guscio'])
    expect(labelText(items)).toBe('frolla (FARINA 00, BURRO, zucchero, UOVO), marmellata di albicocche, MANDORLE A LAMELLE, sale')
  })
  it('con la base spianata per peso il fattore segue la quantità', () => {
    const items = labelItems(crostata, 2, lookup)
    expect(items[0]!.parts![0]!.grams).toBe(500)
  })
})
