/**
 * Schema di scambio con l'AI. Volutamente più semplice del modello interno
 * (niente id generati, riferimenti per indice) e convertito in Recipe con
 * validazione dei riferimenti.
 */
import { z } from 'zod'
import { newId, slugify, UNITS, type Ingredient, type Pan, type Recipe, type ScalingRule, type Step, type Unit } from '@/core'

// L'API limita a 16 i parametri con tipi unione (nullable o anyOf) in tutto lo
// schema: i testi facoltativi usano quindi la stringa vuota invece di null.
export const aiIngredientSchema = z.object({
  id: z.string().describe('Identificatore breve in minuscolo senza spazi, es. "farina", "uova", "olio-evo". Unico nella ricetta.'),
  name: z.string().describe('Nome dell\'ingrediente in italiano, minuscolo, es. "farina 00"'),
  amount: z.number().nullable().describe('Quantità numerica, null se assente (es. "sale q.b.")'),
  unit: z.enum(UNITS as [Unit, ...Unit[]]).describe('Unità. Stringa vuota per pezzi interi (2 uova). "q.b." per quanto basta.'),
  scaling: z
    .enum(['linear', 'sublinear', 'discrete', 'fixed', 'toTaste', 'bakersPercent'])
    .describe(
      'linear: farina, acqua, pasta, carne. sublinear: sale, spezie, lievito, aromi. discrete: uova e pezzi interi. fixed: una foglia di alloro. toTaste: q.b. bakersPercent: solo negli impasti, per ingredienti espressi in % della farina.',
    ),
  bakersPercent: z.number().nullable().describe('Solo se scaling=bakersPercent: percentuale rispetto all\'ingrediente base'),
  bakersOf: z.string().describe('Solo se scaling=bakersPercent: id dell\'ingrediente base (di solito la farina), altrimenti stringa vuota'),
  note: z.string().describe('Preparazione o nota breve: "a cubetti", "a temperatura ambiente"; stringa vuota se assente'),
  section: z.string().describe('Sezione della ricetta se ce ne sono più di una (es. "Impasto", "Farcitura"), altrimenti stringa vuota'),
  optional: z.boolean(),
})

export const aiStepSchema = z.object({
  text: z
    .string()
    .describe(
      'Testo del passaggio. Cita ogni ingrediente usato scrivendo {id} al posto di quantità+nome (es. "Aggiungi {farina} e {acqua}"), oppure {id|nome} per citare solo il nome senza quantità. Non scrivere mai le quantità in chiaro.',
    ),
  type: z.enum(['prep', 'cook', 'rest', 'wait', 'serve']).nullable(),
  durationMin: z.number().nullable().describe('Durata indicativa in minuti'),
  temperatureC: z.number().nullable(),
  timerMinutes: z.number().nullable().describe('Minuti del timer se il passaggio ha un tempo da cronometrare (cottura, riposo)'),
  timerLabel: z.string().describe('Etichetta breve del timer, es. "Lievitazione"; stringa vuota se non c\'è timer'),
  equipment: z.array(z.string()).describe('Attrezzatura usata, es. ["padella", "teglia 24 cm"]'),
  section: z.string().describe('Sezione della ricetta, stringa vuota se nessuna'),
  parallelWithStep: z
    .number()
    .nullable()
    .describe('Indice (da 0) di un passaggio precedente di riposo/attesa/cottura lunga durante il quale questo passaggio si può svolgere, altrimenti null'),
})

export const aiRecipeSchema = z.object({
  title: z.string(),
  description: z.string().describe('Breve descrizione, stringa vuota se assente'),
  servings: z.number().describe('Porzioni per cui sono scritte le quantità; stima se non indicate'),
  yieldAmount: z.number().nullable().describe('Resa totale se ha senso (es. grammi di impasto), altrimenti null'),
  yieldUnit: z.string().describe('Unità della resa (es. "g"), stringa vuota se non c\'è resa'),
  panShape: z.enum(['', 'round', 'rect']).describe('Teglia o stampo per cui sono scritte le dosi: round tonda, rect rettangolare o quadrata, stringa vuota se la ricetta non ne indica una'),
  panWidthCm: z.number().describe('Diametro della teglia tonda o primo lato della rettangolare, in cm; 0 se non c\'è teglia'),
  panLengthCm: z.number().describe('Secondo lato della teglia rettangolare (uguale al primo se quadrata), in cm; 0 per la tonda o senza teglia'),
  tags: z.array(z.string()).describe('Tag brevi in minuscolo: primi, dolci, lievitati, veloce, vegetariano…'),
  ingredients: z.array(aiIngredientSchema),
  steps: z.array(aiStepSchema),
  notes: z.string().describe('Consigli e varianti presenti nella fonte, stringa vuota se assenti'),
  source: z.string().describe('Fonte, se nota (sito, libro, autore), altrimenti stringa vuota'),
})

export type AiRecipe = z.infer<typeof aiRecipeSchema>

export interface ConversionResult {
  recipe: Recipe
  warnings: string[]
}

