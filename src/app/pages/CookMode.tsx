import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { finishSession, startSession } from '@/data/repo'
import { formatDuration, formatFactor, ingredientIdsInStep, parallelStepsFor, renderStepPlain, STEP_TYPE_LABELS } from '@/core'
import { useScaler } from '../hooks/useScaler'
import IngredientList from '../components/IngredientList'
import StepText from '../components/StepText'
import TimerButton from '../components/TimerButton'
import TimerBar from '../components/TimerBar'
import CookAssistant from '../components/CookAssistant'
import Icon from '../components/Icon'

/** Tiene lo schermo acceso finché la pagina è aperta (dove il browser lo permette). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // non supportato o negato
      }
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => undefined)
    }
  }, [])
}

export default function CookMode() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipe = useLiveQuery(() => (id ? db.recipes.get(id) : undefined), [id])
  const scaler = useScaler(recipe)
  // -1 = mise en place, steps.length = fine
  const [index, setIndex] = useState(-1)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  useWakeLock()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'ArrowRight' || e.key === ' ') setIndex((i) => Math.min(i + 1, recipe?.steps.length ?? 0))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recipe])

  const scaled = scaler.scaled
  const step = recipe && index >= 0 ? recipe.steps[index] : undefined
  const parallel = useMemo(() => (recipe && step ? parallelStepsFor(recipe.steps, step.id) : []), [recipe, step])
  const parallelParentIndex = step?.parallelWith ? (recipe?.steps.findIndex((s) => s.id === step.parallelWith) ?? -1) : -1
  const stepIngredients = useMemo(() => {
    if (!step || !scaled) return []
    return ingredientIdsInStep(step)
      .map((iid) => scaled.byId.get(iid))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  }, [step, scaled])

  if (!recipe || !scaled) return null
  const total = recipe.steps.length
  const isEnd = index >= total
  const progress = Math.max(0, Math.min(1, (index + 1) / (total + 1)))

  const begin = async () => {
    if (!sessionId) {
      const s = await startSession(recipe.id, scaler.factor)
      setSessionId(s.id)
    }
    setIndex(0)
  }

  const finish = async () => {
    if (sessionId) await finishSession(sessionId, { rating: rating || undefined, notes: notes.trim() || undefined })
    navigate(`/ricetta/${recipe.id}`)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link to={`/ricetta/${recipe.id}${scaler.search ? `?${scaler.search}` : ''}`} className="btn-ghost px-2 py-1 text-sm">
          <Icon name="close" size={16} /> Esci
        </Link>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-accent-text">{recipe.title}</div>
        <span className="chip">
          {Math.round(scaled.servings * 100) / 100} porzioni{Math.abs(scaled.factor - 1) > 1e-9 ? `, ${formatFactor(scaled.factor)}` : ''}
        </span>
      </header>
      <div className="h-1 w-full bg-surface-3">
        <div className="h-1 bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <TimerBar
        recipeId={recipe.id}
        onSelect={(t) => {
          const i = recipe.steps.findIndex((s) => s.id === t.stepId)
          if (i >= 0) setIndex(i)
        }}
      />

      <main className="flex flex-1 flex-col px-5 py-6">
        {index < 0 && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold text-fg">Prima di iniziare</h1>
            <p className="text-fg-2">Pesa e prepara tutto. Spunta man mano.</p>
            {scaled.warnings.map((w) => (
              <p key={w} className="notice flex items-start gap-2 bg-warning-soft text-warning">
                <Icon name="alert" size={16} className="mt-0.5" /> <span>{w}</span>
              </p>
            ))}
            <div className="card">
              <IngredientList scaled={scaled} checkable />
            </div>
            {recipe.steps.some((s) => s.equipment?.length) && (
              <div className="card">
                <h2 className="section-title mb-1 text-lg">Attrezzatura</h2>
                <ul className="list-inside list-disc text-fg-2">
                  {[...new Set(recipe.steps.flatMap((s) => s.equipment ?? []))].map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {step && (
          <section className="flex flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="font-semibold text-accent-text">
                Passo {index + 1} di {total}
              </span>
              {step.section && <span>{step.section}</span>}
              {step.type && <span className="chip">{STEP_TYPE_LABELS[step.type]}</span>}
              {step.durationMin && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="timer" size={13} /> {formatDuration(step.durationMin)}
                </span>
              )}
              {step.temperatureC && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="flame" size={13} /> {step.temperatureC} °C
                </span>
              )}
            </div>
            <StepText step={step} scaled={scaled} className="font-display text-[26px] leading-snug font-normal sm:text-3xl" />
            {step.equipment && step.equipment.length > 0 && (
              <p className="inline-flex items-center gap-2 text-muted">
                <Icon name="pan" size={16} /> {step.equipment.join(', ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {step.timer && <TimerButton recipeId={recipe.id} stepId={step.id} timer={step.timer} size="lg" />}
              <CookAssistant recipe={recipe} factor={scaled.factor} stepContext={`passo ${index + 1} di ${total}: ${renderStepPlain(step, scaled)}`} />
            </div>
            {parallelParentIndex >= 0 && (
              <button className="w-fit rounded-lg bg-info-soft px-3 py-2 text-left text-sm text-info" onClick={() => setIndex(parallelParentIndex)}>
                <Icon name="parallel" size={14} className="mr-1 inline" /> Da fare durante il passo {parallelParentIndex + 1}. Tocca per tornarci.
              </button>
            )}
            {parallel.length > 0 && (
              <div className="rounded-xl border border-line bg-info-soft p-3">
                <h2 className="section-title mb-1 text-lg text-info">Nel frattempo puoi</h2>
                <ul className="space-y-1">
                  {parallel.map(({ step: p, index: i }) => (
                    <li key={p.id}>
                      <button className="w-full rounded-lg px-2 py-1 text-left text-info hover:bg-surface-2" onClick={() => setIndex(i)}>
                        <span className="font-semibold">Passo {i + 1}:</span> {renderStepPlain(p, scaled)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stepIngredients.length > 0 && (
              <div className="card mt-auto">
                <h2 className="section-title mb-1 text-lg">In questo passo</h2>
                <IngredientList scaled={{ ...scaled, ingredients: stepIngredients, warnings: [] }} />
              </div>
            )}
          </section>
        )}

        {isEnd && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold text-fg">Fatto!</h1>
            <p className="text-fg-2">Com'è venuta? Due righe adesso valgono oro la prossima volta.</p>
            <div className="flex gap-1 text-3xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-accent' : 'text-faint'} aria-label={`${n} stelle`}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="w-full"
              rows={4}
              placeholder="Cosa cambieresti? Tempi, quantità, consistenza…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 flex gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        {index < 0 ? (
          <button className="btn-primary flex-1 py-3 text-lg" onClick={begin}>
            Inizia
          </button>
        ) : isEnd ? (
          <>
            <button className="btn-secondary py-3" onClick={() => setIndex(total - 1)} aria-label="Indietro">
              <Icon name="left" />
            </button>
            <button className="btn-primary flex-1 py-3 text-lg" onClick={finish}>
              Salva e chiudi
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary py-3" onClick={() => setIndex(index - 1)} aria-label="Indietro">
              <Icon name="left" />
            </button>
            <button className="btn-primary flex-1 py-3 text-lg" onClick={() => setIndex(index + 1)}>
              {index === total - 1 ? 'Finito' : 'Avanti'} <Icon name="right" />
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
