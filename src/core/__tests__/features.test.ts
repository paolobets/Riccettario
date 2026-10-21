import { describe, expect, it } from 'vitest'
import { pane } from './fixtures'
import type { Recipe } from '../model'
import { buildShoppingList, shoppingListText } from '../shopping'
import { planBackwards, parseReadyAt, stepMinutes, upcomingStarts } from '../schedule'
import { DOUGH_TYPES, doughTypeOf, doughWeight, equivalentRound, factorFromPan, factorFromPans, factorFromPieces, formatPan, panArea, recipeDoughDensity, splitDough, totalPanArea } from '../pan'
import { checkRecipe } from '../lint'
import { decodeRecipeFromLink, encodeRecipeForLink, recipeToText } from '../share'
import { scaleRecipe } from '../scaling'

const pizza: Recipe = {
  ...pane,
  id: 'pizza',
  title: 'Pizza',
  ingredients: [
    { id: 'farina', name: 'Farina (00)', quantity: { amount: 1, unit: 'kg' } },
    { id: 'sale', name: 'sale', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
    { id: 'olio', name: 'olio', quantity: { amount: 30, unit: 'ml' }, optional: true },
    { id: 'uova', name: 'uova', quantity: { amount: 1, unit: '' }, scaling: { mode: 'discrete' } },
  ],
  steps: [{ id: 'p1', text: 'Impasta {farina}.' }],
}

describe('lista della spesa', () => {
  it('somma lo stesso ingrediente tra ricette, in unità base e con i fattori', () => {
    const lines = buildShoppingList([
      { recipe: pane, factor: 1 },
      { recipe: pizza, factor: 2 },
    ])
    const farina = lines.find((l) => l.key === 'farina|g')!
    expect(farina.quantity).toEqual({ amount: 2.5, unit: 'kg' }) // 500 g + 2 kg
    expect(farina.sources.map((s) => s.title)).toEqual(['Pane', 'Pizza'])
    const uova = lines.find((l) => l.key === 'uova|')!
    expect(uova.quantity).toEqual({ amount: 4, unit: '' }) // 2 + 2
  })
  it('"quanto basta" si aggancia alla riga quantificata o fa riga a sé', () => {
    const lines = buildShoppingList([
      { recipe: pane, factor: 1 },
      { recipe: pizza, factor: 1 },
    ])
    const sale = lines.find((l) => l.name === 'sale')!
    expect(sale.quantity).toEqual({ amount: 10, unit: 'g' })
    expect(sale.sources).toHaveLength(2)
    const pepe = lines.find((l) => l.name === 'pepe')!
    expect(pepe.toTaste).toBe(true)
    expect(pepe.quantity).toBeUndefined()
  })
  it('facoltativo solo se lo è ovunque; testo senza le righe spuntate', () => {
    const lines = buildShoppingList([{ recipe: pizza, factor: 1 }])
    expect(lines.find((l) => l.name === 'olio')!.optional).toBe(true)
    const text = shoppingListText(lines, new Set(['uova|']))
    expect(text).toContain('- 1 kg Farina (00)')
    expect(text).toContain('- 30 ml olio, facoltativo')
    expect(text).not.toContain('uova')
    expect(text).toContain('- sale, q.b.')
  })
  it('ordina per nome', () => {
    const names = buildShoppingList([{ recipe: pane, factor: 1 }]).map((l) => l.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'it')))
  })
})

describe('pronto per le', () => {
  const steps = [
    { id: 'a', text: 'Impasta', durationMin: 15 },
    { id: 'b', text: 'Lievita', type: 'rest' as const, timer: { minutes: 120 } },
    { id: 'c', text: 'Prepara il sugo', durationMin: 20, parallelWith: 'b' },
    { id: 'd', text: 'Inforna', durationMin: 2, timer: { minutes: 12 } },
  ]
  const ready = new Date('2026-10-11T20:00:00')
  it('somma solo il percorso critico e colloca i paralleli con il padre', () => {
    const plan = planBackwards(steps, ready)
    expect(plan.totalMinutes).toBe(15 + 120 + 12)
    expect(plan.startAt).toEqual(new Date('2026-10-11T17:33:00'))
    const byId = Object.fromEntries(plan.items.map((i) => [i.step.id, i]))
    expect(byId.d!.startsAt).toEqual(new Date('2026-10-11T19:48:00'))
    expect(byId.b!.startsAt).toEqual(new Date('2026-10-11T17:48:00'))
    expect(byId.c!.startsAt).toEqual(byId.b!.startsAt)
    expect(byId.c!.parallel).toBe(true)
    expect(plan.items.map((i) => i.index)).toEqual([0, 1, 2, 3])
  })
  it('timer o durata, la più lunga', () => {
    expect(stepMinutes(steps[3]!)).toBe(12)
  })
  it('prossimi avvii dal più vicino', () => {
    const plan = planBackwards(steps, ready)
    const next = upcomingStarts(plan, new Date('2026-10-11T17:40:00'))
    expect(next.map((i) => i.step.id)).toEqual(['b', 'c', 'd'])
  })
  it('orario di oggi o di domani', () => {
    const now = new Date('2026-10-11T18:00:00')
    expect(parseReadyAt('20:00', now)).toEqual(new Date('2026-10-11T20:00:00'))
    expect(parseReadyAt('08:30', now)).toEqual(new Date('2026-10-12T08:30:00'))
    expect(parseReadyAt('25:00', now)).toBeNull()
    expect(parseReadyAt('', now)).toBeNull()
  })
})

