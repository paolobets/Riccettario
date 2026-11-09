import { describe, expect, it } from 'vitest'
import type { Recipe } from '../model'
import { baseUnits, pickerQuantity, baseFingerprint, baseUsages, defaultSelection, saveSelectionAsBase, copyBaseInto, copyStatus, forgetBase, isBase, sectionFingerprint, setBase, updateBaseCopy, wouldCycle } from '../bases'

const now = '2026-01-01T00:00:00.000Z'
const pasticcera: Recipe = {
  id: 'pasticcera',
  title: 'Pasticcera',
  servings: 1,
  yield: { amount: 600, unit: 'g' },
  tags: ['base'],
  ingredients: [
    { id: 'latte', name: 'latte', quantity: { amount: 500, unit: 'g' } },
    { id: 'tuorli', name: 'tuorli', quantity: { amount: 4, unit: '' }, scaling: { mode: 'discrete' } },
    { id: 'zucchero', name: 'zucchero', quantity: { amount: 150, unit: 'g' } },
  ],
  steps: [
    { id: 's1', text: 'Scalda {latte}.' },
    { id: 's2', text: 'Sbatti {tuorli} con {zucchero} e unisci al latte.', durationMin: 10 },
  ],
  createdAt: now,
  updatedAt: now,
}
const crostata: Recipe = {
  id: 'crostata',
  title: 'Crostata',
  servings: 8,
  tags: [],
  ingredients: [
    { id: 'frolla', name: 'frolla', quantity: { amount: 400, unit: 'g' } },
    { id: 'crema', name: 'crema pasticcera', quantity: { amount: 300, unit: 'g' } },
  ],
  steps: [{ id: 'f1', text: 'Farcisci con {crema}' }],
  createdAt: now,
  updatedAt: now,
}

function copied(r: Recipe = crostata) {
  const res = copyBaseInto(r, pasticcera, { amount: 300, unit: 'g' }, { replaceIngredientId: 'crema' })
  if (!res.ok) throw new Error(res.problem)
  return res.recipe
}

