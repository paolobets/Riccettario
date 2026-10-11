import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { defaultSplitSelection, formatIngredientLine, newId, renderStepPlain, scaleRecipe, splitRecipe } from '@/core'
import Icon from '../components/Icon'
import NotFound from './NotFound'

/** "Scomponi": stacca una parte della ricetta (la crema, la frolla) in una ricetta a sé, collegata. */
export default function SplitPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const recipe = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const [title, setTitle] = useState('')
  const [ingredientIds, setIngredientIds] = useState<Set<string>>(new Set())
  const [stepIds, setStepIds] = useState<Set<string>>(new Set())
  const [section, setSection] = useState<string | null>(params.get('sezione'))
  const [busy, setBusy] = useState(false)
  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, 1) : null), [recipe])

  useEffect(() => {
    if (!recipe || !section) return
    const sel = defaultSplitSelection(recipe, section)
    setIngredientIds(new Set(sel.ingredientIds))
    setStepIds(new Set(sel.stepIds))
    setTitle((t) => t || `${section} del ${recipe.title.toLowerCase()}`)
  }, [recipe, section])

  if (recipe === undefined) return null
  if (recipe === null || !scaled) return <NotFound what="ricetta" />
  const sections = recipe.sections ?? [...new Set(recipe.ingredients.map((i) => i.section).filter((s): s is string => Boolean(s)))]
  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }
  const remaining = recipe.ingredients.length - ingredientIds.size
  const canSave = ingredientIds.size > 0 && remaining > 0 && title.trim().length > 0

  const save = async () => {
    setBusy(true)
    const { base, parent } = splitRecipe(recipe, { ingredientIds: [...ingredientIds], stepIds: [...stepIds], title, baseId: newId('r') })
    await saveRecipe(base)
    await saveRecipe(parent)
    navigate(`/ricetta/${parent.id}`, { replace: true })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Scomponi «{recipe.title}»</h1>
      <p className="text-sm text-muted">Scegli cosa diventa una ricetta a sé. Nella ricetta resta una riga "1 dose di …" collegata, e i passaggi rimasti la citano per nome. Potrai poi dare alla base una resa in grammi per usarla anche a peso.</p>
      {sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Parti dalla sezione">
          <span className="text-sm text-muted">Parti dalla sezione</span>
          {sections.map((s) => (
            <button key={s} className={`chip-button ${section === s ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`} aria-pressed={section === s} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg-2">Nome della nuova base</span>
        <input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crema al mascarpone" />
      </label>
      <section className="space-y-1">
        <h2 className="section-title text-lg">Ingredienti da staccare</h2>
        <ul className="divide-y divide-line">
          {scaled.ingredients.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                <input type="checkbox" className="h-5 w-5 accent-accent" checked={ingredientIds.has(i.id)} onChange={() => setIngredientIds(flip(ingredientIds, i.id))} />
                <span className="min-w-0 flex-1 text-fg">
                  {formatIngredientLine(i.name, i.scaled, Boolean(i.recipeId))}
                  {i.section && <span className="text-xs text-muted"> ({i.section})</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <h2 className="section-title text-lg">Passaggi che vanno con la base</h2>
        <ul className="divide-y divide-line">
          {recipe.steps.map((s, idx) => (
            <li key={s.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-accent" checked={stepIds.has(s.id)} onChange={() => setStepIds(flip(stepIds, s.id))} />
                <span className="min-w-0 flex-1 text-sm text-fg-2">
                  <span className="qty font-semibold text-fg">{idx + 1}.</span> {renderStepPlain(s, scaled)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      {remaining === 0 && ingredientIds.size > 0 && (
        <p className="notice flex items-start gap-2 bg-warning-soft text-warning">
          <Icon name="alert" size={16} className="mt-0.5" /> <span>Lascia almeno un ingrediente nella ricetta madre, altrimenti non c'è nulla da scomporre.</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!canSave || busy} onClick={save}>
          <Icon name="book" size={16} /> Crea la base e aggiorna la ricetta
        </button>
        <Link to={`/ricetta/${recipe.id}`} className="btn-secondary">
          Annulla
        </Link>
      </div>
    </div>
  )
}
