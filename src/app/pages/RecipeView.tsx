import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { deleteRecipe, duplicateRecipe } from '@/data/repo'
import { activeDuration, formatDuration, STEP_TYPE_LABELS, totalDuration } from '@/core'
import { useScaler } from '../hooks/useScaler'
import ScalerPanel from '../components/ScalerPanel'
import IngredientList from '../components/IngredientList'
import StepText from '../components/StepText'
import TimerButton from '../components/TimerButton'
import AiPanel from '../components/AiPanel'
import Icon from '../components/Icon'
import NotFound from './NotFound'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" role="img" aria-label={`${rating} stelle su 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={14} fill={n <= rating ? 'currentColor' : 'none'} />
      ))}
    </span>
  )
}

export default function RecipeView() {
  const { id } = useParams()
  const navigate = useNavigate()
  // `undefined` mentre carica, `null` se la ricetta non esiste: così la pagina non resta vuota.
  const recipe = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const sessions = useLiveQuery(
    () => (id ? db.sessions.where('recipeId').equals(id).filter((s) => Boolean(s.finishedAt)).reverse().sortBy('startedAt') : []),
    [id],
  )
  const scaler = useScaler(recipe ?? undefined)

  if (recipe === undefined) return null
  if (recipe === null || !scaler.scaled) return <NotFound what="ricetta" />
  const scaled = scaler.scaled
  const total = totalDuration(recipe.steps)
  const active = activeDuration(recipe.steps)
  const cookLink = `/ricetta/${recipe.id}/cucina${scaler.search ? `?${scaler.search}` : ''}`

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-4xl font-medium leading-tight text-fg">{recipe.title}</h1>
          <div className="flex shrink-0 gap-1">
            <Link to={`/ricetta/${recipe.id}/modifica`} className="btn-ghost min-h-10 px-2 py-1.5 text-sm" aria-label="Modifica">
              <Icon name="edit" size={16} />
              <span className="hidden sm:inline">Modifica</span>
            </Link>
            <button
              className="btn-ghost min-h-10 px-2 py-1.5 text-sm"
              aria-label="Duplica"
              onClick={async () => {
                const copy = await duplicateRecipe(recipe)
                navigate(`/ricetta/${copy.id}/modifica`)
              }}
            >
              <Icon name="copy" size={16} />
              <span className="hidden sm:inline">Duplica</span>
            </button>
            <button
              className="btn-ghost min-h-10 px-2 py-1.5 text-sm text-danger"
              aria-label="Elimina"
              onClick={async () => {
                if (confirm(`Eliminare "${recipe.title}"? Spariscono anche diario e conversazioni; non si può annullare.`)) {
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
        {recipe.description && <p className="text-lg text-fg-2">{recipe.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {total > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="timer" size={14} />
              <span>
                {formatDuration(total)}
                {active > 0 && active !== total ? `, di cui ${formatDuration(active)} ai fornelli` : ''}
              </span>
            </span>
          )}
          {recipe.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </header>

      <Link to={cookLink} className="btn-primary w-full py-3 text-lg">
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

      <section className="rule pt-4">
        <h2 className="section-title mb-2">Ingredienti</h2>
        <IngredientList scaled={scaled} onPivot={scaler.setPivot} />
      </section>

      <section className="rule pt-4">
        <h2 className="section-title mb-3">Preparazione</h2>
        <ol className="space-y-4">
          {recipe.steps.map((step, index) => {
            // Il titolo di sezione compare quando cambia, senza riordinare i passaggi.
            const newSection = step.section && step.section !== recipe.steps[index - 1]?.section
            return (
              <li key={step.id} className="space-y-2">
                {newSection && <h3 className={`text-sm font-semibold text-accent-text ${index > 0 ? 'pt-2' : ''}`}>{step.section}</h3>}
                <div className="flex gap-3">
                  <span className="qty flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <StepText step={step} scaled={scaled} className="text-[17px] leading-relaxed" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      {step.type && step.type !== 'prep' && <span className="chip">{STEP_TYPE_LABELS[step.type]}</span>}
                      {step.durationMin && !step.timer && <span>{formatDuration(step.durationMin)}</span>}
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
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {recipe.notes && (
        <section className="rule pt-4">
          <h2 className="section-title mb-1">Note</h2>
          <p className="whitespace-pre-wrap text-fg-2">{recipe.notes}</p>
        </section>
      )}

      {sessions && sessions.length > 0 && (
        <section className="rule pt-4">
          <h2 className="section-title mb-2">Diario di cottura</h2>
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="border-l-2 border-line pl-3">
                <div className="flex flex-wrap items-center gap-2 text-muted">
                  <span>{new Date(s.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span className="chip">×{Math.round(s.factor * 100) / 100}</span>
                  {s.rating ? <Stars rating={s.rating} /> : null}
                </div>
                {s.notes && <p className="text-fg">{s.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