describe('copiare una Base', () => {
  it('copia a metà dose sostituendo la riga', () => {
    const r = copied()
    expect(r.ingredients.map((i) => i.id)).toEqual(['frolla', 'pasticcera-latte', 'pasticcera-tuorli', 'pasticcera-zucchero'])
    expect(r.ingredients.find((i) => i.id === 'pasticcera-latte')).toMatchObject({ name: 'latte', quantity: { amount: 250, unit: 'g' }, section: 'Pasticcera' })
    expect(r.ingredients.find((i) => i.id === 'pasticcera-zucchero')?.quantity).toEqual({ amount: 75, unit: 'g' })
    expect(r.ingredients.find((i) => i.id === 'pasticcera-tuorli')).toMatchObject({ quantity: { amount: 2, unit: '' }, scaling: { mode: 'discrete' } })
    expect(r.steps.map((s) => s.id)).toEqual(['pasticcera-s1', 'pasticcera-s2', 'f1'])
    expect(r.steps[0]).toMatchObject({ text: 'Scalda {pasticcera-latte}.', section: 'Pasticcera' })
    expect(r.steps[2]?.text).toBe('Farcisci con crema pasticcera')
    expect(r.baseCopies).toEqual([
      { section: 'Pasticcera', baseId: 'pasticcera', baseVersion: baseFingerprint(pasticcera), quantity: { amount: 300, unit: 'g' }, prefix: 'pasticcera', copied: sectionFingerprint(r, 'Pasticcera') },
    ])
    expect(r.sections).toEqual(['Pasticcera'])
  })

  it('aggiunge in coda e mette i passaggi della Base per primi', () => {
    const res = copyBaseInto(crostata, pasticcera, { amount: 1, unit: '' })
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.map((i) => i.id)).toEqual(['frolla', 'crema', 'pasticcera-latte', 'pasticcera-tuorli', 'pasticcera-zucchero'])
    expect(res.recipe.ingredients[2]?.quantity).toEqual({ amount: 500, unit: 'g' })
    expect(res.recipe.steps.map((s) => s.id)).toEqual(['pasticcera-s1', 'pasticcera-s2', 'f1'])
    expect(res.recipe.steps[2]?.text).toBe('Farcisci con {crema}')
  })

  it('la stessa Base due volte', () => {
    const once = copied()
    const res = copyBaseInto(once, pasticcera, { amount: 600, unit: 'g' })
    if (!res.ok) throw new Error(res.problem)
    const r = res.recipe
    expect(r.baseCopies?.map((c) => [c.section, c.prefix])).toEqual([
      ['Pasticcera', 'pasticcera'],
      ['Pasticcera (2)', 'pasticcera-2'],
    ])
    const ids = [...r.ingredients.map((i) => i.id), ...r.steps.map((s) => s.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.steps.map((s) => s.id)).toEqual(['pasticcera-s1', 'pasticcera-s2', 'pasticcera-2-s1', 'pasticcera-2-s2', 'f1'])
    expect(r.ingredients.find((i) => i.id === 'pasticcera-2-latte')?.section).toBe('Pasticcera (2)')
  })

  it('rifiuta una quantità non utilizzabile', () => {
    const qb = copyBaseInto(crostata, pasticcera, { amount: 1, unit: 'q.b.' })
    expect(qb.ok).toBe(false)
    const senzaResa = copyBaseInto(crostata, { ...pasticcera, yield: undefined }, { amount: 300, unit: 'g' })
    expect(senzaResa.ok).toBe(false)
    if (!senzaResa.ok) expect(senzaResa.problem).toContain('Pasticcera')
  })

  it('sezioni interne della Base prendono un nome composto', () => {
    const conSezioni: Recipe = {
      ...pasticcera,
      id: 'pronta',
      title: 'Crostata pronta',
      ingredients: pasticcera.ingredients.map((i) => ({ ...i, section: 'Crema' })),
      steps: pasticcera.steps.map((s) => ({ ...s, section: 'Crema' })),
    }
    const res = copyBaseInto(crostata, conSezioni, { amount: 1, unit: '' })
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients[2]?.section).toBe('Crostata pronta: Crema')
    expect(res.recipe.baseCopies?.[0]?.section).toBe('Crostata pronta')
  })

  it('riscrive anche percentuali del panettiere e passaggi in parallelo', () => {
    const base: Recipe = {
      ...pasticcera,
      ingredients: [...pasticcera.ingredients, { id: 'amido', name: 'amido', quantity: { amount: 40, unit: 'g' }, scaling: { mode: 'bakersPercent', percent: 8, of: 'latte' } }],
      steps: [...pasticcera.steps, { id: 's3', text: 'Raffredda', parallelWith: 's2' }],
    }
    const res = copyBaseInto(crostata, base, { amount: 1, unit: '' })
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'pasticcera-amido')?.scaling).toEqual({ mode: 'bakersPercent', percent: 8, of: 'pasticcera-latte' })
    expect(res.recipe.steps.find((s) => s.id === 'pasticcera-s3')?.parallelWith).toBe('pasticcera-s2')
  })
})

describe('sezioni con i due punti nel nome', () => {
  const piuZucchero: Recipe = { ...pasticcera, ingredients: pasticcera.ingredients.map((i) => (i.id === 'zucchero' ? { ...i, quantity: { amount: 160, unit: 'g' as const } } : i)) }

  it("aggiornare una copia non tocca una sezione dell'utente che inizia col suo nome", () => {
    const conDecoro: Recipe = { ...crostata, ingredients: [...crostata.ingredients, { id: 'granella', name: 'granella', quantity: { amount: 20, unit: 'g' }, section: 'Pasticcera: decoro' }] }
    const r = copied(conDecoro)
    const copy = r.baseCopies![0]!
    expect(copyStatus(r, copy, pasticcera)).toBe('current')
    const res = updateBaseCopy(r, 'Pasticcera', piuZucchero)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'granella')?.section).toBe('Pasticcera: decoro')
  })

  it('due Basi «Crema» e «Crema: light» restano distinte', () => {
    const crema: Recipe = { ...pasticcera, id: 'crema-b', title: 'Crema' }
    const light: Recipe = { ...pasticcera, id: 'light', title: 'Crema: light' }
    const one = copyBaseInto(crostata, crema, { amount: 1, unit: '' })
    if (!one.ok) throw new Error(one.problem)
    const two = copyBaseInto(one.recipe, light, { amount: 1, unit: '' })
    if (!two.ok) throw new Error(two.problem)
    const c = two.recipe.baseCopies!.find((x) => x.baseId === 'crema-b')!
    expect(copyStatus(two.recipe, c, crema)).toBe('current')
    const res = updateBaseCopy(two.recipe, c.section, { ...crema, ingredients: crema.ingredients.slice(0, 1) })
    if (!res.ok) throw new Error(res.problem)
    const l = res.recipe.baseCopies!.find((x) => x.baseId === 'light')!
    expect(copyStatus(res.recipe, l, light)).toBe('current')
  })
})

