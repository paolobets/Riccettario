import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Recipe } from '@/core'
import { getClient } from './client'
import { aiRecipeSchema, aiToRecipe, recipeForPrompt, type ConversionResult } from './schema'
import { SYSTEM_REVIEW } from './prompts'
import type { ChatTurn } from './assist'
import { recordUsage } from './usage'

// La ricetta aggiornata sta in un elenco (vuoto o con un elemento) invece che in un
// campo nullable: lo schema ha già quasi tutti i 16 tipi unione ammessi dall'API.
export const aiReviewSchema = z.object({
  reply: z.string().describe('Risposta all\'utente in italiano, una o due frasi: cosa hai cambiato o la risposta alla domanda'),
  updated: z
    .array(aiRecipeSchema)
    .describe('La ricetta completa aggiornata, come unico elemento, se hai cambiato qualcosa; elenco vuoto se hai solo risposto senza modificare'),
})

/** Turni rimandati a ogni messaggio: la bozza attuale è comunque sempre completa nel prompt. */
const MAX_HISTORY_TURNS = 8

/**
 * Revisione di una ricetta importata, prima del salvataggio: l'utente scrive cosa non va,
 * l'AI risponde e, se serve, restituisce la ricetta corretta. `source` è il testo
 * originale quando c'è, per confrontare la bozza con la fonte.
 */
export async function reviewImport(params: {
  recipe: Recipe
  source?: string
  history: ChatTurn[]
  message: string
}): Promise<{ reply: string; result: ConversionResult | null; costUsd: number }> {
  const { client, settings } = await getClient('revisione')
  const stable = `Bozza attuale della ricetta (JSON, comprende le correzioni fatte a mano):\n${recipeForPrompt(params.recipe)}${
    params.source ? `\n\nFonte originale:\n${params.source}` : '\n\nLa fonte originale non è disponibile (foto o pagina web letta in precedenza).'
  }`
  const messages: Anthropic.MessageParam[] = [
    ...params.history.slice(-MAX_HISTORY_TURNS).map<Anthropic.MessageParam>((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: params.message },
  ]
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM_REVIEW },
      { type: 'text', text: stable },
    ],
    messages,
    output_config: { format: zodOutputFormat(aiReviewSchema), effort: 'medium' },
  })
  if (response.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  if (response.stop_reason === 'max_tokens') throw new Error('Risposta troppo lunga: prova a chiedere una modifica alla volta.')
  if (!response.parsed_output) throw new Error('Risposta dell\'AI non interpretabile. Riprova.')
  const costUsd = await recordUsage(settings.model, response.usage)
  const updated = response.parsed_output.updated[0]
  const result = updated ? aiToRecipe(updated, { id: params.recipe.id, createdAt: params.recipe.createdAt, updatedAt: params.recipe.updatedAt }) : null
  return { reply: response.parsed_output.reply.trim(), result, costUsd }
}
