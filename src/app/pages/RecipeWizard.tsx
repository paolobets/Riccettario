import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import {
  newId,
  SCALING_MODE_LABELS,
  slugify,
  STEP_TYPE_LABELS,
  UNITS,
  formatUnit,
  scaleRecipe,
  type Ingredient,
  type Recipe,
  type ScalingMode,
  type ScalingRule,
  type Step,
  type StepType,
  type Unit,
} from '@/core'
import StepText from '../components/StepText'

type Phase = 0 | 1 | 2 | 3
const PHASES = ['Ricetta', 'Ingredienti', 'Passaggi', 'Riepilogo']

/** Stato del form: come Recipe ma con quantità come stringhe per l'editing. */
interface IngredientDraft {
  id: string
  name: string
  amount: string
  unit: Unit
  mode: ScalingMode
  percent: string
  of: string
  note: string
  section: string
  optional: boolean
}
interface StepDraft {
  id: string
  text: string
  type: StepType | ''
  durationMin: string
  temperatureC: string
  timerMinutes: string
  timerLabel: string
  equipment: string
  section: string
  parallelWith: string
}

function emptyIngredient(): IngredientDraft {
  return { id: newId('i'), name: '', amount: '', unit: 'g', mode: 'linear', percent: '', of: '', note: '', section: '', optional: false }
}
function emptyStep(): StepDraft {
  return { id: newId('s'), text: '', type: '', durationMin: '', temperatureC: '', timerMinutes: '', timerLabel: '', equipment: '', section: '', parallelWith: '' }
}

function fromRecipe(r: Recipe) {
  return {
    title: r.title,
    description: r.description ?? '',
    servings: String(r.servings),
    yieldAmount: r.yield ? String(r.yield.amount) : '',
    yieldUnit: r.yield?.unit ?? '',
    tags: r.tags.join(', '),
    notes: r.notes ?? '',
    source: r.source ?? '',
    ingredients: r.ingredients.map<IngredientDraft>((i) => ({
      id: i.id,
      name: i.name,
      amount: i.quantity ? String(i.quantity.amount) : '',
      unit: i.quantity?.unit ?? '',
      mode: i.scaling?.mode ?? 'linear',
      percent: i.scaling?.mode === 'bakersPercent' ? String(i.scaling.percent) : '',
      of: i.scaling?.mode === 'bakersPercent' ? i.scaling.of : '',
      note: i.note ?? '',
      section: i.section ?? '',
      optional: i.optional ?? false,
    })),
    steps: r.steps.map<StepDraft>((s) => ({
      id: s.id,
      text: s.text,
      type: s.type ?? '',
      durationMin: s.durationMin ? String(s.durationMin) : '',
      temperatureC: s.temperatureC ? String(s.temperatureC) : '',
      timerMinutes: s.timer ? String(s.timer.minutes) : '',
      timerLabel: s.timer?.label ?? '',
      equipment: s.equipment?.join(', ') ?? '',
      section: s.section ?? '',
      parallelWith: s.parallelWith ?? '',
    })),
  }
}
type Draft = ReturnType<typeof fromRecipe>

function num(s: string): number | undefined {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined
}