describe('ritocchi', () => {
  it('il dialogo propone la quantità giusta', () => {
    const senzaResa: Recipe = { ...pasticcera, yield: undefined }
    // "2 pz" su una Base a dosi: 2 dosi
    expect(pickerQuantity(senzaResa, { amount: 2, unit: 'pz' }, true)).toEqual({ amount: '2', unit: '' })
    // riga senza quantità usabile su una Base a grammi: niente precompilato, si chiede
    expect(pickerQuantity(pasticcera, undefined, true)).toEqual({ amount: '', unit: 'g' })
    expect(pickerQuantity(pasticcera, { amount: 1, unit: 'q.b.' }, true)).toEqual({ amount: '', unit: 'g' })
    // riga in grammi: quella quantità
    expect(pickerQuantity(pasticcera, { amount: 300, unit: 'g' }, true)).toEqual({ amount: '300', unit: 'g' })
    // aggiungendo senza riga: la resa intera
    expect(pickerQuantity(pasticcera, undefined, false)).toEqual({ amount: '600', unit: 'g' })
    expect(baseUnits(pasticcera)).toEqual(['g', 'kg', ''])
  })

  it('sostituire una riga toglie le percentuali che la usavano come base', () => {
    const r: Recipe = { ...crostata, ingredients: [...crostata.ingredients, { id: 'rum', name: 'rum', quantity: { amount: 15, unit: 'g' }, scaling: { mode: 'bakersPercent', percent: 5, of: 'crema' } }] }
    const res = copyBaseInto(r, pasticcera, { amount: 300, unit: 'g' }, { replaceIngredientId: 'crema' })
    if (!res.ok) throw new Error(res.problem)
    const rum = res.recipe.ingredients.find((i) => i.id === 'rum')!
    expect(rum.scaling).toBeUndefined()
    expect(rum.quantity).toEqual({ amount: 15, unit: 'g' })
  })

  it('aggiornare pulisce paralleli e percentuali esterne verso elementi tolti', () => {
    const r = copied()
    const conRif: Recipe = {
      ...r,
      ingredients: [...r.ingredients, { id: 'rum', name: 'rum', quantity: { amount: 15, unit: 'g' }, scaling: { mode: 'bakersPercent', percent: 5, of: 'pasticcera-tuorli' } }],
      steps: [...r.steps, { id: 'f2', text: 'Raffredda', parallelWith: 'pasticcera-s2' }],
    }
    const ridotta: Recipe = { ...pasticcera, ingredients: pasticcera.ingredients.filter((i) => i.id !== 'tuorli'), steps: [{ id: 's1', text: 'Scalda {latte} con {zucchero}.' }] }
    const res = updateBaseCopy(conRif, 'Pasticcera', ridotta)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'rum')?.scaling).toBeUndefined()
    expect(res.recipe.steps.find((s) => s.id === 'f2')?.parallelWith).toBeUndefined()
  })

  it("aggiornare non crea id doppi se un id nuovo c'è già fuori dalla sezione", () => {
    const r = copied()
    const conPanna: Recipe = { ...r, ingredients: [...r.ingredients, { id: 'pasticcera-panna', name: 'panna', quantity: { amount: 100, unit: 'g' } }] }
    const conPannaBase: Recipe = { ...pasticcera, ingredients: [...pasticcera.ingredients, { id: 'panna', name: 'panna', quantity: { amount: 100, unit: 'g' } }] }
    const res = updateBaseCopy(conPanna, 'Pasticcera', conPannaBase)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.problem).toContain('panna')
  })

})

