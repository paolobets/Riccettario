import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Recipe } from '@/core'
import type { CookSession } from '@/data/db'
import { getClient } from './client'
import { aiRecipeSchema, aiToRecipe, recipeForPrompt, type ConversionResult } from './schema'
import { SYSTEM_ASSIST, SYSTEM_VARIANT } from './prompts'
import { KITCHEN_MODEL } from './settings'
import { recordUsage } from './usage'

/** Turni di conversazione rimandati a ogni domanda: oltre, i più vecchi restano solo nello storico locale. */
const MAX_HISTORY_TURNS = 12

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  costUsd?: number
}

function sessionsForPrompt(sessions: CookSession[]): string {
  const done = sessions.filter((s) => s.rating || s.notes)
  if (done.length === 0) return ''
  return (
    '\n\nDiario delle cotture precedenti:\n' +
    done
      .map((s) => `- ${s.startedAt.slice(0, 10)}, fattore ×${s.factor}${s.rating ? `, voto ${s.rating}/5` : ''}${s.notes ? `: ${s.notes}` : ''}`)
      .join('\n')
  )
}

/**
 * Domanda sulla ricetta, con risposta in streaming. `history` sono i turni
 * precedenti della stessa conversazione; `factor` il fattore di scalatura attuale.
 */
export async function askAboutRecipe(
  params: { recipe: Recipe; factor: number; sessions: CookSession[]; history: ChatTurn[]; question: string; stepContext?: string },
  onDelta: (text: string) => void,
): Promise<{ text: string; costUsd: number }> {
  const { client, settings } = await getClient()
  const inKitchen = Boolean(params.stepContext)
  const model = inKitchen && settings.fastKitchenAnswers ? KITCHEN_MODEL : settings.model
  // Il contesto stabile (ricetta e diario) sta in un blocco di sistema con cache: dalla seconda
  // domanda si paga un decimo. Ciò che cambia (fattore, passaggio, domanda) va nel messaggio.
  const stable = `Ricetta (JSON):\n${recipeForPrompt(params.recipe)}${sessionsForPrompt(params.sessions)}`
  const volatile = [
    `Fattore di scalatura attuale: ×${params.factor}.`,
    params.stepContext ? `L'utente sta cucinando adesso ed è a questo passaggio: ${params.stepContext}` : '',
    `Domanda: ${params.question}`,
  ]
    .filter(Boolean)
    .join('\n')
  const history = params.history.slice(-MAX_HISTORY_TURNS)
  const messages: Anthropic.MessageParam[] = [
    ...history.map<Anthropic.MessageParam>((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: volatile },
  ]
  const stream = client.messages.stream({
    model,
    max_tokens: 2000,
    system: [
      { type: 'text', text: SYSTEM_ASSIST },
      // In cucina le domande distano anche 20 minuti: la cache da un'ora evita di ripagare il contesto.
      { type: 'text', text: stable, cache_control: { type: 'ephemeral', ttl: inKitchen ? '1h' : '5m' } },
    ],
    messages,
    output_config: { effort: 'low' },
  })
  stream.on('text', onDelta)
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  const costUsd = await recordUsage(model, final.usage)
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { text, costUsd }
}

/** Produce una variante completa della ricetta seguendo un'istruzione. */
export async function proposeVariant(params: { recipe: Recipe; sessions: CookSession[]; instruction: string }): Promise<ConversionResult & { costUsd: number }> {
  const { client, settings } = await getClient()
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 16000,
    system: SYSTEM_VARIANT,
    messages: [
      {
        role: 'user',
        content: `Ricetta attuale (JSON):\n${recipeForPrompt(params.recipe)}${sessionsForPrompt(params.sessions)}\n\nIstruzione: ${params.instruction}`,
      },
    ],
    output_config: { format: zodOutputFormat(aiRecipeSchema), effort: 'medium' },
  })
  if (response.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  if (!response.parsed_output) throw new Error('Risposta dell\'AI non interpretabile. Riprova.')
  const costUsd = await recordUsage(settings.model, response.usage)
  return { ...aiToRecipe(response.parsed_output), costUsd }
}
