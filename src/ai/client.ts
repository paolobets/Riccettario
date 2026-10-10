import Anthropic from '@anthropic-ai/sdk'
import { loadAiSettings, isAiConfigured, type AiSettings } from './settings'

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI non configurata: inserisci una chiave API o l\'URL del proxy nelle impostazioni.')
    this.name = 'AiNotConfiguredError'
  }
}

/**
 * Client per il browser. `dangerouslyAllowBrowser` è necessario perché la chiave
 * viene usata lato client: è accettabile per un'app personale dove la chiave è
 * dell'utente stesso. Con un proxy la chiave non lascia mai il server.
 */
export function makeClient(s: AiSettings): Anthropic {
  if (!isAiConfigured(s)) throw new AiNotConfiguredError()
  const proxy = s.proxyUrl.trim()
  return new Anthropic({
    apiKey: s.apiKey.trim() || 'proxy',
    baseURL: proxy ? proxy.replace(/\/+$/, '') : undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  })
}

export async function getClient(): Promise<{ client: Anthropic; settings: AiSettings }> {
  const settings = await loadAiSettings()
  return { client: makeClient(settings), settings }
}

/** Messaggio leggibile per l'utente a partire da un errore del SDK. */
export function describeAiError(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return e.message
  if (e instanceof Anthropic.AuthenticationError) return 'Chiave API non valida.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'Accesso negato: controlla chiave e proxy.'
  if (e instanceof Anthropic.RateLimitError) return 'Troppe richieste: riprova tra qualche secondo.'
  if (e instanceof Anthropic.BadRequestError) return `Richiesta non valida: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return 'Impossibile raggiungere il servizio AI: controlla la connessione o il proxy.'
  if (e instanceof Anthropic.APIError) return `Errore del servizio AI (${e.status ?? '?'}): ${e.message}`
  if (e instanceof Error) return e.message
  return 'Errore sconosciuto.'
}
