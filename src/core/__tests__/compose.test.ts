import { describe, expect, it } from 'vitest'
import type { Recipe } from '../model'
import { baseFactor, detachBase, flattenIngredients, resolveBases, usedAsBaseIn, wouldCycle } from '../compose'
import { buildShoppingList } from '../shopping'
import { scaleRecipe } from '../scaling'
import { renderStepPlain } from '../steps'
import { checkRecipe } from '../lint'

const now = '2026-01-01T00:00:00.000Z'
const frolla: Recipe = {
  id: 'frolla',
  title: 'Frolla alle noci',
  servings: 1,
  yield: { amount: 600, unit: 'g' },
  tags: ['base'],
  ingredients: [
    { id: 'farina', name: 'farina', quantity: { amount: 300, unit: 'g' } },
    { id: 'burro', name: 'burro', quantity: { amount: 150, unit: 'g' } },
    { id: 'noci', name: 'noci', quantity: { amount: 100, unit: 'g' } },
    { id: 'uova', name: 'uova', quantity: { amount: 1, unit: '' }, scaling: { mode: 'discrete' } },
  ],
  steps: [{ id: 's1', text: 'Impasta {farina}, {burro} e {noci} con {uova}.', durationMin: 10 }],
  createdAt: now,
  updatedAt: now,
}
const crema: Recipe = {
  id: 'crema',
  title: 'Crema al mascarpone',
  servings: 8,
  tags: ['base'],
  ingredients: [
    { id: 'mascarpone', name: 'mascarpone', quantity: { amount: 500, unit: 'g' } },
    { id: 'uova', name: 'uova', quantity: { amount: 4, unit: '' }, scaling: { mode: 'discrete' } },
  ],
  steps: [{ id: 's1', text: 'Monta {mascarpone} con {uova}.' }],
  createdAt: now,
  updatedAt: now,
}
const crostata: Recipe = {
  id: 'crostata',
  title: 'Crostata moderna',
  servings: 8,
  tags: [],
  ingredients: [
    { id: 'frolla', name: 'frolla alle noci', quantity: { amount: 300, unit: 'g' }, recipeId: 'frolla' },
    { id: 'crema', name: 'crema al mascarpone', quantity: { amount: 1, unit: '' }, recipeId: 'crema' },
    { id: 'lamponi', name: 'lamponi', quantity: { amount: 200, unit: 'g' } },
  ],
  steps: [{ id: 's1', text: 'Fodera lo stampo con {frolla}, farcisci con {crema} e decora con {lamponi}.' }],
  createdAt: now,
  updatedAt: now,
}
const all = [frolla, crema, crostata]
const lookup = (id: string) => all.find((r) => r.id === id)

