import { db } from '@/data/db'

/**
 * Configurazione dell'AI. Due modi di collegarsi:
 * - chiave API inserita dall'utente, salvata solo su questo dispositivo (IndexedDB)
 *   e usata direttamente dal browser;
 * - URL di un proxy (vedi proxy/cloudflare-worker.js) che custodisce la chiave:
 *   in quel caso la chiave locale può restare vuota.
 */
export interface AiSettings {
  apiKey: string
  proxyUrl: string
  model: string
  /** Domande in modalità cucina con Haiku 5.5: risposte brevi, costo quaranta volte più basso di Opus. */
  fastKitchenAnswers: boolean
}

/** Modello usato per le domande in cucina quando `fastKitchenAnswers` è attivo. */
export const KITCHEN_MODEL = 'claude-haiku-5-5'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const MODELS: Array<{ id: string; label: string }> = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (consigliato)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (più economico)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (il più economico)' },
]

const KEY = 'ai'

export async function loadAiSettings(): Promise<AiSettings> {
  const row = await db.settings.get(KEY)
  const v = (row?.value ?? {}) as Partial<AiSettings>
  return { apiKey: v.apiKey ?? '', proxyUrl: v.proxyUrl ?? '', model: v.model ?? DEFAULT_MODEL, fastKitchenAnswers: v.fastKitchenAnswers ?? true }
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  await db.settings.put({ key: KEY, value: s })
}

export function isAiConfigured(s: AiSettings): boolean {
  return Boolean(s.apiKey.trim() || s.proxyUrl.trim())
}