describe('teglia', () => {
  const torta: Recipe = { ...pane, pan: { shape: 'round', diameterCm: 24 } }
  it('fattore dal rapporto tra le aree', () => {
    expect(factorFromPan(torta, { shape: 'round', diameterCm: 24 })).toBeCloseTo(1)
    expect(factorFromPan(torta, { shape: 'round', diameterCm: 28 })).toBeCloseTo((28 / 24) ** 2)
    expect(factorFromPan(torta, { shape: 'rect', widthCm: 30, lengthCm: 20 })).toBeCloseTo(600 / panArea({ shape: 'round', diameterCm: 24 }))
  })
  it('senza teglia nella ricetta non si può', () => {
    expect(factorFromPan(pane, { shape: 'round', diameterCm: 20 })).toBeNull()
    expect(factorFromPan(torta, { shape: 'round', diameterCm: 0 })).toBeNull()
  })
  it('formato ed equivalenze', () => {
    expect(formatPan({ shape: 'round', diameterCm: 24 })).toBe('tonda da 24 cm')
    expect(formatPan({ shape: 'rect', widthCm: 30, lengthCm: 20 })).toBe('rettangolare 30×20 cm')
    expect(equivalentRound({ shape: 'rect', widthCm: 30, lengthCm: 20 })).toBe(28)
  })
})

describe('più teglie e impasti', () => {
  const quadrata: Recipe = { ...pane, title: 'Focaccia', pan: { shape: 'rect', widthCm: 30, lengthCm: 30 } }
  const pizza: Recipe = { ...pane, title: 'Pizza in teglia', yield: undefined, pan: undefined }
  it('area totale e fattore da più teglie', () => {
    const due = [{ pan: { shape: 'rect' as const, widthCm: 15, lengthCm: 25 }, count: 2 }]
    expect(totalPanArea(due)).toBe(750)
    expect(factorFromPans(quadrata, due)).toBeCloseTo(750 / 900)
    expect(factorFromPans(quadrata, [{ pan: { shape: 'rect', widthCm: 40, lengthCm: 40 }, count: 1 }])).toBeCloseTo(1600 / 900)
    expect(factorFromPans(quadrata, [])).toBeNull()
  })
  it('peso dell\'impasto: resa, oppure somma di grammi e millilitri senza q.b. e fissi', () => {
    expect(doughWeight(pane)).toBe(850)
    expect(doughWeight(pizza)).toBe(860) // farina 500 + acqua 350 + sale 10
    const conSezioni: Recipe = {
      ...pizza,
      ingredients: [
        { id: 'farina', name: 'farina', quantity: { amount: 1, unit: 'kg' }, section: 'Impasto' },
        { id: 'mozzarella', name: 'mozzarella', quantity: { amount: 300, unit: 'g' }, section: 'Condimento' },
      ],
    }
    expect(doughWeight(conSezioni)).toBe(1000)
  })
  it('senza teglia nella ricetta usa i grammi per cm²', () => {
    expect(factorFromPans(pizza, [{ pan: { shape: 'rect', widthCm: 40, lengthCm: 40 }, count: 1 }])).toBeNull()
    expect(factorFromPans(pizza, [{ pan: { shape: 'rect', widthCm: 40, lengthCm: 40 }, count: 1 }], 0.55)).toBeCloseTo((1600 * 0.55) / 860)
  })
  it('indice di carico: 60×40 di pizza in teglia ≈ 1,2 kg, 30×40 di genovese ≈ 500 g', () => {
    const impasto = (t: keyof typeof DOUGH_TYPES, w: number, l: number) => totalPanArea([{ pan: { shape: 'rect', widthCm: w, lengthCm: l }, count: 1 }]) * DOUGH_TYPES[t].gPerCm2
    expect(impasto('pizzaTeglia', 60, 40)).toBeCloseTo(1200)
    expect(Math.round(impasto('genovese', 30, 40))).toBe(504)
  })
  it('pizze da n grammi, densità della ricetta e divisione tra teglie', () => {
    expect(factorFromPieces(pizza, 4, 250)).toBeCloseTo(1000 / 860)
    expect(factorFromPieces(pizza, 0, 250)).toBeNull()
    expect(recipeDoughDensity({ ...pane, pan: { shape: 'rect', widthCm: 25, lengthCm: 34 } })).toBeCloseTo(1)
    const parts = splitDough(1200, [
      { pan: { shape: 'rect', widthCm: 40, lengthCm: 40 }, count: 1 },
      { pan: { shape: 'rect', widthCm: 20, lengthCm: 40 }, count: 1 },
    ])
    expect(parts.map((p) => Math.round(p.grams))).toEqual([800, 400])
  })
  it('riconosce pizza, focaccia e pinsa', () => {
    expect(doughTypeOf(pizza)).toBe('pizzaTeglia')
    expect(doughTypeOf(quadrata)).toBe('focaccia')
    expect(doughTypeOf({ ...pane, title: 'Fugassa' })).toBe('genovese')
    expect(doughTypeOf({ ...pane, title: 'Pizza napoletana' })).toBe('napoletana')
    expect(doughTypeOf({ ...pane, title: 'Pinsa romana' })).toBe('pinsa')
    expect(doughTypeOf(pane)).toBeUndefined()
  })
})