describe('ricette composte', () => {
  it('fattore della base: a peso dalla resa, a dosi dal numero', () => {
    expect(baseFactor({ amount: 300, unit: 'g' }, frolla).factor).toBeCloseTo(0.5)
    expect(baseFactor({ amount: 1.2, unit: 'kg' }, frolla).factor).toBeCloseTo(2)
    expect(baseFactor({ amount: 2, unit: '' }, crema).factor).toBe(2)
    expect(baseFactor({ amount: 500, unit: 'g' }, crema).problem).toMatch(/non ha una resa in grammi/)
    expect(baseFactor({ amount: 2, unit: 'cucchiaio' }, frolla).problem).toMatch(/grammi, millilitri o dosi/)
    expect(baseFactor(undefined, frolla).factor).toBeNull()
  })
  it('le basi seguono il fattore della ricetta madre', () => {
    const scaled = scaleRecipe(crostata, 2)
    const bases = resolveBases(scaled.ingredients, lookup)
    expect(bases.map((b) => [b.base?.id, b.factor])).toEqual([
      ['frolla', 1],
      ['crema', 2],
    ])
    const missing = resolveBases(scaleRecipe({ ...crostata, ingredients: [{ ...crostata.ingredients[0]!, recipeId: 'sparita' }] }, 1).ingredients, lookup)
    expect(missing[0]!.problem).toMatch(/non c'è più/)
  })
  it('spiana le basi con sezione e id composti', () => {
    const flat = flattenIngredients(crostata, 1, lookup)
    const names = flat.map((i) => `${i.section ?? '-'}: ${i.name} ${i.scaled?.amount ?? ''}`)
    expect(names).toContain('frolla alle noci: farina 150')
    expect(names).toContain('frolla alle noci: uova 1')
    expect(names).toContain('crema al mascarpone: mascarpone 500')
    expect(names).toContain('-: lamponi 200')
    expect(flat.find((i) => i.name === 'farina')!.id).toBe('frolla/farina')
  })
  it('la spesa somma anche dentro le basi', () => {
    const lines = buildShoppingList([{ recipe: crostata, factor: 1 }], lookup)
    expect(lines.find((l) => l.key === 'uova|')!.quantity!.amount).toBe(5) // 1 (frolla ×0,5 arrotondata) + 4
    expect(lines.find((l) => l.name === 'farina')!.quantity).toEqual({ amount: 150, unit: 'g' })
    expect(lines.some((l) => l.name === 'frolla alle noci')).toBe(false)
    // senza lookup la base resta una riga
    expect(buildShoppingList([{ recipe: crostata, factor: 1 }]).some((l) => l.name === 'frolla alle noci')).toBe(true)
  })
  it('niente giri, e si vede chi usa una base', () => {
    expect(wouldCycle(lookup, 'crostata', 'frolla')).toBe(false)
    expect(wouldCycle(lookup, 'frolla', 'crostata')).toBe(true)
    expect(wouldCycle(lookup, 'frolla', 'frolla')).toBe(true)
    expect(usedAsBaseIn(all, 'frolla').map((r) => r.id)).toEqual(['crostata'])
    const detached = detachBase(crostata, 'frolla')
    expect(detached.ingredients[0]!.recipeId).toBeUndefined()
    expect(detached.ingredients[0]!.quantity).toEqual({ amount: 300, unit: 'g' })
  })
  it('una base a dosi si legge "1 dose di"', () => {
    const scaled = scaleRecipe(crostata, 1)
    expect(renderStepPlain(crostata.steps[0]!, scaled)).toBe('Fodera lo stampo con 300 g di frolla alle noci, farcisci con 1 dose di crema al mascarpone e decora con 200 g di lamponi.')
    expect(renderStepPlain(crostata.steps[0]!, scaleRecipe(crostata, 2))).toContain('2 dosi di crema al mascarpone')
  })
  it('il controllo segnala basi senza resa o sparite', () => {
    const r: Recipe = { ...crostata, ingredients: [{ id: 'crema', name: 'crema', quantity: { amount: 200, unit: 'g' }, recipeId: 'crema' }, { id: 'x', name: 'x', quantity: { amount: 1, unit: '' }, recipeId: 'nope' }], steps: [{ id: 's', text: '{crema} {x}' }] }
    const w = checkRecipe(r, lookup)
    expect(w.some((x) => x.startsWith('Base «crema»'))).toBe(true)
    expect(w.some((x) => x.includes('non c\'è più'))).toBe(true)
  })
})

import { defaultSplitSelection, splitRecipe } from '../compose'

describe('scomporre una ricetta', () => {
  const tiramisu: Recipe = {
    id: 'tiramisu',
    title: 'Tiramisù',
    servings: 8,
    tags: ['dolci'],
    sections: ['Crema', 'Montaggio'],
    ingredients: [
      { id: 'uova', name: 'uova', quantity: { amount: 4, unit: '' }, scaling: { mode: 'discrete' }, section: 'Crema' },
      { id: 'mascarpone', name: 'mascarpone', quantity: { amount: 500, unit: 'g' }, section: 'Crema' },
      { id: 'savoiardi', name: 'savoiardi', quantity: { amount: 300, unit: 'g' }, section: 'Montaggio' },
    ],
    steps: [
      { id: 's1', text: 'Monta {uova} con {mascarpone}.', section: 'Crema' },
      { id: 's2', text: 'Alterna {savoiardi} e {mascarpone|nome} montato.', section: 'Montaggio' },
      { id: 's3', text: 'Riposa in frigo.', section: 'Montaggio', parallelWith: 's1' },
    ],
    createdAt: now,
    updatedAt: now,
  }
  it('la selezione per sezione prende ingredienti e passaggi giusti', () => {
    const sel = defaultSplitSelection(tiramisu, 'Crema')
    expect(sel.ingredientIds).toEqual(['uova', 'mascarpone'])
    expect(sel.stepIds).toEqual(['s1'])
  })
  it('crea la base e la sostituisce nella madre con una dose collegata', () => {
    const { base, parent } = splitRecipe(tiramisu, { ...defaultSplitSelection(tiramisu, 'Crema'), title: 'Crema al mascarpone', baseId: 'crema-m' }, now)
    expect(base.ingredients.map((i) => i.id)).toEqual(['uova', 'mascarpone'])
    expect(base.steps.map((s) => s.id)).toEqual(['s1'])
    expect(base.tags).toContain('base')
    expect(base.ingredients[0]!.section).toBeUndefined()
    expect(parent.ingredients.map((i) => i.id)).toEqual(['crema-al-mascarpone', 'savoiardi'])
    expect(parent.ingredients[0]).toMatchObject({ recipeId: 'crema-m', quantity: { amount: 1, unit: '' }, section: 'Crema' })
    expect(parent.steps.map((s) => s.text)).toEqual(['Alterna {savoiardi} e {crema-al-mascarpone|nome} montato.', 'Riposa in frigo.'])
    expect(parent.steps[1]!.parallelWith).toBeUndefined()
    expect(renderStepPlain(parent.steps[0]!, scaleRecipe(parent, 1))).toBe('Alterna 300 g di savoiardi e crema al mascarpone montato.')
  })
})