describe('impronte', () => {
  it('ignora stringhe e liste vuote', () => {
    const r = copied()
    const sporca: Recipe = {
      ...r,
      ingredients: r.ingredients.map((i) => ({ ...i, note: '', optional: false })),
      steps: r.steps.map((s) => ({ ...s, equipment: [] })),
    }
    expect(sectionFingerprint(sporca, 'Pasticcera')).toBe(sectionFingerprint(r, 'Pasticcera'))
  })

  it('cambia se cambia un ingrediente della sezione', () => {
    const r = copied()
    const mod: Recipe = { ...r, ingredients: r.ingredients.map((i) => (i.id === 'pasticcera-zucchero' ? { ...i, quantity: { amount: 80, unit: 'g' as const } } : i)) }
    expect(sectionFingerprint(mod, 'Pasticcera')).not.toBe(sectionFingerprint(r, 'Pasticcera'))
    expect(baseFingerprint({ ...pasticcera, yield: { amount: 700, unit: 'g' } })).not.toBe(baseFingerprint(pasticcera))
  })

  it('non cambia per ingredienti fuori sezione', () => {
    const r = copied()
    const mod: Recipe = { ...r, ingredients: r.ingredients.map((i) => (i.id === 'frolla' ? { ...i, quantity: { amount: 500, unit: 'g' as const } } : i)) }
    expect(sectionFingerprint(mod, 'Pasticcera')).toBe(sectionFingerprint(r, 'Pasticcera'))
  })
})

describe('Basi', () => {
  it('si segnano col tag base', () => {
    expect(isBase(pasticcera)).toBe(true)
    expect(isBase(crostata)).toBe(false)
    expect(setBase(crostata, true).tags).toEqual(['base'])
    expect(isBase(setBase(pasticcera, false))).toBe(false)
  })

  it('wouldCycle segue le copie', () => {
    const A: Recipe = { ...pasticcera, id: 'A', baseCopies: [{ section: 'B', baseId: 'B', baseVersion: '', quantity: { amount: 1, unit: '' }, prefix: 'b', copied: '' }] }
    const B: Recipe = { ...pasticcera, id: 'B' }
    expect(wouldCycle([A, B], 'B', 'A')).toBe(true)
    expect(wouldCycle([A, B], 'X', 'A')).toBe(false)
    expect(wouldCycle([A, B], 'A', 'A')).toBe(true)
  })
})

