import { describe, expect, it } from 'vitest'
import type { Recipe } from '../model'
import { lastCookedDays, matchedIngredients, pantryWords, rankSuggestions, stem } from '../suggest'

const now = new Date('2026-10-10T18:00:00Z')

function recipe(id: string, title: string, ingredients: string[], activeMin: number, tags: string[] = []): Recipe {
  return {
    id,
    title,
    servings: 2,
    tags,
    ingredients: ingredients.map((name) => ({ id: name, name })),
    steps: [{ id: 's1', text: 'Cuoci', type: 'cook', durationMin: activeMin }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

const carbonara = recipe('carbonara', 'Spaghetti alla carbonara', ['spaghetti', 'guanciale', 'tuorli', 'pecorino romano grattugiato'], 30, ['primi'])
const frittata = recipe('frittata', 'Frittata di zucchine', ['uova', 'zucchine', 'parmigiano'], 15, ['secondi', 'veloce'])
const pizza = recipe('pizza', 'Impasto per pizza', ['farina 0', 'acqua', 'lievito'], 35, ['base'])

describe('suggerimenti', () => {
  it('riduce singolare e plurale alla stessa radice', () => {
    expect(stem('zucchine')).toBe(stem('zucchina'))
    expect(stem('uova')).toBe(stem('uovo'))
    expect(stem('pomodori')).toBe(stem('pomodoro'))
    expect(stem('Caffè')).toBe('caff')
  })
  it('estrae le parole utili dalla dispensa', () => {
    expect(pantryWords('2 uova, un po\' di pecorino e delle zucchine')).toEqual(['uov', 'pecorin', 'zucchin'])
  })
  it('trova gli ingredienti che ho in casa', () => {
    expect(matchedIngredients(carbonara, pantryWords('uova e pecorino'))).toEqual(['pecorino romano grattugiato'])
    expect(matchedIngredients(frittata, pantryWords('uova e pecorino'))).toEqual(['uova'])
    expect(matchedIngredients(frittata, [])).toEqual([])
  })
  it('calcola i giorni dall\'ultima cottura conclusa', () => {
    const map = lastCookedDays(
      [
        { recipeId: 'carbonara', finishedAt: '2026-10-01T20:00:00Z' },
        { recipeId: 'carbonara', finishedAt: '2026-10-08T20:00:00Z' },
        { recipeId: 'frittata' },
      ],
      now,
    )
    expect(map.get('carbonara')).toBe(1)
    expect(map.has('frittata')).toBe(false)
  })
  it('esclude le ricette oltre il tempo e i tag non voluti', () => {
    const r = rankSuggestions([carbonara, frittata, pizza], [], { maxActiveMinutes: 20, excludeTags: ['base'] })
    expect(r.map((s) => s.recipe.id)).toEqual(['frittata'])
  })
  it('premia la dispensa e penalizza le cotture recenti', () => {
    const r = rankSuggestions([carbonara, frittata], [{ recipeId: 'frittata', finishedAt: '2026-10-09T20:00:00Z' }], { pantry: 'uova, zucchine', now })
    expect(r[0]!.recipe.id).toBe('frittata') // 2 ingredienti (6) - 3 recente = 3
    expect(r[0]!.matched).toEqual(['uova', 'zucchine'])
    expect(r[0]!.daysSinceCooked).toBe(0)
    expect(r[1]!.recipe.id).toBe('carbonara') // 0 ingredienti + 2 mai cucinata = 2
    expect(r[1]!.daysSinceCooked).toBeNull()
  })
  it('a parità di punteggio ordina per titolo', () => {
    const r = rankSuggestions([carbonara, frittata], [], { now })
    expect(r.map((s) => s.recipe.title)).toEqual(['Frittata di zucchine', 'Spaghetti alla carbonara'])
  })
})
