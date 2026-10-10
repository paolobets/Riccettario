import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@/data/db'

/** Prezzi in USD per milione di token (listino Anthropic, ottobre 2026). */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
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
  const cached = (usage as Partial<Anthropic.Usage>).cache_read_input_tokens ?? 0
  return ((usage.input_tokens - cached) * p.input + cached * p.input * 0.1 + usage.output_tokens * p.output) / 1_000_000
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
