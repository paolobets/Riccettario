import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@/data/db'

/**
 * Prezzi in USD per milione di token (listino Anthropic, ottobre 2026).
 * `cacheRead` è la lettura dalla cache del prompt (un ventesimo dell'ingresso su Opus 5.5,
 * un decimo sugli altri); la scrittura in cache costa 1,25× l'ingresso con durata 5 minuti, 2× con 1 ora.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

export interface UsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

const KEY = 'aiUsage'

export function costOf(model: string, usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens'>): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!
  const u = usage as Partial<Anthropic.Usage>
  // `input_tokens` esclude già i token letti o scritti in cache: si sommano a parte.
  const read = u.cache_read_input_tokens ?? 0
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const write5m = (u.cache_creation_input_tokens ?? 0) - write1h
  return (
    (usage.input_tokens * p.input + read * p.cacheRead + write5m * p.input * 1.25 + write1h * p.input * 2 + usage.output_tokens * p.output) /
    1_000_000
  )
}

export function formatUsd(v: number): string {
  if (v < 0.01) return `< $0,01`
  return `$${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function loadUsage(): Promise<UsageTotals> {
  const row = await db.settings.get(KEY)
  const v = (row?.value ?? {}) as Partial<UsageTotals>
  return { requests: v.requests ?? 0, inputTokens: v.inputTokens ?? 0, outputTokens: v.outputTokens ?? 0, costUsd: v.costUsd ?? 0 }
}

/** Registra l'uso reale riportato dall'API e restituisce il costo della singola richiesta. */
export async function recordUsage(model: string, usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens'>): Promise<number> {
  const cost = costOf(model, usage)
  const t = await loadUsage()
  await db.settings.put({
    key: KEY,
    value: {
      requests: t.requests + 1,
      inputTokens: t.inputTokens + usage.input_tokens,
      outputTokens: t.outputTokens + usage.output_tokens,
      costUsd: t.costUsd + cost,
    } satisfies UsageTotals,
  })
  return cost
}

export async function resetUsage(): Promise<void> {
  await db.settings.delete(KEY)
}