describe('aggiornare le copie', () => {
  const piuZucchero: Recipe = { ...pasticcera, ingredients: pasticcera.ingredients.map((i) => (i.id === 'zucchero' ? { ...i, quantity: { amount: 160, unit: 'g' as const } } : i)) }
  const copy = (r: Recipe, section = 'Pasticcera') => r.baseCopies!.find((c) => c.section === section)!

  it('stati', () => {
    const r = copied()
    expect(copyStatus(r, copy(r), pasticcera)).toBe('current')
    expect(copyStatus(r, copy(r), piuZucchero)).toBe('outdated')
    const mod: Recipe = { ...r, ingredients: r.ingredients.map((i) => (i.id === 'pasticcera-zucchero' ? { ...i, quantity: { amount: 90, unit: 'g' as const } } : i)) }
    expect(copyStatus(mod, copy(mod), pasticcera)).toBe('modified')
    expect(copyStatus(mod, copy(mod), piuZucchero)).toBe('modified')
    expect(copyStatus(r, copy(r), undefined)).toBe('orphan')
  })

  it('aggiorna tenendo la quantità', () => {
    const r = copied()
    const doppia: Recipe = { ...pasticcera, yield: { amount: 1200, unit: 'g' }, ingredients: pasticcera.ingredients.map((i) => ({ ...i, quantity: { ...i.quantity!, amount: i.quantity!.amount * 2 } })) }
    const res = updateBaseCopy(r, 'Pasticcera', doppia)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'pasticcera-latte')?.quantity).toEqual({ amount: 250, unit: 'g' })
    expect(res.recipe.ingredients.map((i) => i.id)).toEqual(r.ingredients.map((i) => i.id))
    expect(res.recipe.steps.map((s) => s.id)).toEqual(r.steps.map((s) => s.id))
    expect(copyStatus(res.recipe, copy(res.recipe), doppia)).toBe('current')
  })

  it('aggiorna i valori cambiati nella Base', () => {
    const r = copied()
    const res = updateBaseCopy(r, 'Pasticcera', piuZucchero)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'pasticcera-zucchero')?.quantity).toEqual({ amount: 80, unit: 'g' })
  })

  it('non aggiorna se la resa non va più bene', () => {
    const res = updateBaseCopy(copied(), 'Pasticcera', { ...pasticcera, yield: undefined })
    expect(res).toEqual({ ok: false, problem: 'La resa della Base è cambiata: scegli di nuovo la quantità.' })
  })

  it('riferimento esterno a un ingrediente tolto', () => {
    const r = copied()
    const conRif: Recipe = { ...r, steps: [...r.steps, { id: 'f2', text: 'Spennella con {pasticcera-tuorli}' }] }
    const senzaTuorli: Recipe = { ...pasticcera, ingredients: pasticcera.ingredients.filter((i) => i.id !== 'tuorli'), steps: [{ id: 's1', text: 'Scalda {latte} con {zucchero}.' }] }
    const res = updateBaseCopy(conRif, 'Pasticcera', senzaTuorli)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.steps.find((s) => s.id === 'f2')?.text).toBe('Spennella con tuorli')
    expect(res.recipe.steps.map((s) => s.id)).toEqual(['pasticcera-s1', 'f1', 'f2'])
  })

  it('aggiorna solo la copia scelta', () => {
    const two = copyBaseInto(copied(), pasticcera, { amount: 600, unit: 'g' })
    if (!two.ok) throw new Error(two.problem)
    const res = updateBaseCopy(two.recipe, 'Pasticcera (2)', piuZucchero)
    if (!res.ok) throw new Error(res.problem)
    expect(res.recipe.ingredients.find((i) => i.id === 'pasticcera-2-zucchero')?.quantity).toEqual({ amount: 160, unit: 'g' })
    expect(res.recipe.ingredients.find((i) => i.id === 'pasticcera-zucchero')?.quantity).toEqual({ amount: 75, unit: 'g' })
    expect(copyStatus(res.recipe, copy(res.recipe, 'Pasticcera'), piuZucchero)).toBe('outdated')
  })

  it('usi diretti', () => {
    const r = copied()
    const torta: Recipe = { ...crostata, id: 'torta', title: 'Torta semplice' }
    const pronta = copyBaseInto({ ...crostata, id: 'pronta', title: 'Crostata pronta', tags: ['base'], ingredients: [], steps: [] }, pasticcera, { amount: 1, unit: '' })
    if (!pronta.ok) throw new Error(pronta.problem)
    const usaPronta = copyBaseInto({ ...crostata, id: 'usa', title: 'Aaa usa la pronta' }, pronta.recipe, { amount: 1, unit: '' })
    if (!usaPronta.ok) throw new Error(usaPronta.problem)
    const usi = baseUsages([r, torta, pronta.recipe, usaPronta.recipe, pasticcera], pasticcera)
    expect(usi.map((u) => [u.recipe.title, u.status])).toEqual([
      ['Crostata', 'current'],
      ['Crostata pronta', 'current'],
    ])
  })

  it("forgetBase toglie l'origine e lascia ingredienti e passaggi", () => {
    const r = copied()
    const f = forgetBase(r, 'pasticcera')
    expect(f.baseCopies).toBeUndefined()
    expect(f.ingredients).toEqual(r.ingredients)
    expect(f.steps).toEqual(r.steps)
  })
})

