/**
 * Etichetta degli ingredienti: elenco in ordine decrescente di peso (come
 * chiede il regolamento UE 1169/2011), allergeni riconosciuti dai nomi ed evidenziati. È un aiuto a
 * scrivere l'etichetta, non un parere legale: gli allergeni vanno confermati.
 */
import type { Recipe } from './model'
import { scaleRecipe, type ScaledIngredient } from './scaling'
import { isDoseUnit, isMassUnit, isVolumeUnit, toBase } from './units'
import { normalizeIngredientName } from './shopping'

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
 * Voci dell'etichetta per una ricetta a un dato fattore. Le Basi sono già
 * copiate nella ricetta come ingredienti veri: un `recipeId` rimasto da dati
 * vecchi non si apre, la riga vale come ingrediente semplice.
 */
export function labelItems(recipe: Recipe, factor: number): LabelItem[] {
  return sortByWeight(
    scaleRecipe(recipe, factor).ingredients.map((ing) => ({
      name: ing.name,
      grams: estimateGrams(ing),
      allergens: detectAllergens(ing.name),
      toTaste: ing.scaling?.mode === 'toTaste' || !ing.scaled || ing.scaled.unit === 'q.b.',
    })),
  )
}

/**
 * Ingredienti per l'elenco puntato dell'etichetta: ogni ingrediente una volta
 * sola anche se compare in più sezioni (stesso nome normalizzato,
 * come nella spesa), con i grammi sommati per l'ordine di peso.
 */
export function labelIngredients(items: LabelItem[]): LabelItem[] {
  const merged = new Map<string, LabelItem>()
  const add = (item: LabelItem) => {
    const key = normalizeIngredientName(item.name)
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, { name: item.name.replace(/\s*\([^)]*\)/g, '').trim() || item.name, grams: item.grams, allergens: [...item.allergens], toTaste: item.toTaste })
      return
    }
    prev.grams = prev.grams === null ? item.grams : item.grams === null ? prev.grams : prev.grams + item.grams
    prev.allergens = ALLERGEN_IDS.filter((id) => prev.allergens.includes(id) || item.allergens.includes(id))
    prev.toTaste = prev.toTaste && item.toTaste
  }
  items.forEach(add)
  return sortByWeight([...merged.values()])
}

/** Tutti gli allergeni presenti, nell'ordine dell'allegato. */
export function collectAllergens(items: LabelItem[]): AllergenId[] {
  const found = new Set(items.flatMap((i) => i.allergens))
  return ALLERGEN_IDS.filter((id) => found.has(id))
}

/** "farina di GRANO, BURRO, NOCI, sale" con gli allergeni in maiuscolo. */
export function labelText(items: LabelItem[], highlight: (name: string) => string = (n) => n.toUpperCase()): string {
  return items.map((i) => (i.allergens.length > 0 ? highlight(i.name) : i.name)).join(', ')
}

/** Ingredienti semplici con peso, per il totale e per la percentuale sull'etichetta. */
export function totalGrams(recipe: Recipe, factor: number): number {
  return scaleRecipe(recipe, factor).ingredients.reduce((acc, i) => acc + (estimateGrams(i) ?? 0), 0)
}