/** Teglia dai tre campi senza unioni; una rettangolare con un solo lato è quadrata. */
function aiPan(ai: AiRecipe): Pan | undefined {
  const a = ai.panWidthCm
  const b = ai.panLengthCm
  if (!(a > 0)) return undefined
  if (ai.panShape === 'round') return { shape: 'round', diameterCm: a }
  if (ai.panShape === 'rect') return { shape: 'rect', widthCm: a, lengthCm: b > 0 ? b : a }
  return undefined
}

/** Converte la risposta dell'AI nel modello interno, correggendo id e riferimenti. */
export function aiToRecipe(ai: AiRecipe, base?: Partial<Pick<Recipe, 'id' | 'createdAt' | 'updatedAt'>>): ConversionResult {
  const warnings: string[] = []
  const now = new Date().toISOString()
  const usedIds = new Set<string>()
  const idMap = new Map<string, string>()

  const ingredients: Ingredient[] = ai.ingredients.map((i) => {
    let id = slugify(i.id) || slugify(i.name) || newId('i')
    let n = 2
    while (usedIds.has(id)) id = `${slugify(i.id) || slugify(i.name)}-${n++}`
    usedIds.add(id)
    idMap.set(i.id, id)
    let scaling: ScalingRule | undefined
    switch (i.scaling) {
      case 'linear':
        scaling = undefined
        break
      case 'bakersPercent':
        scaling = { mode: 'bakersPercent', percent: i.bakersPercent ?? 0, of: i.bakersOf }
        break
      default:
        scaling = { mode: i.scaling }
    }
    const isToTaste = i.scaling === 'toTaste' || i.unit === 'q.b.'
    const quantity =
      isToTaste ? { amount: 1, unit: 'q.b.' as Unit } : i.amount !== null && i.amount > 0 ? { amount: i.amount, unit: i.unit } : undefined
    if (isToTaste && !scaling) scaling = { mode: 'toTaste' }
    return {
      id,
      name: i.name.trim(),
      quantity,
      scaling,
      note: i.note?.trim() || undefined,
      section: i.section?.trim() || undefined,
      optional: i.optional || undefined,
    }
  })

  // risolve i riferimenti delle percentuali del panettiere
  for (const ing of ingredients) {
    if (ing.scaling?.mode === 'bakersPercent') {
      const of = idMap.get(ing.scaling.of) ?? ing.scaling.of
      const base = ingredients.find((b) => b.id === of && b.id !== ing.id)
      if (!base || !base.quantity || !ing.scaling.percent) {
        warnings.push(`"${ing.name}": percentuale del panettiere senza base valida, resa lineare.`)
        ing.scaling = undefined
      } else {
        ing.scaling = { ...ing.scaling, of: base.id }
      }
    }
  }

  const stepIds = ai.steps.map(() => newId('s'))
  const steps: Step[] = ai.steps.map((s, idx) => {
    const text = s.text.replace(/\{([^}|]+)(\|[^}]*)?\}/g, (m, rawId: string, mod: string | undefined) => {
      const mapped = idMap.get(rawId.trim()) ?? (usedIds.has(slugify(rawId)) ? slugify(rawId) : undefined)
      if (!mapped) {
        warnings.push(`Passo ${idx + 1}: riferimento "${rawId}" non corrisponde a nessun ingrediente.`)
        return m
      }
      return `{${mapped}${mod ?? ''}}`
    })
    const parallelWith =
      s.parallelWithStep !== null && s.parallelWithStep >= 0 && s.parallelWithStep < idx ? stepIds[s.parallelWithStep] : undefined
    return {
      id: stepIds[idx]!,
      text: text.trim(),
      type: s.type ?? undefined,
      durationMin: s.durationMin ?? undefined,
      temperatureC: s.temperatureC ?? undefined,
      timer: s.timerMinutes ? { minutes: s.timerMinutes, label: s.timerLabel?.trim() || undefined } : undefined,
      equipment: s.equipment.map((e) => e.trim()).filter(Boolean),
      section: s.section?.trim() || undefined,
      parallelWith,
    }
  })

  const sections = [...new Set([...ingredients, ...steps].map((x) => x.section).filter((x): x is string => Boolean(x)))]

  const recipe: Recipe = {
    id: base?.id ?? newId('r'),
    title: ai.title.trim(),
    description: ai.description?.trim() || undefined,
    servings: ai.servings > 0 ? ai.servings : 4,
    yield: ai.yieldAmount && ai.yieldAmount > 0 ? { amount: ai.yieldAmount, unit: ai.yieldUnit?.trim() || 'g' } : undefined,
    pan: aiPan(ai),
    tags: ai.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    sections: sections.length ? sections : undefined,
    ingredients,
    steps,
    notes: ai.notes?.trim() || undefined,
    source: ai.source?.trim() || undefined,
    createdAt: base?.createdAt ?? now,
    updatedAt: base?.updatedAt ?? now,
  }
  return { recipe, warnings }
}

/** Serializza una ricetta per darla in pasto all'AI (compatta, senza date). */
export function recipeForPrompt(recipe: Recipe): string {
  const { createdAt: _c, updatedAt: _u, ...rest } = recipe
  return JSON.stringify(rest, null, 1)
}
