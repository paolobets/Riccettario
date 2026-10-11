/**
 * Etichetta degli ingredienti: elenco in ordine decrescente di peso (come
 * chiede il regolamento UE 1169/2011), basi tra parentesi con i loro
 * componenti, allergeni riconosciuti dai nomi ed evidenziati. È un aiuto a
 * scrivere l'etichetta, non un parere legale: gli allergeni vanno confermati.
 */
import type { Recipe } from './model'
import { flattenIngredients, isDoseUnit, baseFactor, MAX_BASE_DEPTH, type RecipeLookup } from './compose'
import { scaleRecipe, type ScaledIngredient } from './scaling'
import { isMassUnit, isVolumeUnit, toBase } from './units'

export type AllergenId = 'glutine' | 'crostacei' | 'uova' | 'pesce' | 'arachidi' | 'soia' | 'latte' | 'frutta_a_guscio' | 'sedano' | 'senape' | 'sesamo' | 'solfiti' | 'lupini' | 'molluschi'

interface AllergenDef {
  id: AllergenId
  label: string
  pattern: RegExp
  /** Falsi positivi da scartare (noce moscata non è frutta a guscio). */
  exclude?: RegExp
}

/** I 14 allergeni dell'allegato II, con le parole che li tradiscono nei nomi italiani degli ingredienti. */
export const ALLERGENS: AllergenDef[] = [
  { id: 'glutine', label: 'glutine', pattern: /\b(farin[ae]|grano|frumento|orzo|segale|avena|farro|kamut|semol[ae]|pane|pangrattato|pasta|savoiard|biscott|couscous|cuscus|seitan|malto|bulgur|crusca|germe di grano|piadin|grissin|fette biscottate|pan di spagna|sfoglia|brisée|brise)/i, exclude: /\b(farina di (riso|mais|castagne|ceci|mandorle|grano saraceno|cocco|miglio|quinoa|tapioca)|senza glutine|pasta di (mandorle|nocciole|pistacchi|zucchero|cacao)|pane di (riso|mais))/i },
  { id: 'crostacei', label: 'crostacei', pattern: /\b(gamber|scamp|aragost|astic|granch|mazzancoll|canocch|cicala di mare|crostace)/i },
  { id: 'uova', label: 'uova', pattern: /\b(uov[ao]|tuorl|album[ei]|maionese|meringa)/i },
  { id: 'pesce', label: 'pesce', pattern: /\b(pesce|tonno|salmone|acciug|alic|merluzz|baccal|stoccaf|sgombr|branzin|spigol|orat|trot|sogliol|nasell|pesce spada|bottarga|colla di pesce|sardin|triglie?|rombo|cernia|dentice|ricciola|platessa|halibut|aringh|salsa worcester)/i },
  { id: 'arachidi', label: 'arachidi', pattern: /\b(arachid|noccioline americane|burro di arachidi)/i },
  { id: 'soia', label: 'soia', pattern: /\b(soia|tofu|edamame|miso|tamari|tempeh|lecitina di soia)/i },
  { id: 'latte', label: 'latte', pattern: /\b(latte|burro|panna|mascarpone|ricotta|formagg|parmigian|grana|pecorin|mozzarell|yogurt|besciamell|latticin|siero|caseina|gorgonzol|stracchin|provol|scamorz|caciocavall|taleggi|fontina|brie|camembert|emmental|cheddar|gruyer|feta|caprin|robiola|burrata|crescenza|asiago|montasio|squacqueron|kefir|lattosio|ghee|cream cheese|philadelphia)/i, exclude: /\b(latte di (cocco|mandorl|soia|avena|riso)|burro di (arachidi|cacao|karité|mandorle)|senza lattosio|delattosato)/i },
  { id: 'frutta_a_guscio', label: 'frutta a guscio', pattern: /\b(mandorl|nocciol|noci|noce|pistacch|anacard|pecan|macadamia|pinol|marzapan|gianduj|pralin|frutta secca|frutta a guscio|noci del brasile)/i, exclude: /\b(noce moscata|noccioline americane|noce di cocco|cocco)/i },
  { id: 'sedano', label: 'sedano', pattern: /\b(sedano|sedano rapa|dado)/i },
  { id: 'senape', label: 'senape', pattern: /\b(senape|mostarda)/i },
  { id: 'sesamo', label: 'sesamo', pattern: /\b(sesamo|tahin|tahina|gomasio)/i },
  { id: 'solfiti', label: 'anidride solforosa e solfiti', pattern: /\b(solfit|anidride solforosa|vino|marsala|aceto di vino|aceto balsamico|frutta candita|uvetta|uva passa|albicocche secche|succo d'uva)/i },
  { id: 'lupini', label: 'lupini', pattern: /\b(lupin)/i },
  { id: 'molluschi', label: 'molluschi', pattern: /\b(cozz|vongol|calamar|sepp|polp|totan|ostric|capesant|lumach|mollusc|cannolicch|tellin|moscardin|fasolar|datteri di mare)/i },
]

export const ALLERGEN_IDS: AllergenId[] = ALLERGENS.map((a) => a.id)

export function allergenLabel(id: AllergenId): string {
  return ALLERGENS.find((a) => a.id === id)?.label ?? id
}

export function detectAllergens(name: string): AllergenId[] {
  const n = name.toLowerCase()
  return ALLERGENS.filter((a) => a.pattern.test(n) && !(a.exclude && a.exclude.test(n))).map((a) => a.id)
}

/** Grammi stimati di un ingrediente scalato: pesi diretti, volumi ≈ pesi, uova 55 g l'una; `null` se non si sa. */
export function estimateGrams(ing: ScaledIngredient): number | null {
  const q = ing.scaled
  if (!q || q.unit === 'q.b.') return null
  const b = toBase(q)
  if (isMassUnit(b.unit) || isVolumeUnit(b.unit)) return b.amount
  if (b.unit === 'cucchiaio') return b.amount * 12
  if (b.unit === 'cucchiaino') return b.amount * 5
  if (b.unit === 'tazza') return b.amount * 200
  if (b.unit === 'bicchiere') return b.amount * 150
  if (b.unit === 'pizzico') return b.amount * 0.5
  if (isDoseUnit(b.unit) && /\buov[ao]\b/i.test(ing.name)) return b.amount * 55
  if (b.unit === 'bustina') return b.amount * 8
  return null
}

export interface LabelItem {
  name: string
  grams: number | null
  allergens: AllergenId[]
  /** Componenti di una base, già in ordine di peso. */
  parts?: LabelItem[]
  toTaste: boolean
}

function sortByWeight(items: LabelItem[]): LabelItem[] {
  return [...items].sort((a, b) => {
    if (a.toTaste !== b.toTaste) return a.toTaste ? 1 : -1
    if (a.grams === null && b.grams === null) return 0
    if (a.grams === null) return 1
    if (b.grams === null) return -1
    return b.grams - a.grams
  })
}

/**
 * Voci dell'etichetta per una ricetta a un dato fattore. Le basi compaiono con
 * il loro nome e, tra parentesi, i componenti; gli allergeni di una base sono
 * l'unione di quelli dei componenti.
 */
export function labelItems(recipe: Recipe, factor: number, lookup: RecipeLookup, depth = 0, visited: Set<string> = new Set([recipe.id])): LabelItem[] {
  const items: LabelItem[] = []
  for (const ing of scaleRecipe(recipe, factor).ingredients) {
    const base = ing.recipeId ? lookup(ing.recipeId) : undefined
    const bf = base ? baseFactor(ing.scaled, base) : null
    const toTaste = ing.scaling?.mode === 'toTaste' || !ing.scaled || ing.scaled.unit === 'q.b.'
    if (base && bf?.factor && !visited.has(base.id) && depth < MAX_BASE_DEPTH) {
      const parts = labelItems(base, bf.factor, lookup, depth + 1, new Set([...visited, base.id]))
      const grams = estimateGrams(ing) ?? parts.reduce<number | null>((acc, p) => (acc === null || p.grams === null ? (p.grams ?? acc) : acc + p.grams), null)
      items.push({ name: ing.name, grams, allergens: ALLERGEN_IDS.filter((id) => parts.some((p) => p.allergens.includes(id))), parts, toTaste: false })
      continue
    }
    items.push({ name: ing.name, grams: estimateGrams(ing), allergens: detectAllergens(ing.name), toTaste })
  }
  return sortByWeight(items)
}

/** Tutti gli allergeni presenti, nell'ordine dell'allegato. */
export function collectAllergens(items: LabelItem[]): AllergenId[] {
  const found = new Set(items.flatMap((i) => i.allergens))
  return ALLERGEN_IDS.filter((id) => found.has(id))
}

/** "farina di GRANO, BURRO, frolla alle noci (farina, NOCI, UOVA), sale" con gli allergeni in maiuscolo. */
export function labelText(items: LabelItem[], highlight: (name: string) => string = (n) => n.toUpperCase()): string {
  const one = (i: LabelItem): string => {
    const name = i.allergens.length > 0 && !i.parts ? highlight(i.name) : i.name
    return i.parts ? `${name} (${i.parts.map(one).join(', ')})` : name
  }
  return items.map(one).join(', ')
}

/** Ingredienti semplici con peso, per il totale e per la percentuale sull'etichetta. */
export function totalGrams(recipe: Recipe, factor: number, lookup: RecipeLookup): number {
  return flattenIngredients(recipe, factor, lookup).reduce((acc, i) => acc + (estimateGrams(i) ?? 0), 0)
}
