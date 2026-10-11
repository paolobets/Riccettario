import { describe, expect, it } from 'vitest'
import { applyIncoming, outgoingRows, staleTombstones } from '../sync'

interface R {
  id: string
  title: string
  updatedAt: string
}

describe('sincronizzazione', () => {
  it('scrive le righe nuove e quelle più recenti, salta quelle vecchie', () => {
    const local = new Map([
      ['a', '2026-10-10T10:00:00.000Z'],
      ['b', '2026-10-10T12:00:00.000Z'],
    ])
    const r = applyIncoming<R>(
      [
        { id: 'a', data: { id: 'a', title: 'A nuova', updatedAt: '2026-10-10T11:00:00.000Z' }, updated_at: '2026-10-10T11:00:00.000Z' },
        { id: 'b', data: { id: 'b', title: 'B vecchia', updatedAt: '2026-10-10T09:00:00.000Z' }, updated_at: '2026-10-10T09:00:00.000Z' },
        { id: 'c', data: { id: 'c', title: 'C', updatedAt: '2026-10-10T08:00:00.000Z' }, updated_at: '2026-10-10T08:00:00.000Z' },
      ],
      local,
    )
    expect(r.puts.map((p) => p.id)).toEqual(['a', 'c'])
    expect(r.deletes).toEqual([])
    expect(r.skipped).toBe(1)
  })
  it('applica le cancellazioni solo se più recenti e solo se la riga c\'è', () => {
    const local = new Map([
      ['a', '2026-10-10T10:00:00.000Z'],
      ['b', '2026-10-10T12:00:00.000Z'],
    ])
    const r = applyIncoming<R>(
      [
        { id: 'a', data: null, updated_at: '2026-10-10T11:00:00.000Z', deleted_at: '2026-10-10T11:00:00.000Z' },
        { id: 'b', data: null, updated_at: '2026-10-10T11:00:00.000Z', deleted_at: '2026-10-10T11:00:00.000Z' },
        { id: 'z', data: null, updated_at: '2026-10-10T11:00:00.000Z', deleted_at: '2026-10-10T11:00:00.000Z' },
      ],
      local,
    )
    expect(r.deletes).toEqual(['a'])
    expect(r.puts).toEqual([])
    expect(r.skipped).toBe(1)
  })
  it('a parità di orario la copia locale resta', () => {
    const r = applyIncoming<R>([{ id: 'a', data: { id: 'a', title: 'x', updatedAt: 't' }, updated_at: '2026-10-10T10:00:00.000Z' }], new Map([['a', '2026-10-10T10:00:00.000Z']]))
    expect(r.puts).toEqual([])
    expect(r.skipped).toBe(1)
  })
  it('manda solo ciò che è cambiato dopo l\'ultimo invio, cancellazioni comprese', () => {
    const items: R[] = [
      { id: 'a', title: 'A', updatedAt: '2026-10-10T10:00:00.000Z' },
      { id: 'b', title: 'B', updatedAt: '2026-10-10T12:00:00.000Z' },
    ]
    const tombs = [
      { table: 'recipes' as const, id: 'x', deletedAt: '2026-10-10T09:00:00.000Z' },
      { table: 'recipes' as const, id: 'y', deletedAt: '2026-10-10T13:00:00.000Z' },
    ]
    const rows = outgoingRows(items, (i) => i.updatedAt, tombs, '2026-10-10T11:00:00.000Z')
    expect(rows.map((r) => [r.id, r.deleted_at ?? null])).toEqual([
      ['b', null],
      ['y', '2026-10-10T13:00:00.000Z'],
    ])
    expect(outgoingRows(items, (i) => i.updatedAt, tombs, null)).toHaveLength(4)
  })
  it('individua le lapidi vecchie', () => {
    const now = new Date('2026-10-11T00:00:00.000Z')
    const tombs = [
      { table: 'recipes' as const, id: 'old', deletedAt: '2026-07-01T00:00:00.000Z' },
      { table: 'recipes' as const, id: 'new', deletedAt: '2026-10-01T00:00:00.000Z' },
    ]
    expect(staleTombstones(tombs, now).map((t) => t.id)).toEqual(['old'])
  })
})