describe('controllo della ricetta', () => {
  it('non ha nulla da dire su una ricetta a posto', () => {
    const ok: Recipe = {
      ...pane,
      ingredients: [{ id: 'farina', name: 'farina', quantity: { amount: 500, unit: 'g' } }],
      steps: [{ id: 's1', text: 'Mescola {farina}.', durationMin: 5 }],
    }
    expect(checkRecipe(ok)).toEqual([])
  })
  it('segnala uova lineari, passi lunghi senza timer, riposi senza paralleli, ingredienti mai citati', () => {
    const r: Recipe = {
      ...pane,
      ingredients: [
        { id: 'uova', name: 'uova', quantity: { amount: 2, unit: '' } },
        { id: 'farina', name: 'farina', quantity: { amount: 500, unit: 'g' } },
      ],
      steps: [
        { id: 's1', text: 'Sbatti {uova}.', type: 'cook', durationMin: 15 },
        { id: 's2', text: 'Lascia riposare.', type: 'rest', timer: { minutes: 60 } },
      ],
    }
    const w = checkRecipe(r)
    expect(w.some((x) => x.includes('«uova» scala a pezzi interi'))).toBe(true)
    expect(w.some((x) => x.startsWith('Il passo 1 dura 15 min ma non ha un timer'))).toBe(true)
    expect(w.some((x) => x.startsWith('Durante il riposo del passo 2 (1 h)'))).toBe(true)
    expect(w.some((x) => x.includes('mai citati nei passaggi: farina'))).toBe(true)
  })
  it('passo vuoto, parallelo inesistente, base del panettiere mancante', () => {
    const r: Recipe = {
      ...pane,
      ingredients: [{ id: 'acqua', name: 'acqua', quantity: { amount: 300, unit: 'ml' }, scaling: { mode: 'bakersPercent', percent: 60, of: 'farina' } }],
      steps: [
        { id: 's1', text: '   ' },
        { id: 's2', text: 'Versa {acqua}.', parallelWith: 'nope' },
      ],
    }
    const w = checkRecipe(r)
    expect(w).toContain('Il passo 1 è vuoto.')
    expect(w).toContain('Il passo 2 è segnato come parallelo a un passaggio che non esiste.')
    expect(w).toContain('«acqua»: percentuale del panettiere senza ingrediente base.')
  })
})

describe('condivisione', () => {
  it('testo con dosi riscalate, sezioni e passaggi', () => {
    const text = recipeToText(scaleRecipe(pane, 2))
    expect(text.startsWith('PANE')).toBe(true)
    expect(text).toContain('Per 8 porzioni (×2)')
    expect(text).toContain('- 1 kg di farina')
    expect(text).toContain('1. Mescola 1 kg di farina con 700 ml di acqua e sale.')
    expect(text).toContain('(timer 60 min)')
  })
  it('link: andata e ritorno senza id e date', () => {
    const encoded = encodeRecipeForLink({ ...pane, favorite: true, notes: 'Con accenti: è già perché' })
    expect(encoded).not.toMatch(/[+/=]/)
    const back = decodeRecipeFromLink(encoded)!
    expect(back.title).toBe('Pane')
    expect(back.notes).toBe('Con accenti: è già perché')
    expect(back.ingredients).toHaveLength(pane.ingredients.length)
    expect('id' in back).toBe(false)
    expect('favorite' in back).toBe(false)
    expect(decodeRecipeFromLink('non-un-link')).toBeNull()
    expect(decodeRecipeFromLink(btoa('{"title":1}'))).toBeNull()
  })
})
