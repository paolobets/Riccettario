import type { AiSettings } from './settings'

/** Consumo del mese di chi usa l'app, come lo riporta il proxy (rotta GET /me). */
export interface Account {
  user: string
  plan?: string
  month: string
  budgetUsd: number
  /** `null` se il server non ha il database: niente misura. */
  usage: { costUsd: number; requests: number; inputTokens: number; outputTokens: number } | null
  /** Righe conservate sul server per questo utente. */
  stored?: { recipes: number; sessions: number; chats: number } | null
  /** Vero se il server sincronizza l'archivio. */
  sync?: boolean
}

/** `null` se non c'è un proxy, se la password è sbagliata o se il proxy è vecchio e non ha la rotta. */
export async function fetchAccount(settings: AiSettings): Promise<Account | null> {
  const proxy = settings.proxyUrl.trim().replace(/\/+$/, '')
  if (!proxy || !settings.apiKey.trim()) return null
  try {
    const res = await fetch(`${proxy}/me`, { headers: { 'x-api-key': settings.apiKey.trim() } })
    if (!res.ok) return null
    return (await res.json()) as Account
  } catch {
    return null
  }
}
