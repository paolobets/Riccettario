import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { deleteRecipe, duplicateRecipe } from '@/data/repo'
import { activeDuration, formatDuration, STEP_TYPE_LABELS, totalDuration, type Step } from '@/core'
import { useScaler } from '../hooks/useScaler'
import ScalerPanel from '../components/ScalerPanel'
import IngredientList from '../components/IngredientList'
import StepText from '../components/StepText'
import TimerButton from '../components/TimerButton'
import AiPanel from '../components/AiPanel'
import Icon from '../components/Icon'

function groupSteps(steps: Step[]): Array<[string | undefined, Step[]]> {
  const map = new Map<string | undefined, Step[]>()
  for (const s of steps) {
    const list = map.get(s.section) ?? []
    list.push(s)
    map.set(s.section, list)
  }
  return [...map.entries()]
}

export default function RecipeView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipe = useLiveQuery(() => (id ? db.recipes.get(id) : undefined), [id])
  const sessions = useLiveQuery(() => (id ? db.sessions.where('recipeId').equals(id).reverse().sortBy('startedAt') : []), [id])
  const scaler = useScaler(recipe)

  if (recipe === undefined) return null
  if (recipe === null || !scaler.scaled) {
    return (
      <div className="card text-center">
        <p>Ricetta non trovata.</p>
        <Link to="/" className="btn-ghost mt-2">
          Torna all'elenco
        </Link>
      </div>
    )
  }
  const scaled = scaler.scaled
  const total = totalDuration(recipe.steps)
  const active = activeDuration(recipe.steps)
  let stepNumber = 0

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-fg">{recipe.title}</h1>
          <div className="flex shrink-0 gap-1">
            <Link to={`/ricetta/${recipe.id}/modifica`} className="btn-ghost px-2 py-1 text-sm" aria-label="Modifica">
              <Icon name="edit" size={16} />
              <span className="hidden sm:inline">Modifica</span>
            </Link>
            <button
              className="btn-ghost px-2 py-1 text-sm"
              onClick={async () => {
                const copy = await duplicateRecipe(recipe)
                navigate(`/ricetta/${copy.id}/modifica`)
              }}
            >
              <Icon name="copy" size={16} />
              <span className="hidden sm:inline">Duplica</span>
            </button>
            <button
              className="btn-ghost px-2 py-1 text-sm text-danger"
              aria-label="Elimina"
              onClick={async () => {
                if (confirm(`Eliminare "${recipe.title}"?`)) {
                  await deleteRecipe(recipe.id)
                  navigate('/')
                }
              }}
            >
              <Icon name="trash" size={16} />
              <span className="hidden sm:inline">Elimina</span>
            </button>
          </div>
        </div>
        {recipe.description && <p className="text-fg-2">{recipe.description}</p>}
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {total > 0 && <span>Totale {formatDuration(total)}</span>}
          {active > 0 && active !== total && <span>· attivo {formatDuration(active)}</span>}
          {recipe.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </header>

      <Link to={`/ricetta/${recipe.id}/cucina${scaler.search ? `?${scaler.search}` : ''}`} className="btn-primary w-full py-3 text-lg">
        <Icon name="chef" size={22} /> Cucina passo per passo
      </Link>

      <ScalerPanel
        recipe={recipe}
        scaled={scaled}
        onServings={scaler.setServings}
        onYield={scaler.setYield}
        onFactor={scaler.setFactor}
        onReset={scaler.reset}
      />

      <AiPanel recipe={recipe} factor={scaled.factor} />

      <section className="card">
        <h2 className="label-caps mb-2">Ingredienti</h2>
        <IngredientList scaled={scaled} onPivot={scaler.setPivot} />
      </section>

      <section className="card">
        <h2 className="label-caps mb-3">Preparazione</h2>
        <div className="space-y-5">
          {groupSteps(recipe.steps).map(([section, steps]) => (
            <div key={section ?? '_'}>
              {section && <h3 className="mb-2 text-sm font-semibold text-accent-text">{section}</h3>}
              <ol className="space-y-4">
                {steps.map((step) => {
                  stepNumber += 1
                  return (
                    <li key={step.id} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">{stepNumber}</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <StepText step={step} scaled={scaled} className="leading-relaxed" />
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          {step.type && <span className="chip">{STEP_TYPE_LABELS[step.type]}</span>}
                          {step.durationMin && <span>{formatDuration(step.durationMin)}</span>}
                          {step.temperatureC && <span>{step.temperatureC} °C</span>}
                          {step.equipment?.map((e) => (
                            <span key={e} className="inline-flex items-center gap-1">
                              <Icon name="pan" size={13} /> {e}
                            </span>
                          ))}
                          {step.timer && <TimerButton recipeId={recipe.id} stepId={step.id} timer={step.timer} />}
                          {step.parallelWith && (
                            <span className="chip bg-info-soft text-info">
                              <Icon name="parallel" size={12} /> durante il passo {recipe.steps.findIndex((s) => s.id === step.parallelWith) + 1}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {recipe.notes && (
        <section className="card">
          <h2 className="label-caps mb-1">Note</h2>
          <p className="whitespace-pre-wrap text-fg-2">{recipe.notes}</p>
        </section>
      )}

      {sessions && sessions.length > 0 && (
        <section className="card">
          <h2 className="label-caps mb-2">Diario di cottura</h2>
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="border-l-2 border-line pl-3">
                <div className="text-muted">
                  {new Date(s.startedAt).toLocaleDateString('it-IT')} · ×{Math.round(s.factor * 100) / 100}
                  {s.rating ? ` · ${'★'.repeat(s.rating)}${'☆'.repeat(5 - s.rating)}` : ''}
                </div>
                {s.notes && <p>{s.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
