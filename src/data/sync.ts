/**
 * Sincronizzazione con il server (rotta POST /sync del proxy): manda le
 * modifiche locali, riceve quelle degli altri dispositivi, applica "l'ultima
 * modifica vince" riga per riga (logica pura in src/core/sync.ts).
 *
 * Due cursori: `since` è l'ora del server dell'ultimo scambio (cosa ricevere),
 * `pushedAt` è l'ora locale dell'ultimo invio (cosa mandare). Orologi diversi
 * non si confrontano mai tra loro.
 */
import { useSyncExternalStore } from 'react'
import { applyIncoming, outgoingRows, staleTombstones, type Recipe, type SyncRow, type Tombstone } from '@/core'
import { loadAiSettings, saveAiSettings } from '@/ai/settings'
import { db, type Chat, type CookSession } from './db'

export interface SyncStatus {
  /** `off`: nessun server configurato. */
  state: 'off' | 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  error: string | null
  pushed: number
  pulled: number
}

let status: SyncStatus = { state: 'off', lastSyncAt: null, error: null, pushed: 0, pulled: 0 }
const listeners = new Set<() => void>()
function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export function getSyncStatus(): SyncStatus {
  return status
}
export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus)
}

interface Cursor {
  since: string | null
  pushedAt: string | null
}
const CURSOR_KEY = 'sync'
async function loadCursor(): Promise<Cursor> {
  const row = await db.settings.get(CURSOR_KEY)
  const v = (row?.value ?? {}) as Partial<Cursor>
  return { since: v.since ?? null, pushedAt: v.pushedAt ?? null }
}
async function saveCursor(c: Cursor) {
  await db.settings.put({ key: CURSOR_KEY, value: c })
}
/** Dimentica i cursori: la prossima sincronizzazione rimanda e richiede tutto (dopo un cambio di password, per esempio). */
export async function resetSyncCursor() {
  await db.settings.delete(CURSOR_KEY)
}

interface SyncResponse {
  now: string
  more: boolean
  recipes: SyncRow<Recipe>[]
  sessions: SyncRow<CookSession>[]
  chats: SyncRow<Chat>[]
}

const sessionUpdatedAt = (s: CookSession) => s.finishedAt ?? s.startedAt

async function applyAll(incoming: SyncResponse, local: { recipes: Recipe[]; sessions: CookSession[]; chats: Chat[] }): Promise<number> {
  const recipes = applyIncoming(incoming.recipes, new Map(local.recipes.map((r) => [r.id, r.updatedAt])))
  const sessions = applyIncoming(incoming.sessions, new Map(local.sessions.map((s) => [s.id, sessionUpdatedAt(s)])))
  const chats = applyIncoming(incoming.chats, new Map(local.chats.map((c) => [c.id, c.updatedAt])))
  await db.transaction('rw', db.recipes, db.sessions, db.chats, async () => {
    if (recipes.puts.length) await db.recipes.bulkPut(recipes.puts)
    if (recipes.deletes.length) await db.recipes.bulkDelete(recipes.deletes)
    if (sessions.puts.length) await db.sessions.bulkPut(sessions.puts)
    if (sessions.deletes.length) await db.sessions.bulkDelete(sessions.deletes)
    if (chats.puts.length) await db.chats.bulkPut(chats.puts)
    if (chats.deletes.length) await db.chats.bulkDelete(chats.deletes)
  })
  return recipes.puts.length + recipes.deletes.length + sessions.puts.length + sessions.deletes.length + chats.puts.length + chats.deletes.length
}

async function describeFailure(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // corpo non JSON
  }
  return res.status === 401 ? 'Accesso non valido.' : `Il server ha risposto ${res.status}.`
}

let inFlight: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Sincronizza tra poco: si chiama dopo ogni salvataggio, così più modifiche ravvicinate fanno un solo scambio. */
export function scheduleSync(delayMs = 2500): void {
  if (typeof window === 'undefined') return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delayMs)
}

/** Sincronizza adesso. Una sola esecuzione alla volta; le chiamate concorrenti aspettano quella in corso. */
export function syncNow(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = run().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(): Promise<void> {
  const settings = await loadAiSettings()
  const proxy = settings.proxyUrl.trim().replace(/\/+$/, '')
  const key = settings.apiKey.trim()
  if (!proxy || !key) {
    set({ state: 'off' })
    return
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  set({ state: 'syncing', error: null })
  let pushed = 0
  let pulled = 0
  try {
    let cursor = await loadCursor()
    for (let round = 0; round < 20; round++) {
      const startedLocal = new Date().toISOString()
      const [recipes, sessions, chats, tombs] = await Promise.all([db.recipes.toArray(), db.sessions.toArray(), db.chats.toArray(), db.tombstones.toArray()])
      const byTable = (t: Tombstone['table']) => tombs.filter((x) => x.table === t)
      const body = {
        since: cursor.since,
        recipes: outgoingRows(recipes, (r) => r.updatedAt, byTable('recipes'), cursor.pushedAt),
        sessions: outgoingRows(sessions, sessionUpdatedAt, byTable('sessions'), cursor.pushedAt),
        chats: outgoingRows(chats, (c) => c.updatedAt, byTable('chats'), cursor.pushedAt),
      }
      const res = await fetch(`${proxy}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body),
      })
      if (res.status === 401 && key.startsWith('sess_')) {
        // Sessione revocata o scaduta: dimentica il token, l'app propone di rientrare.
        await saveAiSettings({ ...settings, apiKey: '' })
        throw new Error('Sessione scaduta: accedi di nuovo.')
      }
      if (!res.ok) throw new Error(await describeFailure(res))
      const result = (await res.json()) as SyncResponse
      pushed += body.recipes.length + body.sessions.length + body.chats.length
      pulled += await applyAll(result, { recipes, sessions, chats })
      cursor = { since: result.now, pushedAt: startedLocal }
      await saveCursor(cursor)
      const stale = staleTombstones(tombs, new Date())
      if (stale.length) await db.tombstones.bulkDelete(stale.map((t) => [t.table, t.id]))
      if (!result.more) break
    }
    set({ state: 'idle', lastSyncAt: new Date().toISOString(), pushed, pulled })
  } catch (e) {
    set({ state: 'error', error: e instanceof TypeError ? 'Server non raggiungibile: riprovo alla prossima apertura.' : (e as Error).message })
  }
}

/** Avvia la sincronizzazione all'apertura e quando l'app torna in primo piano o in rete. */
export function startSync(): () => void {
  void syncNow()
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync(500)
  }
  const onOnline = () => scheduleSync(500)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}