describe('salva come Base', () => {
  const mista: Recipe = {
    ...crostata,
    id: 'mista',
    title: 'Torta mista',
    ingredients: [
      { id: 'a', name: 'farina', quantity: { amount: 200, unit: 'g' } },
      { id: 'latte', name: 'latte', quantity: { amount: 300, unit: 'g' } },
      { id: 'b', name: 'burro', quantity: { amount: 100, unit: 'g' } },
      { id: 'c', name: 'zucchero a velo', quantity: { amount: 50, unit: 'g' } },
      { id: 'tuorli', name: 'tuorli', quantity: { amount: 3, unit: '' }, scaling: { mode: 'discrete' } },
      { id: 'd', name: 'sale', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
    ],
    steps: [
      { id: 'p1', text: 'Impasta {a} e {b}' },
      { id: 'p2', text: 'Scalda {latte}' },
      { id: 'p3', text: 'Stendi' },
      { id: 'p4', text: 'Inforna' },
      { id: 'p5', text: 'Unisci {tuorli} al latte', parallelWith: 'p4' },
      { id: 'p6', text: 'Farcisci con {latte|nome}' },
    ],
  }

  it('selezione sparsa: Base con gli stessi id, ricetta raggruppata', () => {
    const { base, recipe } = saveSelectionAsBase(mista, { ingredientIds: ['latte', 'tuorli'], stepIds: ['p2', 'p5'], title: 'Crema', baseId: 'crema' }, now)
    expect(base).toMatchObject({ id: 'crema', title: 'Crema', tags: ['base'], servings: 8 })
    expect(base.ingredients.map((i) => i.id)).toEqual(['latte', 'tuorli'])
    expect(base.ingredients.every((i) => i.section === undefined)).toBe(true)
    expect(base.steps.map((s) => s.id)).toEqual(['p2', 'p5'])
    expect(base.steps[1]?.parallelWith).toBeUndefined()
    expect(base.yield).toEqual({ amount: 300, unit: 'g' })

    expect(recipe.ingredients.map((i) => i.id)).toEqual(['a', 'latte', 'tuorli', 'b', 'c', 'd'])
    expect(recipe.ingredients.filter((i) => i.section === 'Crema').map((i) => i.id)).toEqual(['latte', 'tuorli'])
    expect(recipe.steps.map((s) => s.id)).toEqual(['p1', 'p2', 'p5', 'p3', 'p4', 'p6'])
    expect(recipe.steps.find((s) => s.id === 'p6')?.text).toBe('Farcisci con {latte|nome}')
    expect(recipe.steps.find((s) => s.id === 'p5')?.parallelWith).toBe('p4')
    expect(recipe.baseCopies).toEqual([expect.objectContaining({ section: 'Crema', baseId: 'crema', prefix: '', quantity: { amount: 1, unit: '' } })])
    expect(copyStatus(recipe, recipe.baseCopies![0]!, base)).toBe('current')
  })

  it('nella Base i riferimenti a ingredienti non scelti diventano nomi', () => {
    const conPercent: Recipe = { ...mista, ingredients: mista.ingredients.map((i) => (i.id === 'c' ? { ...i, scaling: { mode: 'bakersPercent' as const, percent: 25, of: 'a' } } : i)) }
    const { base } = saveSelectionAsBase(conPercent, { ingredientIds: ['latte', 'c'], stepIds: ['p1', 'p2'], title: 'Crema', baseId: 'crema' }, now)
    expect(base.steps.find((s) => s.id === 'p1')?.text).toBe('Impasta farina e burro')
    expect(base.steps.find((s) => s.id === 'p2')?.text).toBe('Scalda {latte}')
    expect(base.ingredients.find((i) => i.id === 'c')?.scaling).toBeUndefined()
  })

  it("una sezione intera salvata col suo nome non diventa «(2)»", () => {
    const conSezione: Recipe = { ...mista, ingredients: mista.ingredients.map((i) => (i.id === 'latte' || i.id === 'tuorli' ? { ...i, section: 'Crema' } : i)), steps: mista.steps.map((s) => (s.id === 'p2' ? { ...s, section: 'Crema' } : s)) }
    const sel = defaultSelection(conSezione, 'Crema')
    expect(sel).toEqual({ ingredientIds: ['latte', 'tuorli'], stepIds: ['p2', 'p5', 'p6'] })
    const { recipe } = saveSelectionAsBase(conSezione, { ...sel, title: 'Crema', baseId: 'crema' }, now)
    expect(recipe.baseCopies?.[0]?.section).toBe('Crema')
  })

  it("da una copia modificata nasce una Base nuova e la vecchia origine sparisce", () => {
    const r = copied()
    const arancia: Recipe = { ...r, ingredients: [...r.ingredients, { id: 'scorza', name: "scorza d'arancia", quantity: { amount: 1, unit: 'pz' }, section: 'Pasticcera' }] }
    const sel = defaultSelection(arancia, 'Pasticcera')
    const { base, recipe } = saveSelectionAsBase(arancia, { ...sel, title: "Pasticcera all'arancia", baseId: 'pa' }, now)
    expect(base.ingredients).toHaveLength(4)
    expect(recipe.baseCopies?.map((c) => [c.section, c.baseId])).toEqual([["Pasticcera all'arancia", 'pa']])
    expect(recipe.ingredients).toHaveLength(arancia.ingredients.length)
  })
})
