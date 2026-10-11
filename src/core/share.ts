/**
 * Ricetta come testo (per messaggi e stampa) e dentro un link, così si può
 * passare a chi non ha ancora l'app: il link apre /condivisa e propone di salvarla.
 */
import type { Recipe } from './model'
import { formatFactor, formatIngredientLine } from './format'
import type { ScaledRecipe } from './scaling'
import { renderStepPlain } from './steps'

export function recipeToText(scaled: ScaledRecipe): string {
  const r = scaled.recipe
  const out: string[] = [r.title.toUpperCase()]
  if (r.description) out.push(r.description)
  const servings = Math.round(scaled.servings * 100) / 100
  out.push(`Per ${servings} ${servings === 1 ? 'porzione' : 'porzioni'}${Math.abs(scaled.factor - 1) > 1e-9 ? ` (${formatFactor(scaled.factor)})` : ''}`)
  out.push('', 'INGREDIENTI')
  let section: string | undefined
  for (const i of scaled.ingredients) {
    if (i.section && i.section !== section) {
      section = i.section
      out.push(`${section}:`)
    }
    out.push(`- ${formatIngredientLine(i.name, i.scaled, Boolean(i.recipeId))}${i.recipeId ? ' (ricetta a parte)' : ''}${i.note ? `, ${i.note}` : ''}${i.optional ? ' (facoltativo)' : ''}`)
  }
  out.push('', 'PREPARAZIONE')
  r.steps.forEach((s, idx) => {
    const extra = [s.temperatureC ? `${s.temperatureC} °C` : '', s.timer ? `timer ${s.timer.minutes} min` : ''].filter(Boolean).join(', ')
    out.push(`${idx + 1}. ${renderStepPlain(s, scaled)}${extra ? ` (${extra})` : ''}`)
  })
  if (r.notes) out.push('', 'NOTE', r.notes)
  if (r.source) out.push('', `Fonte: ${r.source}`)
  return out.join('\n')
}

function toB64url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Solo i campi che descrivono la ricetta: niente id, date, preferiti. */
export function encodeRecipeForLink(recipe: Recipe): string {
  const { id: _id, createdAt: _c, updatedAt: _u, favorite: _f, ...rest } = recipe
  return toB64url(JSON.stringify(rest))
}

/** Ricetta dal frammento di un link condiviso; `null` se non è una ricetta. */
export function decodeRecipeFromLink(encoded: string): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> | null {
  try {
    const data = JSON.parse(fromB64url(encoded)) as Partial<Recipe>
    if (!data || typeof data.title !== 'string' || !Array.isArray(data.ingredients) || !Array.isArray(data.steps)) return null
    return {
      ...data,
      title: data.title,
      servings: typeof data.servings === 'number' && data.servings > 0 ? data.servings : 1,
      tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
      ingredients: data.ingredients.filter((i) => i && typeof i.id === 'string' && typeof i.name === 'string'),
      steps: data.steps.filter((s) => s && typeof s.id === 'string' && typeof s.text === 'string'),
    }
  } catch {
    return null
  }
}
