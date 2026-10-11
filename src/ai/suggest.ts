import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { activeDuration, type Recipe } from '@/core'
import { getClient } from './client'
import { SYSTEM_SUGGEST } from './prompts'
import { recordUsage } from './usage'

export const aiSuggestionSchema = z.object({
  kind: z.enum(['existing', 'new']).describe('existing: una ricetta del ricettario; new: un piatto nuovo da scrivere'),
  recipeId: z.string().nullable().describe('Solo se kind=existing: id della ricetta scelta, copiato dall\'elenco'),
  dish: z.string().nullable().describe('Solo se kind=new: nome preciso del piatto, es. "frittata di zucchine e menta"'),
  reason: z.string().describe('Due o tre frasi: perché questa scelta e cosa adattare'),
})
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>

export interface SuggestParams {
  recipes: Recipe[]
  /** Giorni dall'ultima cottura per ricetta; assente = mai cucinata. */
  lastCookedDays: Map<string, number>
  meal: 'pranzo' | 'cena'
  maxActiveMinutes?: number
  pantry: string
}

function recipesForPrompt(p: SuggestParams): string {
  return p.recipes
    .map((r) => {
      const days = p.lastCookedDays.get(r.id)
      return `- id "${r.id}": ${r.title}. ${activeDuration(r.steps) || '?'} min ai fornelli${r.tags.length ? `, tag: ${r.tags.join(', ')}` : ''}. Ingredienti: ${r.ingredients.map((i) => i.name).join(', ')}. ${days === undefined ? 'Mai cucinata' : `Cucinata ${days} giorni fa`}.`
    })
    .join('\n')
}

/** Chiede all'AI cosa cucinare, scegliendo tra le ricette del ricettario o proponendo un piatto nuovo. */
export async function suggestDish(p: SuggestParams): Promise<AiSuggestion & { costUsd: number }> {
  const { client, settings } = await getClient()
  const content = `Pasto: ${p.meal}.\nTempo ai fornelli disponibile: ${p.maxActiveMinutes ? `${p.maxActiveMinutes} minuti` : 'nessun limite'}.\nIn casa ho: ${p.pantry.trim() || 'non specificato'}.\n\nRicette del ricettario:\n${recipesForPrompt(p) || '(nessuna)'}`
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 1500,
    system: SYSTEM_SUGGEST,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(aiSuggestionSchema), effort: 'low' },
  })
  if (response.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  if (!response.parsed_output) throw new Error('Risposta dell\'AI non interpretabile. Riprova.')
  const costUsd = await recordUsage(settings.model, response.usage)
  const out = response.parsed_output
  // Difesa: se l'id non esiste, trattiamo la proposta come piatto nuovo.
  if (out.kind === 'existing' && !p.recipes.some((r) => r.id === out.recipeId)) {
    return { kind: 'new', recipeId: null, dish: out.dish ?? out.reason.split('.')[0] ?? 'piatto', reason: out.reason, costUsd }
  }
  return { ...out, costUsd }
}
