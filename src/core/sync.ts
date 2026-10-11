/**
 * Sincronizzazione tra dispositivi: la parte pura, senza rete né database.
 *
 * Ogni riga viaggia come `{ id, data, updated_at, deleted_at }`. La regola è
 * una sola: per ogni id vince la modifica con `updated_at` più recente, su
 * qualsiasi dispositivo sia avvenuta; una cancellazione è una modifica come le
 * altre (`data` nullo e `deleted_at` valorizzato).
 */

export interface SyncRow<T> {
  id: string
  data: T | null
  updated_at: string
  deleted_at?: string | null
}

export interface Tombstone {
  table: 'recipes' | 'sessions' | 'chats'
  id: string
  deletedAt: string
}

export interface Applied<T> {
  /** Righe da scrivere in locale. */
  puts: T[]
  /** Id da cancellare in locale. */
  deletes: string[]
  /** Righe ignorate perché la copia locale è più recente. */
  skipped: number
}

/**
 * Decide cosa fare delle righe arrivate dal server dato lo stato locale
 * (`localUpdatedAt`: id → updated_at della copia locale, assente se non c'è).
 */
export function applyIncoming<T>(incoming: SyncRow<T>[], localUpdatedAt: Map<string, string>): Applied<T> {
  const out: Applied<T> = { puts: [], deletes: [], skipped: 0 }
  for (const row of incoming) {
    const local = localUpdatedAt.get(row.id)
    if (local !== undefined && local >= row.updated_at) {
      out.skipped++
      continue
    }
    if (row.deleted_at || row.data === null) {
      if (local !== undefined) out.deletes.push(row.id)
    } else {
      out.puts.push(row.data)
    }
  }
  return out
}

/**
 * Righe locali da mandare al server: quelle modificate dopo l'ultimo invio
 * (confronto con l'orologio locale, lo stesso che ha scritto `updatedAt`) più
 * le cancellazioni registrate dopo quel momento.
 */
export function outgoingRows<T extends { id: string }>(
  items: T[],
  updatedAtOf: (item: T) => string,
  tombstones: Tombstone[],
  sinceLocal: string | null,
): SyncRow<T>[] {
  const rows: SyncRow<T>[] = []
  for (const item of items) {
    const u = updatedAtOf(item)
    if (sinceLocal === null || u > sinceLocal) rows.push({ id: item.id, data: item, updated_at: u, deleted_at: null })
  }
  for (const t of tombstones) {
    if (sinceLocal === null || t.deletedAt > sinceLocal) rows.push({ id: t.id, data: null, updated_at: t.deletedAt, deleted_at: t.deletedAt })
  }
  return rows
}

/** Lapidi più vecchie di `days` giorni: ormai tutti i dispositivi le hanno viste. */
export function staleTombstones(tombstones: Tombstone[], now: Date, days = 60): Tombstone[] {
  const limit = new Date(now.getTime() - days * 86_400_000).toISOString()
  return tombstones.filter((t) => t.deletedAt < limit)
}