function toRecipe(d: Draft, base: Pick<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Recipe {
  const ingredients: Ingredient[] = d.ingredients
    .filter((i) => i.name.trim())
    .map((i) => {
      const amount = num(i.amount)
      let scaling: ScalingRule | undefined
      switch (i.mode) {
        case 'linear':
          scaling = undefined
          break
        case 'bakersPercent':
          scaling = { mode: 'bakersPercent', percent: num(i.percent) ?? 0, of: i.of }
          break
        default:
          scaling = { mode: i.mode } as ScalingRule
      }
      const unit: Unit = i.mode === 'toTaste' ? 'q.b.' : i.unit
      return {
        id: i.id,
        name: i.name.trim(),
        quantity: amount !== undefined ? { amount, unit } : i.mode === 'toTaste' ? { amount: 1, unit: 'q.b.' } : undefined,
        scaling,
        note: i.note.trim() || undefined,
        section: i.section.trim() || undefined,
        optional: i.optional || undefined,
      }
    })
  const steps: Step[] = d.steps
    .filter((s) => s.text.trim())
    .map((s) => {
      const timerMinutes = num(s.timerMinutes)
      return {
        id: s.id,
        text: s.text.trim(),
        type: s.type || undefined,
        durationMin: num(s.durationMin),
        temperatureC: num(s.temperatureC),
        timer: timerMinutes ? { minutes: timerMinutes, label: s.timerLabel.trim() || undefined } : undefined,
        equipment: s.equipment.split(',').map((e) => e.trim()).filter(Boolean),
        section: s.section.trim() || undefined,
        parallelWith: s.parallelWith && d.steps.some((o) => o.id === s.parallelWith && o.id !== s.id) ? s.parallelWith : undefined,
      }
    })
  const sections = [...new Set([...ingredients, ...steps].map((x) => x.section).filter((x): x is string => Boolean(x)))]
  const yieldAmount = num(d.yieldAmount)
  return {
    ...base,
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    servings: num(d.servings) ?? 1,
    yield: yieldAmount ? { amount: yieldAmount, unit: d.yieldUnit.trim() || 'g' } : undefined,
    tags: d.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    sections: sections.length ? sections : undefined,
    ingredients,
    steps,
    notes: d.notes.trim() || undefined,
    source: d.source.trim() || undefined,
  }
}

export default function RecipeWizard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>(0)
  const [draft, setDraft] = useState<Draft | null>(id ? null : fromRecipe({ ...emptyRecipe(), ingredients: [], steps: [] }))
  const [base, setBase] = useState<Pick<Recipe, 'id' | 'createdAt' | 'updatedAt'>>(() => emptyRecipe())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    db.recipes.get(id).then((r) => {
      if (r) {
        setDraft(fromRecipe(r))
        setBase({ id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt })
      } else navigate('/')
    })
  }, [id, navigate])

  if (!draft) return null
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  const canNext = phase === 0 ? draft.title.trim().length > 0 && (num(draft.servings) ?? 0) > 0 : phase === 1 ? draft.ingredients.some((i) => i.name.trim()) : true

  const save = async () => {
    setSaving(true)
    const recipe = toRecipe(draft, base)
    await saveRecipe(recipe)
    navigate(`/ricetta/${recipe.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-900">{id ? 'Modifica ricetta' : 'Nuova ricetta'}</h1>
        <Link to={id ? `/ricetta/${id}` : '/'} className="btn-ghost px-2 py-1 text-sm">
          Annulla
        </Link>
      </div>
      <ol className="flex gap-1 text-xs">
        {PHASES.map((p, i) => (
          <li key={p} className="flex-1">
            <button
              className={`w-full rounded-full px-2 py-1 ${i === phase ? 'bg-brand-700 text-white' : i < phase ? 'bg-brand-200 text-brand-900' : 'bg-stone-200 text-stone-600'}`}
              onClick={() => i < phase && setPhase(i as Phase)}
              disabled={i > phase}
            >
              {i + 1}. {p}
            </button>
          </li>
        ))}
      </ol>

      {phase === 0 && <PhaseInfo draft={draft} set={set} />}
      {phase === 1 && <PhaseIngredients draft={draft} set={set} />}
      {phase === 2 && <PhaseSteps draft={draft} set={set} />}
      {phase === 3 && <PhaseReview recipe={toRecipe(draft, base)} />}

      <div className="flex justify-between gap-3">
        <button className="btn-secondary" onClick={() => setPhase((phase - 1) as Phase)} disabled={phase === 0}>
          ← Indietro
        </button>
        {phase < 3 ? (
          <button className="btn-primary" onClick={() => setPhase((phase + 1) as Phase)} disabled={!canNext}>
            Avanti →
          </button>
        ) : (
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvo…' : 'Salva ricetta'}
          </button>
        )}
      </div>
    </div>
  )
}

function emptyRecipe(): Recipe {
  const now = new Date().toISOString()
  return { id: newId('r'), title: '', servings: 4, tags: [], ingredients: [], steps: [], createdAt: now, updatedAt: now }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  )
}

function PhaseInfo({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <section className="card space-y-3">
      <Field label="Titolo">
        <input className="w-full" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
      </Field>
      <Field label="Descrizione">
        <textarea className="w-full" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Porzioni" hint="Per cui scrivi le quantità">
          <input className="w-full" type="number" min={1} step="any" value={draft.servings} onChange={(e) => set({ servings: e.target.value })} />
        </Field>
        <Field label="Resa (opz.)" hint="Es. 850">
          <input className="w-full" type="number" min={0} step="any" value={draft.yieldAmount} onChange={(e) => set({ yieldAmount: e.target.value })} />
        </Field>
        <Field label="Unità resa" hint="Es. g, pezzi">
          <input className="w-full" value={draft.yieldUnit} onChange={(e) => set({ yieldUnit: e.target.value })} />
        </Field>
        <Field label="Tag" hint="Separati da virgola">
          <input className="w-full" value={draft.tags} onChange={(e) => set({ tags: e.target.value })} />
        </Field>
      </div>
      <Field label="Fonte (opz.)">
        <input className="w-full" value={draft.source} onChange={(e) => set({ source: e.target.value })} placeholder="Libro, sito, nonna…" />
      </Field>
      <Field label="Note">
        <textarea className="w-full" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </section>
  )
}

function PhaseIngredients({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const update = (idx: number, patch: Partial<IngredientDraft>) => {
    const next = draft.ingredients.map((i, k) => (k === idx ? { ...i, ...patch } : i))
    set({ ingredients: next })
  }
  const remove = (idx: number) => set({ ingredients: draft.ingredients.filter((_, k) => k !== idx) })
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft.ingredients]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    set({ ingredients: next })
  }
  const add = () => set({ ingredients: [...draft.ingredients, emptyIngredient()] })
  const massIngredients = draft.ingredients.filter((i) => i.name.trim() && (i.unit === 'g' || i.unit === 'kg'))

  return (
    <section className="space-y-3">
      <p className="text-sm text-stone-600">
        Per ogni ingrediente scegli come deve scalare. Il sale e il lievito di solito sono <b>sub-lineari</b>, le uova <b>a pezzi interi</b>.
      </p>
      {draft.ingredients.map((ing, idx) => (
        <div key={ing.id} className="card space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-500">#{idx + 1}</span>
            <input
              className="flex-1"
              placeholder="Nome (es. farina 00)"
              value={ing.name}
              autoFocus={!ing.name}
              onChange={(e) => {
                const name = e.target.value
                // l'id segue il nome finché non è stato usato nei passaggi
                const used = draft.steps.some((s) => s.text.includes(`{${ing.id}`))
                update(idx, { name, ...(used ? {} : { id: slugify(name) || ing.id }) })
              }}
            />
            <button className="btn-ghost px-2 py-1" onClick={() => move(idx, -1)} aria-label="Sposta su">↑</button>
            <button className="btn-ghost px-2 py-1" onClick={() => move(idx, 1)} aria-label="Sposta giù">↓</button>
            <button className="btn-ghost px-2 py-1 text-red-700" onClick={() => remove(idx)} aria-label="Rimuovi">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder="Quantità"
              value={ing.amount}
              disabled={ing.mode === 'toTaste'}
              onChange={(e) => update(idx, { amount: e.target.value })}
            />
            <select value={ing.unit} disabled={ing.mode === 'toTaste'} onChange={(e) => update(idx, { unit: e.target.value as Unit })}>
              {UNITS.filter((u) => u !== 'q.b.').map((u) => (
                <option key={u} value={u}>
                  {u === '' ? '(nessuna: pezzi)' : formatUnit(u, 1)}
                </option>
              ))}
            </select>
            <select
              className="col-span-2"
              value={ing.mode}
              onChange={(e) => {
                const mode = e.target.value as ScalingMode
                update(idx, { mode, ...(mode === 'discrete' && ing.unit !== 'pz' && ing.unit !== '' && ing.unit !== 'fetta' && ing.unit !== 'spicchio' ? { unit: '' } : {}) })
              }}
            >
              {(Object.keys(SCALING_MODE_LABELS) as ScalingMode[]).map((m) => (
                <option key={m} value={m}>
                  {SCALING_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {ing.mode === 'bakersPercent' && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" inputMode="decimal" step="any" min={0} placeholder="% (es. 65)" value={ing.percent} onChange={(e) => update(idx, { percent: e.target.value })} />
              <select value={ing.of} onChange={(e) => update(idx, { of: e.target.value })}>
                <option value="">rispetto a…</option>
                {massIngredients.filter((m) => m.id !== ing.id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <input placeholder="Nota (es. a cubetti)" value={ing.note} onChange={(e) => update(idx, { note: e.target.value })} />
            <input placeholder="Sezione (es. Impasto)" value={ing.section} onChange={(e) => update(idx, { section: e.target.value })} list="sections" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={ing.optional} onChange={(e) => update(idx, { optional: e.target.checked })} />
              facoltativo
            </label>
          </div>
        </div>
      ))}
      <datalist id="sections">
        {[...new Set([...draft.ingredients, ...draft.steps].map((x) => x.section).filter(Boolean))].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button className="btn-secondary w-full" onClick={add}>
        + Aggiungi ingrediente
      </button>
    </section>
  )
}

function PhaseSteps({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  /** Ultima posizione del cursore per ogni passaggio: il clic sul bottone fa perdere il focus. */
  const carets = useRef<Record<string, number>>({})
  const rememberCaret = (stepId: string, el: HTMLTextAreaElement) => {
    carets.current[stepId] = el.selectionStart ?? el.value.length
  }
  const update = (idx: number, patch: Partial<StepDraft>) => set({ steps: draft.steps.map((s, k) => (k === idx ? { ...s, ...patch } : s)) })
  const remove = (idx: number) => set({ steps: draft.steps.filter((_, k) => k !== idx) })
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft.steps]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    set({ steps: next })
  }
  const add = () => set({ steps: [...draft.steps, emptyStep()] })
  const insertRef = (idx: number, ingId: string, nameOnly: boolean) => {
    const step = draft.steps[idx]!
    const ta = textareas.current[step.id]
    const token = nameOnly ? `{${ingId}|nome}` : `{${ingId}}`
    const pos = Math.min(carets.current[step.id] ?? step.text.length, step.text.length)
    const text = step.text.slice(0, pos) + token + step.text.slice(pos)
    const nextPos = pos + token.length
    carets.current[step.id] = nextPos
    update(idx, { text })
    setTimeout(() => {
      if (ta) {
        ta.focus()
        ta.setSelectionRange(nextPos, nextPos)
      }
    }, 0)
  }
  const ingredients = draft.ingredients.filter((i) => i.name.trim())
  const used = new Set(draft.steps.flatMap((s) => [...s.text.matchAll(/\{([a-zA-Z0-9_-]+)/g)].map((m) => m[1])))
  const unused = ingredients.filter((i) => !used.has(i.id))

  return (
    <section className="space-y-3">
      <p className="text-sm text-stone-600">
        Scrivi il passaggio e <b>inserisci gli ingredienti con i bottoni</b>: la quantità comparirà già riscalata quando cucini. Tieni premuto a lungo (o usa "solo nome") per citare l'ingrediente senza quantità.
      </p>
      {draft.steps.map((step, idx) => (
        <div key={step.id} className="card space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-stone-500">Passo {idx + 1}</span>
            <select className="py-1 text-sm" value={step.type} onChange={(e) => update(idx, { type: e.target.value as StepType | '' })}>
              <option value="">tipo…</option>
              {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map((t) => (
                <option key={t} value={t}>
                  {STEP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input className="w-32 py-1 text-sm" placeholder="Sezione" value={step.section} onChange={(e) => update(idx, { section: e.target.value })} list="sections" />
            <span className="flex-1" />
            <button className="btn-ghost px-2 py-1" onClick={() => move(idx, -1)} aria-label="Sposta su">↑</button>
            <button className="btn-ghost px-2 py-1" onClick={() => move(idx, 1)} aria-label="Sposta giù">↓</button>
            <button className="btn-ghost px-2 py-1 text-red-700" onClick={() => remove(idx)} aria-label="Rimuovi">✕</button>
          </div>
          <textarea
            ref={(el) => {
              textareas.current[step.id] = el
            }}
            className="w-full"
            rows={3}
            placeholder="Es. Sciogli {lievito} in {acqua} tiepida…"
            value={step.text}
            autoFocus={!step.text}
            onChange={(e) => {
              rememberCaret(step.id, e.target)
              update(idx, { text: e.target.value })
            }}
            onSelect={(e) => rememberCaret(step.id, e.currentTarget)}
            onKeyUp={(e) => rememberCaret(step.id, e.currentTarget)}
            onClick={(e) => rememberCaret(step.id, e.currentTarget)}
            onBlur={(e) => rememberCaret(step.id, e.currentTarget)}
          />
          <div className="flex flex-wrap gap-1">
            {ingredients.map((i) => (
              <span key={i.id} className="inline-flex overflow-hidden rounded-full border border-brand-200 text-xs">
                <button className="bg-brand-100 px-2 py-0.5 text-brand-900 hover:bg-brand-200" onClick={() => insertRef(idx, i.id, false)} title="Inserisci con quantità">
                  {i.name}
                </button>
                <button className="bg-white px-1.5 py-0.5 text-stone-500 hover:bg-stone-100" onClick={() => insertRef(idx, i.id, true)} title="Inserisci solo il nome">
                  n
                </button>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input type="number" inputMode="numeric" min={0} placeholder="Durata (min)" value={step.durationMin} onChange={(e) => update(idx, { durationMin: e.target.value })} />
            <input type="number" inputMode="numeric" min={0} placeholder="°C" value={step.temperatureC} onChange={(e) => update(idx, { temperatureC: e.target.value })} />
            <input type="number" inputMode="numeric" min={0} placeholder="Timer (min)" value={step.timerMinutes} onChange={(e) => update(idx, { timerMinutes: e.target.value })} />
            <input placeholder="Nome timer" value={step.timerLabel} onChange={(e) => update(idx, { timerLabel: e.target.value })} />
            <input placeholder="Attrezzatura" value={step.equipment} onChange={(e) => update(idx, { equipment: e.target.value })} />
          </div>
          {draft.steps.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <span>↔ Si può fare durante</span>
              <select className="py-1 text-sm" value={step.parallelWith} onChange={(e) => update(idx, { parallelWith: e.target.value })}>
                <option value="">nessun altro passaggio</option>
                {draft.steps.map((o, k) =>
                  o.id === step.id ? null : (
                    <option key={o.id} value={o.id}>
                      passo {k + 1}{o.timerMinutes ? ` (timer ${o.timerMinutes} min)` : ''}{o.type ? ` · ${STEP_TYPE_LABELS[o.type]}` : ''}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
        </div>
      ))}
      <datalist id="sections">
        {[...new Set([...draft.ingredients, ...draft.steps].map((x) => x.section).filter(Boolean))].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button className="btn-secondary w-full" onClick={add}>
        + Aggiungi passaggio
      </button>
      {unused.length > 0 && draft.steps.length > 0 && (
        <p className="text-xs text-amber-800">Ingredienti non ancora citati in nessun passaggio: {unused.map((i) => i.name).join(', ')}.</p>
      )}
    </section>
  )
}

function PhaseReview({ recipe }: { recipe: Recipe }) {
  const scaled = useMemo(() => scaleRecipe(recipe, 1), [recipe])
  const doubled = useMemo(() => scaleRecipe(recipe, 2), [recipe])
  const problems: string[] = []
  if (!recipe.title) problems.push('Manca il titolo.')
  if (recipe.ingredients.length === 0) problems.push('Nessun ingrediente.')
  if (recipe.steps.length === 0) problems.push('Nessun passaggio.')
  for (const i of recipe.ingredients) {
    const rule = i.scaling
    if (rule?.mode === 'bakersPercent' && (!rule.of || !recipe.ingredients.some((b) => b.id === rule.of && b.id !== i.id)))
      problems.push(`"${i.name}": percentuale del panettiere senza ingrediente base.`)
  }
  return (
    <section className="space-y-3">
      {problems.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {problems.map((p) => (
            <p key={p}>⚠︎ {p}</p>
          ))}
        </div>
      )}
      <div className="card">
        <h2 className="text-xl font-bold text-brand-900">{recipe.title}</h2>
        <p className="text-sm text-stone-600">
          {recipe.servings} porzioni · {recipe.ingredients.length} ingredienti · {recipe.steps.length} passaggi
        </p>
      </div>
      <div className="card">
        <h3 className="mb-2 font-semibold">Prova di scalatura: ×2</h3>
        <p className="mb-2 text-xs text-stone-500">Controlla che le regole scelte diano quantità sensate.</p>
        <table className="w-full text-sm">
          <tbody>
            {scaled.ingredients.map((i) => {
              const d = doubled.byId.get(i.id)
              return (
                <tr key={i.id} className="border-t border-stone-100">
                  <td className="py-1">{i.name}</td>
                  <td className="py-1 text-right text-stone-500">{i.scaled ? `${Math.round(i.scaled.amount * 100) / 100} ${i.scaled.unit}` : '—'}</td>
                  <td className="py-1 text-right font-semibold">{d?.scaled ? `${Math.round(d.scaled.amount * 100) / 100} ${d.scaled.unit}` : '—'}</td>
                  <td className="py-1 pl-2 text-xs text-stone-400">{SCALING_MODE_LABELS[i.scaling?.mode ?? 'linear']}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">Passaggi</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm">
          {recipe.steps.map((s) => (
            <li key={s.id}>
              <StepText step={s} scaled={scaled} className="inline" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
