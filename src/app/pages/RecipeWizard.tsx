import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import {
  newId,
  SCALING_MODE_LABELS,
  slugify,
  STEP_TYPE_LABELS,
  UNITS,
  formatQuantity,
  formatUnit,
  scaleRecipe,
  checkRecipe,
  wouldCycle,
  isMassUnit,
  isVolumeUnit,
  dosingOf,
  formatPan,
  DOSING_MODE_LABELS,
  DOUGH_TYPES,
  type DosingMode,
  type DoughType,
  type Pan,
  type Ingredient,
  type Recipe,
  type ScalingMode,
  type ScalingRule,
  type Step,
  type StepType,
  type Unit,
} from '@/core'
import StepText from '../components/StepText'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import ImportReviewChat from '../components/ImportReviewChat'

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
  /** Se è una base: id della ricetta. */
  recipeId: string
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
  return { id: newId('i'), name: '', amount: '', unit: 'g', mode: 'linear', percent: '', of: '', note: '', section: '', optional: false, recipeId: '' }
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
    panShape: (r.pan?.shape ?? '') as Pan['shape'] | '',
    panA: r.pan ? String(r.pan.shape === 'round' ? r.pan.diameterCm : r.pan.widthCm) : '',
    panB: r.pan?.shape === 'rect' ? String(r.pan.lengthCm) : '',
    dosingMode: dosingOf(r).mode as DosingMode,
    dough: (dosingOf(r).dough ?? '') as DoughType | '',
    pieceGrams: dosingOf(r).pieceGrams ? String(dosingOf(r).pieceGrams) : '',
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
      recipeId: i.recipeId ?? '',
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
        recipeId: i.recipeId || undefined,
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
  const panA = num(d.panA)
  const panB = num(d.panB)
  const pan: Pan | undefined =
    d.panShape === 'round' && panA ? { shape: 'round', diameterCm: panA } : d.panShape === 'rect' && panA && panB ? { shape: 'rect', widthCm: panA, lengthCm: panB } : undefined
  return {
    ...base,
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    servings: num(d.servings) ?? 1,
    yield: yieldAmount ? { amount: yieldAmount, unit: d.yieldUnit.trim() || 'g' } : undefined,
    pan,
    dosing: {
      mode: d.dosingMode,
      dough: d.dosingMode === 'pans' && d.dough ? d.dough : undefined,
      pieceGrams: d.dosingMode === 'pieces' ? num(d.pieceGrams) : undefined,
    },
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
  const location = useLocation()
  const prefill = (location.state ?? {}) as { recipe?: Recipe; warnings?: string[]; fromAi?: boolean; costUsd?: number; source?: string; startPhase?: Phase; composed?: boolean }
  const [phase, setPhase] = useState<Phase>(prefill.startPhase ?? (prefill.recipe ? 3 : 0))
  const [draft, setDraft] = useState<Draft | null>(id ? null : fromRecipe(prefill.recipe ?? { ...emptyRecipe(), ingredients: [], steps: [] }))
  const [base, setBase] = useState<Pick<Recipe, 'id' | 'createdAt' | 'updatedAt'>>(() => (prefill.recipe ? { id: prefill.recipe.id, createdAt: prefill.recipe.createdAt, updatedAt: prefill.recipe.updatedAt } : emptyRecipe()))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(Boolean(prefill.recipe))
  const { confirm, dialog } = useConfirm()
  const allRecipes = useLiveQuery(() => db.recipes.toArray(), [])

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
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setDirty(true)
  }
  const cancel = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Scartare le modifiche?',
        body: 'Quello che hai scritto in questa scheda andrà perso.',
        confirmLabel: 'Scarta',
        cancelLabel: 'Continua a scrivere',
        danger: true,
      })
      if (!ok) return
    }
    navigate(id ? `/ricetta/${id}` : '/')
  }

  const canNext = phase === 0 ? draft.title.trim().length > 0 && (num(draft.servings) ?? 0) > 0 : phase === 1 ? draft.ingredients.some((i) => i.name.trim()) : true

  const save = async () => {
    setSaving(true)
    const recipe = toRecipe(draft, base)
    await saveRecipe(recipe)
    navigate(`/ricetta/${recipe.id}`)
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-medium text-fg">{id ? 'Modifica ricetta' : prefill.fromAi ? 'Ricetta importata' : 'Nuova ricetta'}</h1>
        <button className="btn-ghost min-h-10 px-2 py-1 text-sm" onClick={cancel}>
          Annulla
        </button>
      </div>
      {prefill.fromAi && (
        <div className="notice bg-info-soft text-info">
          <p>
            L'AI ha strutturato la ricetta. Controlla ingredienti, regole di scalatura e passaggi, oppure chiedi all'AI di correggerli qui sotto, poi salva.
            {prefill.costUsd !== undefined && <span className="text-info"> Costo della richiesta: {prefill.costUsd < 0.01 ? '< $0,01' : `$${prefill.costUsd.toFixed(2)}`}.</span>}
          </p>
          {prefill.warnings?.map((w) => (
            <p key={w} className="mt-1 flex items-start gap-1 text-warning">
              <Icon name="alert" size={14} className="mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
      <nav aria-label="Fasi">
        <p className="mb-1 text-sm text-muted">
          Fase {phase + 1} di {PHASES.length}
        </p>
        <ol className="flex gap-1 overflow-x-auto text-sm">
          {PHASES.map((p, i) => (
            <li key={p} className="shrink-0">
              <button
                className={`min-h-9 rounded-full px-3 py-1.5 whitespace-nowrap transition ${i === phase ? 'bg-accent text-on-accent' : i < phase || prefill.fromAi ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-muted'}`}
                onClick={() => (i < phase || prefill.fromAi) && setPhase(i as Phase)}
                disabled={i > phase && !prefill.fromAi}
                aria-current={i === phase ? 'step' : undefined}
              >
                {p}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {phase === 0 && <PhaseInfo draft={draft} set={set} isNew={!id && !prefill.recipe} />}
      {phase === 0 && prefill.composed && <p className="text-sm text-muted">Le basi scelte sono già tra gli ingredienti: nella fase Passaggi scrivi il montaggio citandole con i bottoni.</p>}
      {phase === 1 && <PhaseIngredients draft={draft} set={set} recipes={allRecipes ?? []} currentId={base.id} />}
      {phase === 2 && <PhaseSteps draft={draft} set={set} />}
      {prefill.fromAi && (
        // Resta montata anche nelle altre fasi, così la conversazione non si perde.
        <div className={phase === 3 ? '' : 'hidden'}>
          <ImportReviewChat recipe={toRecipe(draft, base)} source={prefill.source} onReplace={(r) => set(fromRecipe(r))} />
        </div>
      )}
      {phase === 3 && <PhaseReview recipe={toRecipe(draft, base)} recipes={allRecipes ?? []} />}

      <div className="flex justify-between gap-3 pt-2">
        <button className="btn-secondary" onClick={() => setPhase((phase - 1) as Phase)} disabled={phase === 0}>
          <Icon name="left" size={16} /> Indietro
        </button>
        {phase < 3 ? (
          <button className="btn-primary" onClick={() => setPhase((phase + 1) as Phase)} disabled={!canNext}>
            Avanti <Icon name="right" size={16} />
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

const DOSING_MODE_HINTS: Record<DosingMode, string> = {
  servings: 'porzioni o persone',
  pans: 'teglie (pizza, focaccia, torte)',
  molds: 'stampi (panettone, pandoro, colomba)',
  pieces: 'pezzi da tot grammi (pizze, panetti)',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

function PhaseInfo({ draft, set, isNew }: { draft: Draft; set: (p: Partial<Draft>) => void; isNew?: boolean }) {
  return (
    <section className="card space-y-3">
      {isNew && (
        <p className="text-sm text-muted">
          Stai unendo ricette che hai già (frolla, crema…)?{' '}
          <Link to="/componi" className="text-accent-text underline-offset-2 hover:underline">
            Componi da basi
          </Link>
        </p>
      )}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dosi per" hint="Come vuoi adattare le quantità">
          <select className="w-full" value={draft.dosingMode} onChange={(e) => set({ dosingMode: e.target.value as DosingMode })}>
            {(Object.keys(DOSING_MODE_LABELS) as DosingMode[]).map((m) => (
              <option key={m} value={m}>
                {DOSING_MODE_HINTS[m]}
              </option>
            ))}
          </select>
        </Field>
        {draft.dosingMode === 'pans' && (
          <Field label="Tipo di impasto" hint="Grammi per cm² se la ricetta non ha una teglia">
            <select className="w-full" value={draft.dough} onChange={(e) => set({ dough: e.target.value as Draft['dough'] })}>
              <option value="">da riconoscere dal titolo</option>
              {(Object.keys(DOUGH_TYPES) as DoughType[]).map((k) => (
                <option key={k} value={k}>
                  {DOUGH_TYPES[k].label}, {DOUGH_TYPES[k].gPerCm2.toLocaleString('it-IT')} g/cm²
                </option>
              ))}
            </select>
          </Field>
        )}
        {draft.dosingMode === 'pieces' && (
          <Field label="Grammi per pezzo" hint="Es. 250 per un panetto da pizza">
            <input className="w-full" type="number" min={1} step="any" value={draft.pieceGrams} onChange={(e) => set({ pieceGrams: e.target.value })} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Teglia (opz.)" hint="Per riscalare cambiando teglia">
          <select className="w-full" value={draft.panShape} onChange={(e) => set({ panShape: e.target.value as Draft['panShape'] })}>
            <option value="">nessuna</option>
            <option value="round">tonda</option>
            <option value="rect">rettangolare</option>
          </select>
        </Field>
        {draft.panShape && (
          <Field label={draft.panShape === 'round' ? 'Diametro, cm' : 'Lato, cm'}>
            <input className="w-full" type="number" min={1} step="any" value={draft.panA} onChange={(e) => set({ panA: e.target.value })} />
          </Field>
        )}
        {draft.panShape === 'rect' && (
          <Field label="Altro lato, cm">
            <input className="w-full" type="number" min={1} step="any" value={draft.panB} onChange={(e) => set({ panB: e.target.value })} />
          </Field>
        )}
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

function PhaseIngredients({ draft, set, recipes, currentId }: { draft: Draft; set: (p: Partial<Draft>) => void; recipes: Recipe[]; currentId: string }) {
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
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const lookup = (rid: string) => byId.get(rid)
  const candidates = recipes.filter((r) => r.id !== currentId && !wouldCycle(lookup, currentId, r.id)).sort((a, b) => a.title.localeCompare(b.title, 'it'))
  const addBase = (rid: string) => {
    const r = byId.get(rid)
    if (!r) return
    const yieldUnit = r.yield?.unit as Unit | undefined
    const unit: Unit = yieldUnit && isMassUnit(yieldUnit) ? 'g' : yieldUnit && isVolumeUnit(yieldUnit) ? 'ml' : ''
    const slug = slugify(r.title) || newId('i')
    const id = draft.ingredients.some((i) => i.id === slug) ? `${slug}-${draft.ingredients.length + 1}` : slug
    set({ ingredients: [...draft.ingredients, { ...emptyIngredient(), id, name: r.title.toLowerCase(), unit, amount: unit ? '' : '1', recipeId: r.id }] })
  }
  const baseHint = (ing: IngredientDraft) => {
    const r = byId.get(ing.recipeId)
    if (!r) return 'La ricetta di questa base non c\'è più.'
    const y = r.yield ? `resa ${r.yield.amount} ${r.yield.unit}` : 'senza resa: si misura a dosi'
    return `Base: «${r.title}», ${y}.`
  }
  const massIngredients = draft.ingredients.filter((i) => i.name.trim() && (i.unit === 'g' || i.unit === 'kg'))

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        Per ogni ingrediente scegli come deve scalare. Il sale e il lievito di solito sono <b>sub-lineari</b>, le uova <b>a pezzi interi</b>.
      </p>
      {draft.ingredients.map((ing, idx) => (
        <div key={ing.id} className="card space-y-2">
          <div className="flex items-center gap-1">
            <input
              className="min-w-0 flex-1"
              placeholder="Nome (es. farina 00)"
              aria-label={`Nome dell'ingrediente ${idx + 1}`}
              value={ing.name}
              autoFocus={!ing.name}
              onChange={(e) => {
                const name = e.target.value
                // l'id segue il nome finché non è stato usato nei passaggi
                const used = draft.steps.some((s) => s.text.includes(`{${ing.id}`))
                update(idx, { name, ...(used ? {} : { id: slugify(name) || ing.id }) })
              }}
            />
            <button className="btn-ghost h-10 w-9 shrink-0 p-0" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Sposta su ${ing.name || 'ingrediente'}`}><Icon name="up" size={16} /></button>
            <button className="btn-ghost h-10 w-9 shrink-0 p-0" onClick={() => move(idx, 1)} disabled={idx === draft.ingredients.length - 1} aria-label={`Sposta giù ${ing.name || 'ingrediente'}`}><Icon name="down" size={16} /></button>
            <button className="btn-ghost h-10 w-9 shrink-0 p-0 text-danger" onClick={() => remove(idx)} aria-label={`Rimuovi ${ing.name || 'ingrediente'}`}><Icon name="close" size={16} /></button>
          </div>
          {ing.recipeId && (
            <p className="inline-flex items-start gap-1 text-xs text-muted">
              <Icon name="book" size={14} className="mt-0.5" /> {baseHint(ing)} In grammi o millilitri serve la resa; a dosi (nessuna unità) vale sempre.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder="Quantità"
              aria-label="Quantità"
              className="min-w-0"
              value={ing.amount}
              disabled={ing.mode === 'toTaste'}
              onChange={(e) => update(idx, { amount: e.target.value })}
            />
            <select className="min-w-0" aria-label="Unità" value={ing.unit} disabled={ing.mode === 'toTaste'} onChange={(e) => update(idx, { unit: e.target.value as Unit })}>
              {UNITS.filter((u) => u !== 'q.b.' && (!ing.recipeId || ['g', 'kg', 'ml', 'l', ''].includes(u))).map((u) => (
                <option key={u} value={u}>
                  {u === '' ? (ing.recipeId ? 'dosi' : '(nessuna: pezzi)') : formatUnit(u, 1)}
                </option>
              ))}
            </select>
            <select
              className="col-span-2 min-w-0"
              aria-label="Regola di scalatura"
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
              <input type="number" inputMode="decimal" step="any" min={0} placeholder="% (es. 65)" aria-label="Percentuale" className="min-w-0" value={ing.percent} onChange={(e) => update(idx, { percent: e.target.value })} />
              <select className="min-w-0" aria-label="Ingrediente di riferimento" value={ing.of} onChange={(e) => update(idx, { of: e.target.value })}>
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
            <input placeholder="Nota (es. a cubetti)" aria-label="Nota" className="min-w-0" value={ing.note} onChange={(e) => update(idx, { note: e.target.value })} />
            <input placeholder="Sezione (es. Impasto)" aria-label="Sezione" className="min-w-0" value={ing.section} onChange={(e) => update(idx, { section: e.target.value })} list="sections" />
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={ing.optional} onChange={(e) => update(idx, { optional: e.target.checked })} />
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
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn-secondary w-full" onClick={add}>
          <Icon name="plus" size={16} /> Aggiungi ingrediente
        </button>
        {candidates.length > 0 && (
          <label className="btn-secondary relative w-full cursor-pointer">
            <Icon name="book" size={16} /> Aggiungi una base
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Aggiungi una base: scegli una ricetta"
              value=""
              onChange={(e) => {
                if (e.target.value) addBase(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Scegli una ricetta…</option>
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.yield ? ` (resa ${r.yield.amount} ${r.yield.unit})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  )
}

function PhaseSteps({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  /** Passaggi in cui i bottoni inseriscono solo il nome dell'ingrediente, senza quantità. */
  const [nameOnly, setNameOnly] = useState<Set<string>>(new Set())
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
      <p className="text-sm text-muted">
        Scrivi il passaggio e <b>inserisci gli ingredienti con i bottoni</b>: la quantità comparirà già riscalata quando cucini. Per citare un ingrediente senza la dose (ad esempio "aggiungi il resto del pecorino") attiva "solo il nome".
      </p>
      {draft.steps.map((step, idx) => (
        <div key={step.id} className="card space-y-2">
          <div className="flex items-center gap-1">
            <h3 className="qty flex-1 text-base font-semibold text-fg">Passo {idx + 1}</h3>
            <button className="btn-ghost h-10 w-9 p-0" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Sposta su il passo ${idx + 1}`}><Icon name="up" size={16} /></button>
            <button className="btn-ghost h-10 w-9 p-0" onClick={() => move(idx, 1)} disabled={idx === draft.steps.length - 1} aria-label={`Sposta giù il passo ${idx + 1}`}><Icon name="down" size={16} /></button>
            <button className="btn-ghost h-10 w-9 p-0 text-danger" onClick={() => remove(idx)} aria-label={`Rimuovi il passo ${idx + 1}`}><Icon name="close" size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="min-w-0 py-1.5 text-sm" aria-label="Tipo di passaggio" value={step.type} onChange={(e) => update(idx, { type: e.target.value as StepType | '' })}>
              <option value="">Tipo di passaggio</option>
              {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map((t) => (
                <option key={t} value={t}>
                  {STEP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input className="min-w-0 py-1.5 text-sm" placeholder="Sezione (es. Crema)" aria-label="Sezione" value={step.section} onChange={(e) => update(idx, { section: e.target.value })} list="sections" />
          </div>
          <textarea
            ref={(el) => {
              textareas.current[step.id] = el
            }}
            className="w-full"
            rows={3}
            placeholder="Es. Sciogli {lievito} in {acqua} tiepida…"
            aria-label={`Testo del passo ${idx + 1}`}
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
          {ingredients.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Inserisci un ingrediente nel passo ${idx + 1}`}>
              {ingredients.map((i) => (
                <button
                  key={i.id}
                  className={`chip-button ${nameOnly.has(step.id) ? 'bg-surface-2 text-fg' : ''}`}
                  onClick={() => insertRef(idx, i.id, nameOnly.has(step.id))}
                  title={nameOnly.has(step.id) ? 'Inserisce solo il nome' : 'Inserisce nome e quantità'}
                >
                  {i.name}
                </button>
              ))}
              <label className="ml-auto inline-flex min-h-8 items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={nameOnly.has(step.id)}
                  onChange={(e) => {
                    const next = new Set(nameOnly)
                    if (e.target.checked) next.add(step.id)
                    else next.delete(step.id)
                    setNameOnly(next)
                  }}
                />
                solo il nome
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input type="number" inputMode="numeric" min={0} className="min-w-0" placeholder="Durata (min)" aria-label="Durata in minuti" value={step.durationMin} onChange={(e) => update(idx, { durationMin: e.target.value })} />
            <input type="number" inputMode="numeric" min={0} className="min-w-0" placeholder="°C" aria-label="Temperatura in gradi" value={step.temperatureC} onChange={(e) => update(idx, { temperatureC: e.target.value })} />
            <input type="number" inputMode="numeric" min={0} className="min-w-0" placeholder="Timer (min)" aria-label="Timer in minuti" value={step.timerMinutes} onChange={(e) => update(idx, { timerMinutes: e.target.value })} />
            <input className="min-w-0" placeholder="Nome timer" aria-label="Nome del timer" value={step.timerLabel} onChange={(e) => update(idx, { timerLabel: e.target.value })} />
            <input className="min-w-0" placeholder="Attrezzatura" aria-label="Attrezzatura" value={step.equipment} onChange={(e) => update(idx, { equipment: e.target.value })} />
          </div>
          {draft.steps.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1"><Icon name="parallel" size={14} /> Si può fare durante</span>
              <select className="min-w-0 py-1.5 text-sm" value={step.parallelWith} onChange={(e) => update(idx, { parallelWith: e.target.value })}>
                <option value="">nessun altro passaggio</option>
                {draft.steps.map((o, k) =>
                  o.id === step.id ? null : (
                    <option key={o.id} value={o.id}>
                      passo {k + 1}{o.timerMinutes ? ` (timer ${o.timerMinutes} min)` : ''}{o.type ? `, ${STEP_TYPE_LABELS[o.type]}` : ''}
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
        <Icon name="plus" size={16} /> Aggiungi passaggio
      </button>
      {unused.length > 0 && draft.steps.length > 0 && (
        <p className="text-xs text-warning">Ingredienti non ancora citati in nessun passaggio: {unused.map((i) => i.name).join(', ')}.</p>
      )}
    </section>
  )
}

function PhaseReview({ recipe, recipes }: { recipe: Recipe; recipes: Recipe[] }) {
  const scaled = useMemo(() => scaleRecipe(recipe, 1), [recipe])
  const doubled = useMemo(() => scaleRecipe(recipe, 2), [recipe])
  const problems = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]))
    return checkRecipe(recipe, (rid) => byId.get(rid))
  }, [recipe, recipes])
  return (
    <section className="space-y-3">
      {problems.length > 0 && (
        <div className="notice space-y-1 bg-warning-soft text-warning">
          <p className="font-medium">Controllo della ricetta: {problems.length === 1 ? 'un consiglio' : `${problems.length} consigli`}. Puoi salvare lo stesso.</p>
          {problems.map((p) => (
            <p key={p} className="flex items-start gap-1">
              <Icon name="alert" size={14} className="mt-0.5" /> {p}
            </p>
          ))}
        </div>
      )}
      <div>
        <h2 className="text-2xl font-medium text-fg">{recipe.title || 'Senza titolo'}</h2>
        <p className="text-sm text-muted">
          {recipe.servings} porzioni, {recipe.ingredients.length} ingredienti, {recipe.steps.length} passaggi, dosi a {DOSING_MODE_LABELS[dosingOf(recipe).mode].toLowerCase()}
          {recipe.pan ? `, teglia ${formatPan(recipe.pan)}` : ''}.
        </p>
      </div>
      <section className="rule pt-3">
        <h3 className="section-title text-lg">Prova di scalatura ×2</h3>
        <p className="mb-2 text-xs text-muted">Controlla che le regole scelte diano quantità sensate.</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-1 text-left font-normal">
                Ingrediente
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                ×1
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                ×2
              </th>
            </tr>
          </thead>
          <tbody>
            {scaled.ingredients.map((i) => {
              const d = doubled.byId.get(i.id)
              return (
                <tr key={i.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2">
                    {i.name}
                    <span className="block text-xs text-muted">{SCALING_MODE_LABELS[i.scaling?.mode ?? 'linear']}</span>
                  </td>
                  <td className="qty py-1.5 pl-2 text-right text-muted">{i.scaled ? formatQuantity(i.scaled) : '—'}</td>
                  <td className="qty py-1.5 pl-3 text-right font-semibold">{d?.scaled ? formatQuantity(d.scaled) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <section className="rule space-y-2 pt-3">
        <h3 className="section-title text-lg">Passaggi</h3>
        <ol className="space-y-2 text-sm">
          {recipe.steps.map((s, i) => (
            <li key={s.id} className="flex gap-2">
              <span className="qty w-5 shrink-0 text-right text-muted">{i + 1}</span>
              <StepText step={s} scaled={scaled} as="span" className="min-w-0 flex-1" />
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
