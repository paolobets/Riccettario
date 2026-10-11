/**
 * Stato di una cottura in corso, in localStorage: sopravvive a ricaricamenti e
 * alla chiusura dell'app, così dalla ricetta si può "riprendere dal passo 4".
 * Scade dopo un giorno: una cottura abbandonata non resta appesa per sempre.
 */
export interface CookState {
  startedAt: string
  /** Indice del passo corrente (0 = primo); assente nella mise en place. */
  step?: number
  /** Orario "pronto per le", come "20:00". */
  readyAt?: string
}

const MAX_AGE_MS = 24 * 3_600_000

export function cookStateKey(recipeId: string): string {
  return `cook:${recipeId}`
}

export function loadCookState(recipeId: string): CookState | null {
  try {
    const raw = localStorage.getItem(cookStateKey(recipeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CookState>
    if (typeof parsed.startedAt !== 'string') return null
    if (Date.now() - new Date(parsed.startedAt).getTime() > MAX_AGE_MS) {
      clearCookState(recipeId)
      return null
    }
    return { startedAt: parsed.startedAt, step: typeof parsed.step === 'number' ? parsed.step : undefined, readyAt: typeof parsed.readyAt === 'string' ? parsed.readyAt : undefined }
  } catch {
    return null
  }
}

export function saveCookState(recipeId: string, state: CookState): void {
  try {
    localStorage.setItem(cookStateKey(recipeId), JSON.stringify(state))
  } catch {
    // storage non disponibile
  }
}

export function clearCookState(recipeId: string): void {
  try {
    localStorage.removeItem(cookStateKey(recipeId))
    localStorage.removeItem(`${cookStateKey(recipeId)}:spunte`)
  } catch {
    // storage non disponibile
  }
}
