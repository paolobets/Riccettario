import { DOSING_MODE_LABELS, SCALING_MODE_LABELS, type Ingredient, type Recipe } from './model'
import { formatQuantity } from './format'
import { DOUGH_TYPES, dosingOf, formatPan } from './pan'

function qty(i: Ingredient): string {
  return i.quantity ? formatQuantity(i.quantity) : 'senza quantità'
}

function scalingLabel(i: Ingredient): string {
  const mode = i.scaling?.mode ?? 'linear'
  const label = SCALING_MODE_LABELS[mode].replace(/ \(.*\)$/, '').toLowerCase()
  return mode === 'bakersPercent' && i.scaling?.mode === 'bakersPercent' ? `${i.scaling.percent}% del panettiere` : label
}

function dosingLabel(r: Recipe): string {
  const d = dosingOf(r)
  const extra = d.mode === 'pans' && d.dough ? `, ${DOUGH_TYPES[d.dough].label}` : d.mode === 'pieces' && d.pieceGrams ? `, ${d.pieceGrams} g l'uno` : ''
  return `${DOSING_MODE_LABELS[d.mode].toLowerCase()}${extra}`
}

/**
 * Elenco leggibile delle differenze tra due versioni di una ricetta, per mostrare
 * cosa ha cambiato l'AI. Gli ingredienti si accoppiano per id, poi per nome.
 */
export function recipeChanges(before: Recipe, after: Recipe): string[] {
  const out: string[] = []
  if (before.title.trim() !== after.title.trim()) out.push(`Titolo: ${after.title}`)
  if (before.servings !== after.servings) out.push(`Porzioni: ${before.servings} → ${after.servings}`)
  const dBefore = dosingLabel(before)
  const dAfter = dosingLabel(after)
  if (dBefore !== dAfter) out.push(`Dosi per: ${dBefore} → ${dAfter}`)
  const pBefore = before.pan ? formatPan(before.pan) : 'nessuna'
  const pAfter = after.pan ? formatPan(after.pan) : 'nessuna'
  if (pBefore !== pAfter) out.push(`Teglia: ${pBefore} → ${pAfter}`)

  const remaining = [...before.ingredients]
  const take = (i: Ingredient): Ingredient | undefined => {
    let k = remaining.findIndex((b) => b.id === i.id)
    if (k < 0) k = remaining.findIndex((b) => b.name.trim().toLowerCase() === i.name.trim().toLowerCase())
    return k >= 0 ? remaining.splice(k, 1)[0] : undefined
  }
  for (const i of after.ingredients) {
    const old = take(i)
    if (!old) {
      out.push(`Aggiunto: ${i.name}, ${qty(i)}`)
      continue
    }
    const what: string[] = []
    if (old.name.trim() !== i.name.trim()) what.push(`ora «${i.name}»`)
    if (qty(old) !== qty(i)) what.push(`${qty(old)} → ${qty(i)}`)
    if (scalingLabel(old) !== scalingLabel(i)) what.push(`scalatura ${scalingLabel(i)}`)
    if ((old.section ?? '') !== (i.section ?? '')) what.push(i.section ? `nella sezione ${i.section}` : 'senza sezione')
    if ((old.note ?? '') !== (i.note ?? '')) what.push(i.note ? `nota «${i.note}»` : 'senza nota')
    if (what.length) out.push(`${old.name}: ${what.join(', ')}`)
  }
  for (const i of remaining) out.push(`Tolto: ${i.name}`)

  if (before.steps.length !== after.steps.length) out.push(`Passaggi: ${before.steps.length} → ${after.steps.length}`)
  else {
    const rewritten = after.steps.filter((s, k) => {
      const o = before.steps[k]!
      return o.text !== s.text || o.durationMin !== s.durationMin || o.temperatureC !== s.temperatureC || o.timer?.minutes !== s.timer?.minutes
    }).length
    if (rewritten === 1) out.push('Un passaggio modificato')
    else if (rewritten > 1) out.push(`${rewritten} passaggi modificati`)
  }
  if ((before.description ?? '') !== (after.description ?? '')) out.push('Descrizione aggiornata')
  if ((before.notes ?? '') !== (after.notes ?? '')) out.push('Note aggiornate')
  if (before.tags.join(',') !== after.tags.join(',')) out.push(`Tag: ${after.tags.join(', ') || 'nessuno'}`)
  return out
}
