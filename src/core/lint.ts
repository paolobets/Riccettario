/**
 * Controllo della ricetta: segnalazioni che aiutano a scriverla meglio prima di
 * salvarla. Nessuna blocca il salvataggio.
 */
import type { Recipe } from './model'
import { formatDuration } from './format'
import { ingredientIdsInStep } from './steps'
import { isCountUnit } from './units'

const LONG_STEP_MINUTES = 10
const LONG_REST_MINUTES = 20

export function checkRecipe(recipe: Recipe): string[] {
  const out: string[] = []
  if (!recipe.title.trim()) out.push('Manca il titolo.')
  if (!(recipe.servings > 0)) out.push('Le porzioni devono essere almeno 1.')
  if (recipe.ingredients.length === 0) out.push('Nessun ingrediente.')
  if (recipe.steps.length === 0) out.push('Nessun passaggio.')

  const ids = new Set(recipe.ingredients.map((i) => i.id))
  for (const i of recipe.ingredients) {
    const rule = i.scaling
    if (rule?.mode === 'bakersPercent' && (!rule.of || rule.of === i.id || !ids.has(rule.of))) out.push(`«${i.name}»: percentuale del panettiere senza ingrediente base.`)
    if (/\buov[oa]\b/i.test(i.name) && i.quantity && isCountUnit(i.quantity.unit) && rule?.mode !== 'discrete' && rule?.mode !== 'fixed')
      out.push(`«${i.name}» scala a pezzi interi: con la regola lineare potresti ritrovarti 2,6 uova. Imposta "a pezzi interi".`)
  }

  const cited = new Set(recipe.steps.flatMap((s) => ingredientIdsInStep(s)))
  const unused = recipe.ingredients.filter((i) => i.name.trim() && !cited.has(i.id))
  if (unused.length > 0 && recipe.steps.length > 0) out.push(`Ingredienti mai citati nei passaggi: ${unused.map((i) => i.name).join(', ')}.`)

  const stepIds = new Set(recipe.steps.map((s) => s.id))
  recipe.steps.forEach((s, idx) => {
    const n = idx + 1
    if (!s.text.trim()) out.push(`Il passo ${n} è vuoto.`)
    if (s.parallelWith && (!stepIds.has(s.parallelWith) || s.parallelWith === s.id)) out.push(`Il passo ${n} è segnato come parallelo a un passaggio che non esiste.`)
    const minutes = s.durationMin ?? 0
    const timed = s.type === 'cook' || s.type === 'rest' || s.type === 'wait'
    if (timed && minutes >= LONG_STEP_MINUTES && !s.timer) out.push(`Il passo ${n} dura ${formatDuration(minutes)} ma non ha un timer: in cucina non ti avvisa.`)
    const isRest = s.type === 'rest' || s.type === 'wait'
    const restMinutes = Math.max(minutes, s.timer?.minutes ?? 0)
    if (isRest && restMinutes >= LONG_REST_MINUTES && !recipe.steps.some((o) => o.parallelWith === s.id))
      out.push(`Durante il riposo del passo ${n} (${formatDuration(restMinutes)}) non c'è nulla da fare in parallelo: se un passaggio si può anticipare, segnalo "durante il passo ${n}".`)
  })
  return out
}
