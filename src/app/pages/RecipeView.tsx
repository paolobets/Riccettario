import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { addToShoppingList, deleteRecipe, duplicateRecipe, saveRecipe, toggleFavorite } from '@/data/repo'
import { activeDuration, encodeRecipeForLink, formatDuration, formatPan, recipeToText, STEP_TYPE_LABELS, totalDuration } from '@/core'
import { clearCookState, loadCookState, type CookState } from '../cook/state'
import { useScaler } from '../hooks/useScaler'
import ScalerPanel from '../components/ScalerPanel'
import IngredientList from '../components/IngredientList'
import StepText from '../components/StepText'
import TimerButton from '../components/TimerButton'
import AiPanel from '../components/AiPanel'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
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
  const { confirm, dialog } = useConfirm()
  /** Testo della nota in modifica; `null` quando non si sta modificando. */
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [cook, setCook] = useState<CookState | null>(() => (id ? loadCookState(id) : null))
  const [message, setMessage] = useState<string | null>(null)

  if (recipe === undefined) return null
  if (recipe === null || !scaler.scaled) return <NotFound what="ricetta" />
  const scaled = scaler.scaled
  const total = totalDuration(recipe.steps)
  const active = activeDuration(recipe.steps)
  const cookLink = `/ricetta/${recipe.id}/cucina${scaler.search ? `?${scaler.search}` : ''}`
  const resumeLink = cook?.step !== undefined ? `${cookLink}${scaler.search ? '&' : '?'}passo=${cook.step + 1}` : null

  const share = async () => {
    const text = recipeToText(scaled)
    const url = `${window.location.origin}${import.meta.env.BASE_URL}condivisa#r=${encodeRecipeForLink(recipe)}`
    try {
      if (navigator.share && /Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ title: recipe.title, text, url })
        return
      }
      await navigator.clipboard.writeText(`${text}\n\nApri nel Ricettario: ${url}`)
      setMessage('Ricetta copiata con il link: incollala in un messaggio.')
    } catch {
      setMessage('Non sono riuscito a condividere: prova con Stampa o copia il testo a mano.')
    }
  }

  const saveNotes = async () => {
    if (notesDraft === null) return
    const notes = notesDraft.trim() || undefined
    if (notes !== recipe.notes) await saveRecipe({ ...recipe, notes })
    setNotesDraft(null)
  }

  return (
    <article className="space-y-5">
      {dialog}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="min-w-0 flex-1 basis-36 text-4xl font-medium leading-tight text-fg">{recipe.title}</h1>
          <div className="flex shrink-0 gap-1 print:hidden">
            <button
              className={`btn-ghost min-h-10 min-w-10 px-2 py-1.5 text-sm ${recipe.favorite ? 'text-warning' : ''}`}
              aria-label={recipe.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
              aria-pressed={Boolean(recipe.favorite)}
              onClick={() => toggleFavorite(recipe)}
            >
              <Icon name="star" size={18} fill={recipe.favorite ? 'currentColor' : 'none'} />
            </button>
            <Link to={`/ricetta/${recipe.id}/modifica`} className="btn-ghost min-h-10 min-w-10 px-2 py-1.5 text-sm" aria-label="Modifica">
              <Icon name="edit" size={16} />
              <span className="hidden sm:inline">Modifica</span>
            </Link>
            <button
              className="btn-ghost min-h-10 min-w-10 px-2 py-1.5 text-sm"
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
              className="btn-ghost min-h-10 min-w-10 px-2 py-1.5 text-sm text-danger"
              aria-label="Elimina"
              onClick={async () => {
                const ok = await confirm({
                  title: `Eliminare «${recipe.title}»?`,
                  body: 'Spariscono anche il diario di cottura e le conversazioni. Non si può annullare.',
                  confirmLabel: 'Elimina ricetta',
                  cancelLabel: 'Tieni',
                  danger: true,
                })
                if (ok) {
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
          {recipe.pan && (
            <span className="inline-flex items-center gap-1">
              <Icon name="pan" size={14} /> teglia {formatPan(recipe.pan)}
            </span>
          )}
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

      {resumeLink ? (
        <div className="flex gap-2 print:hidden">
          <Link to={resumeLink} className="btn-primary min-w-0 flex-1 py-3 text-lg">
            <Icon name="play" size={22} /> Riprendi dal passo {cook!.step! + 1}
          </Link>
          <button
            className="btn-secondary shrink-0 py-3"
            onClick={() => {
              clearCookState(recipe.id)
              setCook(null)
            }}
          >
            Ricomincia
          </button>
        </div>
      ) : (
        <Link to={cookLink} className="btn-primary w-full py-3 text-lg print:hidden">
          <Icon name="chef" size={22} /> Cucina passo per passo
        </Link>
      )}
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          className="btn-secondary min-h-10 px-3 py-1.5 text-sm"
          onClick={async () => {
            await addToShoppingList(recipe.id, scaled.factor)
            setMessage(`Aggiunta alla lista della spesa per ${scaled.servings.toLocaleString('it-IT', { maximumFractionDigits: 1 })} porzioni.`)
          }}
        >
          <Icon name="cart" size={16} /> Aggiungi alla spesa
        </button>
        <button className="btn-secondary min-h-10 px-3 py-1.5 text-sm" onClick={share}>
          <Icon name="share" size={16} /> Condividi
        </button>
        <button className="btn-secondary min-h-10 px-3 py-1.5 text-sm" onClick={() => window.print()}>
          <Icon name="printer" size={16} /> Stampa
        </button>
      </div>
      {message && (
        <p className="text-sm text-fg-2 print:hidden" role="status">
          {message}{message.startsWith('Aggiunta') && (
            <>
              {' '}
              <Link to="/spesa" className="text-accent-text underline-offset-2 hover:underline">
                Apri la lista
              </Link>
            </>
          )}
        </p>
      )}

      <div className="print:hidden">
      <ScalerPanel
        recipe={recipe}
        scaled={scaled}
        onServings={scaler.setServings}
        onYield={scaler.setYield}
        onFactor={scaler.setFactor}
        onReset={scaler.reset}
      />
      </div>

      <div className="print:hidden">
        <AiPanel recipe={recipe} factor={scaled.factor} />
      </div>

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

      <section className="rule pt-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="section-title">Note</h2>
          {notesDraft === null && (
            <button className="btn-ghost min-h-9 px-2 py-1 text-sm print:hidden" onClick={() => setNotesDraft(recipe.notes ?? '')}>
              <Icon name="edit" size={16} /> {recipe.notes ? 'Modifica' : 'Aggiungi una nota'}
            </button>
          )}
        </div>
        {notesDraft === null ? (
          recipe.notes ? (
            <p className="whitespace-pre-wrap text-fg-2">{recipe.notes}</p>
          ) : (
            <p className="text-sm text-muted">Trucchi, sostituzioni, cosa fare diversamente la prossima volta. Restano con la ricetta.</p>
          )
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              saveNotes()
            }}
          >
            <textarea
              autoFocus
              className="w-full"
              rows={4}
              aria-label="Note sulla ricetta"
              placeholder="Es. con farina più forte si può salire al 70% di idratazione"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">
                Salva nota
              </button>
              <button type="button" className="btn-secondary" onClick={() => setNotesDraft(null)}>
                Annulla
              </button>
            </div>
          </form>
        )}
      </section>

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
