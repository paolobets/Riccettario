import { describe, expect, it } from 'vitest'
import {
  bakersPercentages,
  factorFromPivot,
  factorFromServings,
  factorFromYield,
  isFactorFeasible,
  scaleRecipe,
  suggestFeasibleFactors,
} from '../scaling'
import { pane } from './fixtures'

const q = (r: ReturnType<typeof scaleRecipe>, id: string) => r.byId.get(id)!.scaled!

describe('scaleRecipe', () => {
  it('a fattore 1 restituisce le quantità originali', () => {
    const r = scaleRecipe(pane, 1)
    expect(q(r, 'farina')).toEqual({ amount: 500, unit: 'g' })
    expect(q(r, 'acqua')).toEqual({ amount: 350, unit: 'ml' })
    expect(q(r, 'uova')).toEqual({ amount: 2, unit: '' })
    expect(r.warnings).toEqual([])
  })

  it('lineare: moltiplica', () => {
    const r = scaleRecipe(pane, 2)
    expect(q(r, 'farina').amount).toBe(1000)
    expect(q(r, 'olio').amount).toBe(4)
  })

  it('percentuale del panettiere segue la base scalata', () => {
    const r = scaleRecipe(pane, 1.5)
    expect(q(r, 'farina').amount).toBe(750)
    expect(q(r, 'acqua').amount).toBe(525)
  })

  it('fisso e q.b. non cambiano', () => {
    const r = scaleRecipe(pane, 3)
    expect(q(r, 'lievito').amount).toBe(1)
    expect(q(r, 'pepe')).toEqual({ amount: 1, unit: 'q.b.' })
  })

  it('sub-lineare: raddoppiando il sale non raddoppia', () => {
    const r = scaleRecipe(pane, 2)
    const sale = q(r, 'sale').amount
    expect(sale).toBeGreaterThan(15)
    expect(sale).toBeLessThan(20)
    // 10 * 2^0.8 = 17.41 → arrotondato a 17
    expect(sale).toBe(17)
  })

  it('discreto: arrotonda a pezzi interi e segnala', () => {
    const r = scaleRecipe(pane, 1.3) // 2.6 uova → 3
    const uova = r.byId.get('uova')!
    expect(uova.scaled!.amount).toBe(3)
    expect(uova.adjusted).toBe(true)
    expect(uova.warning).toContain('2,6')
  })

  it('discreto: rounding ceil/floor e limiti', () => {
    const recipe = {
      ...pane,
      ingredients: [
        { id: 'a', name: 'a', quantity: { amount: 2, unit: '' as const }, scaling: { mode: 'discrete' as const, rounding: 'ceil' as const } },
        { id: 'b', name: 'b', quantity: { amount: 2, unit: '' as const }, scaling: { mode: 'discrete' as const, rounding: 'floor' as const, min: 1 } },
        { id: 'c', name: 'c', quantity: { amount: 2, unit: '' as const }, scaling: { mode: 'discrete' as const, step: 2 } },
      ],
    }
    const r = scaleRecipe(recipe, 1.1)
    expect(q(r, 'a').amount).toBe(3)
    expect(q(r, 'b').amount).toBe(2)
    expect(q(r, 'c').amount).toBe(2) // 2.2/2 = 1.1 → 1 → 2
    expect(q(scaleRecipe(recipe, 0.1), 'b').amount).toBe(1)
  })

  it('arrotonda a misure pratiche', () => {
    const r = scaleRecipe(pane, 1.37)
    expect(q(r, 'farina').amount).toBe(685) // 685 esatto, passo 5
    expect(q(r, 'olio').amount).toBe(2.75) // 2.74 → quarti
  })

  it('avvisa quando il fattore è estremo', () => {
    expect(scaleRecipe(pane, 3).warnings.join(' ')).toMatch(/tempi di cottura/)
    expect(scaleRecipe(pane, 0.25).warnings.join(' ')).toMatch(/tempi di cottura/)
    expect(scaleRecipe(pane, 1.5).warnings.join(' ')).toMatch(/Sale/)
  })

  it('porzioni e resa seguono il fattore', () => {
    const r = scaleRecipe(pane, 2)
    expect(r.servings).toBe(8)
    expect(r.yield).toEqual({ amount: 1700, unit: 'g' })
  })

  it('fattore non valido viene riportato a 1', () => {
    expect(scaleRecipe(pane, 0).factor).toBe(1)
    expect(scaleRecipe(pane, NaN).factor).toBe(1)
  })
})

describe('calcolo del fattore', () => {
  it('da porzioni', () => {
    expect(factorFromServings(pane, 6)).toBe(1.5)
  })
  it('da resa', () => {
    expect(factorFromYield(pane, 1700)).toBe(2)
    expect(factorFromYield({ ...pane, yield: undefined }, 100)).toBeNull()
  })
  it('pivot lineare: ho 300 g di farina', () => {
    const p = factorFromPivot(pane, 'farina', 300)
    expect(p).toEqual({ ok: true, factor: 0.6 })
    const r = scaleRecipe(pane, 0.6)
    expect(q(r, 'acqua').amount).toBe(210)
  })
  it('pivot su percentuale del panettiere: ho 700 ml di acqua', () => {
    const p = factorFromPivot(pane, 'acqua', 700)
    expect(p.ok && p.factor).toBeCloseTo(2)
  })
  it('pivot su sub-lineare inverte la curva', () => {
    const p = factorFromPivot(pane, 'sale', 17.411)
    expect(p.ok && p.factor).toBeCloseTo(2, 3)
  })
  it('pivot su fisso o q.b. non è permesso', () => {
    expect(factorFromPivot(pane, 'lievito', 2).ok).toBe(false)
    expect(factorFromPivot(pane, 'pepe', 2).ok).toBe(false)
    expect(factorFromPivot(pane, 'inesistente', 2).ok).toBe(false)
  })
})

describe('fattori fattibili per ingredienti discreti', () => {
  it('propone i fattori che danno uova intere', () => {
    const s = suggestFeasibleFactors(pane, 1.3)
    expect(s.map((x) => x.count)).toEqual([3, 2])
    expect(s[0]!.factor).toBe(1.5)
  })
  it('riconosce i fattori fattibili', () => {
    expect(isFactorFeasible(pane, 1.5)).toBe(true)
    expect(isFactorFeasible(pane, 1.3)).toBe(false)
  })
})

describe('percentuali del panettiere', () => {
  it('calcola le percentuali rispetto alla farina', () => {
    const p = bakersPercentages(pane, 'farina')
    expect(p.find((x) => x.id === 'sale')?.percent).toBe(2)
    expect(p.find((x) => x.id === 'acqua')).toBeUndefined() // unità diversa (ml)
  })
})
