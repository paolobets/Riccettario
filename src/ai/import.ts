import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getClient } from './client'
import { aiRecipeSchema, aiToRecipe, type ConversionResult } from './schema'
import { SYSTEM_DISH, SYSTEM_IMPORT } from './prompts'
import { recordUsage } from './usage'
import { fetchPageHtml } from './page'
import { recipeTextFromHtml } from './jsonld'

export interface ImportInput {
  text?: string
  url?: string
  images?: File[]
  /** Nome di un piatto: l'AI scrive la ricetta da zero invece di trascriverla. */
  dish?: string
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const MAX_IMAGE_SIDE = 1568

/** Ridimensiona e converte in JPEG base64: foto da telefono sono enormi e inutili a piena risoluzione. */
export async function fileToImageBlock(file: File): Promise<Anthropic.ImageBlockParam> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' } }
}

/**
 * Estrae una ricetta strutturata da testo, foto o URL.
 * L'URL viene letto dal servizio AI tramite il tool web_fetch (il browser non
 * potrebbe scaricarlo per via del CORS).
 */
export async function importRecipe(input: ImportInput, onStatus?: (s: string) => void): Promise<ConversionResult & { costUsd: number; source?: string }> {
  const { client, settings } = await getClient(input.dish?.trim() ? 'piatto' : input.url?.trim() ? 'sito' : input.images?.length ? 'foto' : 'testo')
  const content: Anthropic.ContentBlockParam[] = []
  if (input.images?.length) {
    onStatus?.('Preparo le immagini…')
    for (const f of input.images) content.push(await fileToImageBlock(f))
  }
  const parts: string[] = []
  const sourceText: string[] = []
  // Da un sito: prima i dati strutturati della pagina (JSON-LD), che costano 1-2k token;
  // solo se mancano l'AI legge la pagina intera con web_fetch (10-30k token).
  let needsWebFetch = false
  const url = input.url?.trim()
  if (url) {
    onStatus?.('Leggo la pagina…')
    const html = await fetchPageHtml(url, settings)
    const found = html ? recipeTextFromHtml(html, url) : null
    if (found) {
      onStatus?.(`Trovata «${found.title}», la strutturo…`)
      parts.push(`Testo della ricetta (dai dati strutturati della pagina ${url}):\n\n${found.text}`)
      sourceText.push(found.text)
    } else {
      needsWebFetch = true
      onStatus?.('La pagina non espone i dati della ricetta: la faccio leggere all\'AI…')
      parts.push(`Ricetta da questa pagina: ${url}\nLeggi la pagina e trascrivi la ricetta.`)
    }
  }
  if (input.text?.trim()) {
    parts.push(`Testo della ricetta:\n\n${input.text.trim()}`)
    sourceText.push(input.text.trim())
  }
  if (input.images?.length) parts.push('Trascrivi la ricetta fotografata nelle immagini.')
  if (input.dish?.trim()) parts.push(`Scrivi la ricetta di: ${input.dish.trim()}`)
  if (parts.length === 0) throw new Error('Inserisci un testo, una foto, un indirizzo o il nome di un piatto.')
  content.push({ type: 'text', text: parts.join('\n\n') })

  onStatus?.(input.dish ? 'Chiedo all\'AI di scrivere la ricetta…' : 'Chiedo all\'AI di strutturare la ricetta…')
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 16000,
    system: input.dish?.trim() ? SYSTEM_DISH : SYSTEM_IMPORT,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(aiRecipeSchema), effort: 'medium' },
    ...(needsWebFetch ? { tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2, max_content_tokens: 15000 }] } : {}),
  })
  if (response.stop_reason === 'refusal') throw new Error('Il servizio AI ha rifiutato la richiesta.')
  if (response.stop_reason === 'max_tokens') throw new Error('Risposta troppo lunga: prova con una ricetta più breve.')
  if (!response.parsed_output) throw new Error('Risposta dell\'AI non interpretabile. Riprova.')
  const costUsd = await recordUsage(settings.model, response.usage)
  // Il testo di partenza serve alla chat di revisione per confrontare la bozza con la fonte.
  const source = sourceText.length ? sourceText.join('\n\n') : undefined
  return { ...aiToRecipe(response.parsed_output), costUsd, source }
}
