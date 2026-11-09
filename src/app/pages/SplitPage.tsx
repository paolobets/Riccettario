import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { defaultSelection, formatIngredientLine, newId, renderStepPlain, saveSelectionAsBase, scaleRecipe } from '@/core'
import Icon from '../components/Icon'
import NotFound from './NotFound'

/**
 * "Salva come Base": una scelta di ingredienti e passaggi (la crema, la frolla,
 * anche sparsi nella ricetta) diventa una Base nuova. Nella ricetta restano,
 * raccolti in una sezione col nome della Base e segnati come presi da lei.
 */
export default function SplitPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const recipe = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const titles = useLiveQuery(async () => (await db.recipes.toArray()).map((r) => r.title.trim().toLowerCase()), [])
  const [title, setTitle] = useState('')
  const [ingredientIds, setIngredientIds] = useState<Set<string>>(new Set())
  const [stepIds, setStepIds] = useState<Set<string>>(new Set())
  const [section, setSection] = useState<string | null>(params.get('sezione'))
  const [busy, setBusy] = useState(false)
  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, 1) : null), [recipe])

  useEffect(() => {
    if (!recipe || !section) return
    const sel = defaultSelection(recipe, section)
    setIngredientIds(new Set(sel.ingredientIds))
    setStepIds(new Set(sel.stepIds))
    setTitle((t) => t || section)
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
  const canSave = ingredientIds.size > 0 && title.trim().length > 0
  const sameTitle = Boolean(title.trim()) && (titles ?? []).includes(title.trim().toLowerCase())

  const save = async () => {
    setBusy(true)
    const saved = saveSelectionAsBase(recipe, { ingredientIds: [...ingredientIds], stepIds: [...stepIds], title, baseId: newId('r') })
    await saveRecipe(saved.base)
    await saveRecipe(saved.recipe)
    navigate(`/ricetta/${saved.base.id}`, { replace: true })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Salva come Base</h1>
      <p className="text-sm text-muted">Da «{recipe.title}» scegli gli ingredienti e i passaggi che diventano una Base nuova, da copiare poi in altre ricette. Qui restano come sono, raccolti in una sezione col nome della Base.</p>
      {sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scegli tutta una sezione">
          <span className="text-sm text-muted">Scegli tutta una sezione</span>
          {sections.map((s) => (
            <button key={s} className={`chip-button ${section === s ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`} aria-pressed={section === s} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg-2">Nome della Base</span>
        <input
          className="w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Crema al mascarpone"
          aria-describedby={sameTitle ? 'same-title' : undefined}
        />
      </label>
      {sameTitle && (
        <p id="same-title" className="text-sm text-warning">
          C'è già una ricetta che si chiama «{title.trim()}»: dai un nome diverso, così le distingui.
        </p>
      )}
      <section className="space-y-1">
        <h2 className="section-title text-lg">Ingredienti della Base</h2>
        <ul className="divide-y divide-line">
          {scaled.ingredients.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                <input type="checkbox" className="h-5 w-5 accent-accent" checked={ingredientIds.has(i.id)} onChange={() => setIngredientIds(flip(ingredientIds, i.id))} />
                <span className="min-w-0 flex-1 text-fg">
                  {formatIngredientLine(i.name, i.scaled)}
                  {i.section && <span className="text-xs text-muted"> ({i.section})</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <h2 className="section-title text-lg">Passaggi della Base</h2>
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
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!canSave || busy} onClick={save}>
          <Icon name="book" size={16} /> {busy ? 'Salvo…' : 'Salva come Base'}
        </button>
        <Link to={`/ricetta/${recipe.id}`} className="btn-secondary">
          Annulla
        </Link>
      </div>
    </div>
  )
}
