import { describe, expect, it } from 'vitest'
import type { Recipe } from '@/core'
import { fromRecipe, toRecipe } from '../draft'

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    title: 'Crostata',
    servings: 8,
    tags: ['dolci'],
    ingredients: [
      { id: 'farina', name: 'farina 00', quantity: { amount: 300, unit: 'g' }, note: undefined, section: 'Frolla' },
      { id: 'crema', name: 'latte', quantity: { amount: 250, unit: 'ml' }, section: 'Crema' },
    ],
    steps: [
      { id: 's1', text: 'Impasta {farina}', equipment: undefined, section: 'Frolla' },
      { id: 's2', text: 'Cuoci la crema', section: 'Crema' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  }
}

describe('bozza del wizard', () => {
  it('conserva i campi fuori bozza', () => {
    const r = recipe({ label: { notes: 'x', allergens: ['latte'] }, favorite: true })
    const out = toRecipe(fromRecipe(r), r)
    expect(out.label).toEqual({ notes: 'x', allergens: ['latte'] })
    expect(out.favorite).toBe(true)
    expect(out.id).toBe('r1')
    expect(out.createdAt).toBe(r.createdAt)
  })

  it('andata e ritorno stabile su ingredienti e passaggi', () => {
    const r = recipe()
    const out = toRecipe(fromRecipe(r), r)
    expect(out.ingredients).toEqual(r.ingredients)
    expect(out.steps).toEqual(r.steps)
    expect(out.steps[0]?.equipment).toBeUndefined()
  })

  it("scarta l'origine di una sezione sparita", () => {
    const copy = { section: 'Crema', baseId: 'b', baseVersion: 'v', quantity: { amount: 1, unit: '' as const }, prefix: 'crema', copied: 'c' }
    const r = recipe({ baseCopies: [copy] })
    const d = fromRecipe(r)
    d.ingredients = d.ingredients.map((i) => ({ ...i, section: i.section === 'Crema' ? 'Crema al limone' : i.section }))
    d.steps = d.steps.map((s) => ({ ...s, section: s.section === 'Crema' ? '' : s.section }))
    expect(toRecipe(d, r).baseCopies).toBeUndefined()
    expect(toRecipe(fromRecipe(r), r).baseCopies).toEqual([copy])
  })
})
