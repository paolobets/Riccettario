import type { Recipe } from '../model'

export const pane: Recipe = {
  id: 'pane',
  title: 'Pane',
  servings: 4,
  yield: { amount: 850, unit: 'g' },
  tags: [],
  ingredients: [
    { id: 'farina', name: 'farina', quantity: { amount: 500, unit: 'g' } },
    { id: 'acqua', name: 'acqua', quantity: { amount: 350, unit: 'ml' }, scaling: { mode: 'bakersPercent', percent: 70, of: 'farina' } },
    { id: 'sale', name: 'sale', quantity: { amount: 10, unit: 'g' }, scaling: { mode: 'sublinear' } },
    { id: 'lievito', name: 'lievito', quantity: { amount: 1, unit: 'bustina' }, scaling: { mode: 'fixed' } },
    { id: 'uova', name: 'uova', quantity: { amount: 2, unit: '' }, scaling: { mode: 'discrete' } },
    { id: 'pepe', name: 'pepe', quantity: { amount: 1, unit: 'q.b.' }, scaling: { mode: 'toTaste' } },
    { id: 'olio', name: 'olio', quantity: { amount: 2, unit: 'cucchiaio' } },
  ],
  steps: [
    { id: 's1', text: 'Mescola {farina} con {acqua} e {sale|nome}.', durationMin: 10, type: 'prep' },
    { id: 's2', text: 'Aggiungi {uova} e lascia riposare.', timer: { minutes: 60 }, type: 'rest' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
