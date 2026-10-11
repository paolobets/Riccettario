/**
 * Lista della spesa: somma gli ingredienti di più ricette, ognuna con il suo
 * fattore, riconoscendo lo stesso ingrediente dal nome e dall'unità base.
 */
import type { Quantity, Recipe } from './model'
import { formatQuantity } from './format'
import { scaleRecipe } from './scaling'
import { flattenIngredients, type RecipeLookup } from './compose'
import { toBase, toDisplayUnit } from './units'

export interface ShoppingEntry {
  recipe: Recipe
  factor: number
}

export interface ShoppingSource {
  recipeId: string
  title: string
  quantity?: Quantity
}

export interface ShoppingLine {
  /** Chiave stabile per le spunte: nome normalizzato e unità. */
  key: string
  name: string
  /** Somma in unità leggibile; assente per "quanto basta". */
  quantity?: Quantity
  toTaste: boolean
  /** Vero solo se è facoltativo in tutte le ricette che lo usano. */
  optional: boolean
  sources: ShoppingSource[]
}

/** "Farina 00 (setacciata)" → "farina 00": minuscolo, senza parentesi e spazi doppi. */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildShoppingList(entries: ShoppingEntry[], lookup?: RecipeLookup): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>()
  const pending: Array<{ name: string; norm: string; source: ShoppingSource; optional: boolean }> = []

  for (const { recipe, factor } of entries) {
    const ingredients = lookup ? flattenIngredients(recipe, factor, lookup) : scaleRecipe(recipe, factor).ingredients
    for (const ing of ingredients) {
      const norm = normalizeIngredientName(ing.name)
      if (!norm) continue
      const toTaste = ing.scaling?.mode === 'toTaste' || !ing.scaled || ing.scaled.unit === 'q.b.'
      if (toTaste) {
        pending.push({ name: ing.name, norm, source: { recipeId: recipe.id, title: recipe.title }, optional: Boolean(ing.optional) })
        continue
      }
      const base = toBase(ing.scaled!)
      const key = `${norm}|${base.unit}`
      const line = lines.get(key) ?? { key, name: ing.name, quantity: { amount: 0, unit: base.unit }, toTaste: false, optional: true, sources: [] }
      line.quantity = { amount: line.quantity!.amount + base.amount, unit: base.unit }
      line.optional = line.optional && Boolean(ing.optional)
      line.sources.push({ recipeId: recipe.id, title: recipe.title, quantity: ing.scaled })
      lines.set(key, line)
    }
  }
  // "Quanto basta" si aggancia a una riga già quantificata con lo stesso nome, altrimenti fa riga a sé.
  for (const p of pending) {
    const existing = [...lines.values()].find((l) => l.key.startsWith(`${p.norm}|`))
    if (existing) {
      existing.sources.push(p.source)
      existing.optional = existing.optional && p.optional
      continue
    }
    const key = `${p.norm}|qb`
    const line = lines.get(key) ?? { key, name: p.name, toTaste: true, optional: true, sources: [] }
    line.sources.push(p.source)
    line.optional = line.optional && p.optional
    lines.set(key, line)
  }
  return [...lines.values()]
    .map((l) => ({ ...l, quantity: l.quantity ? toDisplayUnit({ amount: Math.round(l.quantity.amount * 100) / 100, unit: l.quantity.unit }) : undefined }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

/** Testo da incollare in un messaggio: una riga per ingrediente, senza quelli già presi. */
export function shoppingListText(lines: ShoppingLine[], checked: Set<string> = new Set(), title = 'Lista della spesa'): string {
  const rows = lines
    .filter((l) => !checked.has(l.key))
    .map((l) => {
      const qty = l.quantity ? `${formatQuantity(l.quantity)} ` : ''
      const from = l.sources.length > 1 ? ` (${[...new Set(l.sources.map((s) => s.title))].join(', ')})` : ''
      return `- ${qty}${l.name}${l.toTaste ? ', q.b.' : ''}${l.optional ? ', facoltativo' : ''}${from}`
    })
  return [title, ...rows].join('\n')
}
