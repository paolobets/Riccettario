import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Recipe } from '@/core'
import type { CookSession } from '@/data/db'
import { getClient } from './client'
import { aiRecipeSchema, aiToRecipe, recipeForPrompt, type ConversionResult } from './schema'
import { SYSTEM_ASSIST, SYSTEM_VARIANT } from './prompts'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
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
  params: { recipe: Recipe; factor: number; sessions: CookSession[]; history: ChatTurn[]; question: string },
  onDelta: (text: string) => void,
): Promise<string> {
  const { client, settings } = await getClient()
  const context = `Ricetta (JSON):\n${recipeForPrompt(params.recipe)}\n\nFattore di scalatura attuale: ×${params.factor}${sessionsForPrompt(params.sessions)}`
  const messages: Anthropic.MessageParam[] = [
    ...params.history.map<Anthropic.MessageParam>((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: params.history.length === 0 ? `${context}\n\nDomanda: ${params.question}` : params.question },
  ]
  const stream = client.messages.stream({
    model: settings.model,
    max_tokens: 4000,
    system: SYSTEM_ASSIST + (params.history.length > 0 ? `\n\n${context}` : ''),
    messages,
  })
  stream.on('text', onDelta)
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  return final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** Produce una variante completa della ricetta seguendo un'istruzione. */
export async function proposeVariant(params: { recipe: Recipe; sessions: CookSession[]; instruction: string }): Promise<ConversionResult> {
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
    output_config: { format: zodOutputFormat(aiRecipeSchema) },
  })
  if (response.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  if (!response.parsed_output) throw new Error('Risposta dell\'AI non interpretabile. Riprova.')
  return aiToRecipe(response.parsed_output)
}
