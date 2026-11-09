import { describe, expect, it } from 'vitest'
import type { Ingredient, Recipe } from '../model'
import { copyBaseInto } from '../bases'
import { collectAllergens, detectAllergens, estimateGrams, labelIngredients, labelItems, labelText, totalGrams } from '../label'
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
const conFrolla = (r: Recipe): Recipe => {
  const res = copyBaseInto(r, frolla, { amount: 450, unit: 'g' }, { replaceIngredientId: 'frolla' })
  if (!res.ok) throw new Error(res.problem)
  return res.recipe
}
const crostata: Recipe = conFrolla({
  id: 'crostata',
  title: 'Crostata',
  servings: 8,
  tags: [],
  ingredients: [
    { id: 'frolla', name: 'frolla', quantity: { amount: 450, unit: 'g' } },
    { id: 'marmellata', name: 'marmellata di albicocche', quantity: { amount: 300, unit: 'g' } },
    { id: 'mandorle', name: 'mandorle a lamelle', quantity: { amount: 30, unit: 'g' } },
    { id: 'sale', name: 'sale', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
  ],
  steps: [],
  createdAt: now,
  updatedAt: now,
})

describe('etichetta', () => {
  it('stima i grammi anche per uova e cucchiai', () => {
    const s = scaleRecipe(frolla, 1)
    expect(estimateGrams(s.byId.get('uovo')!)).toBe(55)
    expect(estimateGrams(s.byId.get('farina')!)).toBe(250)
  })
  it('ordina per peso, Basi copiate comprese, e mette il q.b. in fondo', () => {
    const items = labelItems(crostata, 1)
    expect(items.map((i) => i.name)).toEqual(['marmellata di albicocche', 'farina 00', 'burro', 'zucchero', 'uovo', 'mandorle a lamelle', 'sale'])
    expect(collectAllergens(items)).toEqual(['glutine', 'uova', 'latte', 'frutta_a_guscio'])
    expect(labelText(items)).toBe('marmellata di albicocche, FARINA 00, BURRO, zucchero, UOVO, MANDORLE A LAMELLE, sale')
  })
  it('elenco puntato: prende ogni ingrediente una volta sola', () => {
    const torta: Recipe = conFrolla({
      ...crostata,
      id: 'torta',
      baseCopies: undefined,
      ingredients: [
        { id: 'frolla', name: 'frolla', quantity: { amount: 450, unit: 'g' } },
        { id: 'burro2', name: 'Burro', quantity: { amount: 200, unit: 'g' } },
        { id: 'sale', name: 'sale', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
        { id: 'sale2', name: 'sale (fino)', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
      ],
    })
    const flat = labelIngredients(labelItems(torta, 1))
    // burro: 125 g dalla frolla + 200 g = 325 g, passa davanti alla farina (il nome è quello della voce più pesante)
    expect(flat.map((i) => i.name)).toEqual(['Burro', 'farina 00', 'zucchero', 'uovo', 'sale'])
    expect(flat[0]!.grams).toBe(325)
    expect(flat.find((i) => i.name === 'uovo')!.allergens).toEqual(['uova'])
  })
  it('il fattore scala anche gli ingredienti copiati', () => {
    const items = labelItems(crostata, 2)
    expect(items.find((i) => i.name === 'farina 00')!.grams).toBe(500)
    expect(totalGrams(crostata, 1)).toBe(250 + 125 + 75 + 55 + 300 + 30)
  })
  it('ignora un recipeId rimasto da dati vecchi', () => {
    const vecchia: Recipe = { ...crostata, ingredients: [{ id: 'frolla', name: 'frolla', quantity: { amount: 450, unit: 'g' }, recipeId: 'x' } as Ingredient] }
    const items = labelItems(vecchia, 1)
    expect(items).toEqual([{ name: 'frolla', grams: 450, allergens: [], toTaste: false }])
  })
})
