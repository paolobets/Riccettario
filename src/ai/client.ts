import Anthropic from '@anthropic-ai/sdk'
import { HOSTED, loadAiSettings, isAiConfigured, type AiSettings } from './settings'

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
export function makeClient(s: AiSettings, feature?: string): Anthropic {
  if (!isAiConfigured(s)) throw new AiNotConfiguredError()
  const proxy = s.proxyUrl.trim()
  return new Anthropic({
    apiKey: s.apiKey.trim() || 'proxy',
    baseURL: proxy ? proxy.replace(/\/+$/, '') : undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    // Il proxy registra i consumi per funzione: utile per capire cosa costa davvero.
    defaultHeaders: feature ? { 'x-ricettario-feature': feature } : undefined,
  })
}

export async function getClient(feature?: string): Promise<{ client: Anthropic; settings: AiSettings }> {
  const settings = await loadAiSettings()
  return { client: makeClient(settings, feature), settings }
}

/** Messaggio leggibile per l'utente a partire da un errore del SDK. */
/** Messaggio del proxy (budget esaurito, password sbagliata), se la risposta d'errore lo porta. */
function proxyMessage(e: unknown): string | null {
  const body = (e as { error?: { error?: { type?: string; message?: string } } }).error
  const inner = body?.error
  if (inner?.type === 'budget_exceeded' && inner.message) return inner.message
  if (inner?.type === 'authentication_error' && inner.message?.includes('Password')) return inner.message
  return null
}

export function describeAiError(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return e.message
  const fromProxy = e instanceof Anthropic.APIError ? proxyMessage(e) : null
  if (fromProxy) return fromProxy
  if (e instanceof Anthropic.AuthenticationError) return HOSTED ? 'Password non valida: controlla quella inserita in Impostazioni.' : 'Chiave API non valida.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'Accesso negato: controlla chiave e proxy.'
  if (e instanceof Anthropic.RateLimitError) return 'Troppe richieste: riprova tra qualche secondo.'
  if (e instanceof Anthropic.BadRequestError) return `Richiesta non valida: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return 'Impossibile raggiungere il servizio AI: controlla la connessione o il proxy.'
  if (e instanceof Anthropic.APIError) return `Errore del servizio AI (${e.status ?? '?'}): ${e.message}`
  if (e instanceof Error) return e.message
  return 'Errore sconosciuto.'
}
