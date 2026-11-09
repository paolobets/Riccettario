import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { recordSession } from '@/data/repo'
import {
  formatClock,
  formatDuration,
  formatFactor,
  parallelStepsFor,
  parseReadyAt,
  planBackwards,
  quantifiedIngredientIdsInStep,
  renderStepPlain,
  STEP_TYPE_LABELS,
  upcomingStarts,
  type Plan,
} from '@/core'
import { useScaler } from '../hooks/useScaler'
import { clearCookState, cookStateKey, loadCookState, saveCookState, type CookState } from '../cook/state'
import IngredientList from '../components/IngredientList'
import StepText from '../components/StepText'
import TimerButton from '../components/TimerButton'
import TimerBar from '../components/TimerBar'
import CookAssistant from '../components/CookAssistant'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import NotFound from './NotFound'

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

function notifyStart(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: `${import.meta.env.BASE_URL}icon.svg` })
  } catch {
    // niente notifiche
  }
}

/** Avvisa quando è ora di iniziare un passaggio, finché la pagina resta aperta. */
function useStartAlarms(plan: Plan | null, recipeTitle: string) {
  useEffect(() => {
    if (!plan) return
    const now = new Date()
    const timers = upcomingStarts(plan, now)
      .filter((it) => it.startsAt.getTime() - now.getTime() < 12 * 3_600_000)
      .map((it) =>
        setTimeout(() => notifyStart(`È ora del passo ${it.index + 1}`, `${recipeTitle}: ${it.step.text.replace(/\{[^}]*\}/g, '…').slice(0, 80)}`), it.startsAt.getTime() - now.getTime()),
      )
    return () => timers.forEach(clearTimeout)
  }, [plan, recipeTitle])
}

export default function CookMode() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const recipe = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const scaler = useScaler(recipe ?? undefined)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [cook, setCook] = useState<CookState | null>(() => (id ? loadCookState(id) : null))
  const [showPlan, setShowPlan] = useState(false)
  const { confirm, dialog } = useConfirm()
  useWakeLock()

  const total = recipe?.steps.length ?? 0
  // Il passo vive nell'URL (`?passo=3`, `?passo=fine`) come il fattore: un ricaricamento non lo perde.
  // -1 = mise en place, total = diario finale.
  const index = useMemo(() => {
    const raw = params.get('passo')
    if (raw === null) return -1
    if (raw === 'fine') return total
    const n = Number(raw)
    return Number.isInteger(n) && n >= 1 && n <= total ? n - 1 : -1
  }, [params, total])

  const setIndex = useCallback(
    (next: number | ((i: number) => number)) => {
      const value = Math.max(-1, Math.min(total, typeof next === 'function' ? next(index) : next))
      const p = new URLSearchParams(params)
      if (value < 0) p.delete('passo')
      else if (value >= total) p.set('passo', 'fine')
      else p.set('passo', String(value + 1))
      setParams(p, { replace: true })
    },
    [index, params, setParams, total],
  )

  const updateCook = useCallback(
    (patch: Partial<CookState>) => {
      if (!id) return
      const next: CookState = { startedAt: cook?.startedAt ?? new Date().toISOString(), ...cook, ...patch }
      saveCookState(id, next)
      setCook(next)
    },
    [cook, id],
  )

  // Il passo corrente si ricorda anche fuori dall'URL: così dalla ricetta si può riprendere.
  useEffect(() => {
    if (!id || index < 0 || index >= total || cook?.step === index) return
    updateCook({ step: index })
  }, [id, index, total, cook?.step, updateCook])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (document.querySelector('dialog[open], [role="dialog"]')) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setIndex((i) => i + 1)
      }
      if (e.key === 'ArrowLeft') setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setIndex])

  const scaled = scaler.scaled
  const step = recipe && index >= 0 && index < total ? recipe.steps[index] : undefined
  const parallel = useMemo(() => (recipe && step ? parallelStepsFor(recipe.steps, step.id) : []), [recipe, step])
  const parallelParentIndex = step?.parallelWith ? (recipe?.steps.findIndex((s) => s.id === step.parallelWith) ?? -1) : -1
  // Solo gli ingredienti citati con la quantità: un rimando al solo nome non è una dose da aggiungere.
  const stepIngredients = useMemo(() => {
    if (!step || !scaled) return []
    return quantifiedIngredientIdsInStep(step)
      .map((iid) => scaled.byId.get(iid))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  }, [step, scaled])

  // "Pronto per le": piano a ritroso, ricalcolato quando cambia l'orario.
  const readyAtDate = useMemo(() => (cook?.readyAt ? parseReadyAt(cook.readyAt, new Date()) : null), [cook?.readyAt])
  const plan = useMemo(() => (recipe && readyAtDate ? planBackwards(recipe.steps, readyAtDate) : null), [recipe, readyAtDate])
  useStartAlarms(plan, recipe?.title ?? '')
  const planned = plan && step ? plan.items.find((it) => it.step.id === step.id) : undefined

  if (recipe === undefined) return null
  if (recipe === null || !scaled) {
    return (
      <div className="mx-auto max-w-2xl px-4">
        <NotFound what="ricetta" />
      </div>
    )
  }
  const isEnd = index >= total
  const progress = Math.max(0, Math.min(1, (index + 1) / (total + 1)))
  const back = new URLSearchParams(params)
  back.delete('passo')
  const recipeLink = `/ricetta/${recipe.id}${back.size ? `?${back}` : ''}`
  const late = plan ? Math.round((Date.now() - plan.startAt.getTime()) / 60_000) : 0

  const begin = () => {
    if (!cook) updateCook({ startedAt: new Date().toISOString() })
    setIndex(0)
  }

  const exit = async () => {
    if (index >= 0 && !isEnd) {
      const ok = await confirm({
        title: 'Uscire dalla cottura?',
        body: `Potrai riprendere dal passo ${index + 1} dalla pagina della ricetta. I timer avviati continuano.`,
        confirmLabel: 'Esci',
        cancelLabel: 'Resta in cucina',
      })
      if (!ok) return
    }
    navigate(recipeLink)
  }

  const finish = async () => {
    const startedAt = cook?.startedAt ?? new Date().toISOString()
    await recordSession(recipe.id, scaler.factor, startedAt, { rating: rating || undefined, notes: notes.trim() || undefined })
    clearCookState(recipe.id)
    navigate(recipeLink)
  }

  const setReadyAt = (value: string) => {
    updateCook({ readyAt: value || undefined })
    if (value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-4 py-2">
        <button className="btn-ghost min-h-10 px-2 py-1 text-sm" onClick={exit}>
          <Icon name="close" size={16} /> Esci
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-accent-text">{recipe.title}</div>
        <span className="chip">
          {Math.round(scaled.servings * 100) / 100} porzioni{Math.abs(scaled.factor - 1) > 1e-9 ? `, ${formatFactor(scaled.factor)}` : ''}
        </span>
      </header>
      <div
        className="h-1 w-full bg-surface-3"
        role="progressbar"
        aria-label="Avanzamento della ricetta"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.max(0, Math.min(total, index + 1))}
      >
        <div className="h-1 bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <TimerBar
        recipeId={recipe.id}
        onSelect={(t) => {
          const i = recipe.steps.findIndex((s) => s.id === t.stepId)
          if (i >= 0) setIndex(i)
        }}
      />

      {dialog}
      <main className="flex flex-1 flex-col px-5 py-6">
        {index < 0 && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold text-fg">Prima di iniziare</h1>
            {cook?.step !== undefined && (
              <button className="w-full min-h-11 rounded-lg bg-info-soft px-3 py-2 text-left text-sm text-info" onClick={() => setIndex(cook.step!)}>
                <Icon name="play" size={14} className="mr-1 inline" /> Eri al passo {cook.step + 1}: tocca per riprendere da lì.
              </button>
            )}
            <p className="text-fg-2">Pesa e prepara tutto. Spunta man mano.</p>
            {scaled.warnings.map((w) => (
              <p key={w} className="notice flex items-start gap-2 bg-warning-soft text-warning">
                <Icon name="alert" size={16} className="mt-0.5" /> <span>{w}</span>
              </p>
            ))}
            <div className="card">
              <IngredientList scaled={scaled} checkable storageKey={`${cookStateKey(recipe.id)}:spunte`} />
            </div>
            {recipe.steps.some((s) => s.equipment?.length) && (
              <div className="rule pt-3">
                <h2 className="section-title mb-1 text-lg">Attrezzatura</h2>
                <ul className="list-inside list-disc text-fg-2">
                  {[...new Set(recipe.steps.flatMap((s) => s.equipment ?? []))].map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {recipe.steps.some((s) => (s.durationMin ?? 0) > 0 || s.timer) && (
              <div className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="ready-at" className="section-title text-lg">
                    Pronto per le
                  </label>
                  <div className="flex items-center gap-2">
                    <input id="ready-at" type="time" className="py-1.5" value={cook?.readyAt ?? ''} onChange={(e) => setReadyAt(e.target.value)} />
                    {cook?.readyAt && (
                      <button className="btn-ghost min-h-9 px-2 py-1 text-sm" onClick={() => setReadyAt('')}>
                        Togli
                      </button>
                    )}
                  </div>
                </div>
                {!plan && <p className="text-sm text-muted">Scegli l'ora del pasto: calcolo a ritroso quando iniziare ogni passaggio e ti avviso all'ora giusta finché l'app è aperta.</p>}
                {plan && (
                  <>
                    <p className="text-fg">
                      Inizia alle <b className="qty">{formatClock(plan.startAt)}</b>: {formatDuration(plan.totalMinutes)} in tutto, pause comprese.
                    </p>
                    {late > 0 && (
                      <p className="notice flex items-start gap-2 bg-warning-soft text-warning">
                        <Icon name="alert" size={16} className="mt-0.5" /> <span>Sei in ritardo di {formatDuration(late)} sull'orario di inizio: sarà pronto verso le {formatClock(new Date(Date.now() + plan.totalMinutes * 60_000))}.</span>
                      </p>
                    )}
                    <button className="btn-ghost min-h-9 px-2 py-1 text-sm" onClick={() => setShowPlan(!showPlan)} aria-expanded={showPlan}>
                      {showPlan ? 'Nascondi gli orari' : 'Mostra gli orari dei passaggi'}
                    </button>
                    {showPlan && (
                      <ol className="divide-y divide-line text-sm">
                        {plan.items.map((it) => (
                          <li key={it.step.id} className="flex items-baseline gap-3 py-1.5">
                            <span className="qty w-12 shrink-0 font-semibold text-fg">{formatClock(it.startsAt)}</span>
                            <span className="min-w-0 flex-1 text-fg-2">
                              <span className="text-muted">Passo {it.index + 1}</span> {renderStepPlain(it.step, scaled).slice(0, 70)}
                              {it.parallel ? <span className="text-info"> (in parallelo)</span> : null}
                            </span>
                            {it.minutes > 0 && <span className="shrink-0 text-xs text-muted">{formatDuration(it.minutes)}</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {step && (
          <section className="flex flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <label className="inline-flex items-center gap-1 font-semibold text-accent-text">
                <span className="sr-only">Vai al passo</span>
                <select
                  className="min-h-9 w-36 appearance-none border-0 bg-transparent py-1 pr-6 pl-0 text-sm font-semibold text-accent-text"
                  value={index}
                  onChange={(e) => setIndex(Number(e.target.value))}
                >
                  {recipe.steps.map((s, i) => {
                    const plain = renderStepPlain(s, scaled)
                    return (
                      <option key={s.id} value={i}>
                        {i === index ? `Passo ${i + 1} di ${total}` : `Passo ${i + 1}: ${plain.slice(0, 28)}${plain.length > 28 ? '…' : ''}`}
                      </option>
                    )
                  })}
                </select>
              </label>
              {step.section && <span>{step.section}</span>}
              {step.type && step.type !== 'prep' && <span className="chip">{STEP_TYPE_LABELS[step.type]}</span>}
              {step.durationMin && !step.timer && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="timer" size={13} /> {formatDuration(step.durationMin)}
                </span>
              )}
              {step.temperatureC && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="flame" size={13} /> {step.temperatureC} °C
                </span>
              )}
              {planned && plan && (
                <span className="inline-flex items-center gap-1" title={`Pronto per le ${formatClock(plan.readyAt)}`}>
                  <Icon name="clock" size={13} /> inizio previsto {formatClock(planned.startsAt)}
                </span>
              )}
            </div>
            <StepText as="h1" variant="display" step={step} scaled={scaled} className="font-display text-[32px] leading-[1.2] font-normal tracking-[-0.01em] text-fg sm:text-[40px]" />
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
              <button className="w-fit min-h-11 rounded-lg bg-info-soft px-3 py-2 text-left text-sm text-info" onClick={() => setIndex(parallelParentIndex)}>
                <Icon name="parallel" size={14} className="mr-1 inline" /> Da fare durante il passo {parallelParentIndex + 1}. Tocca per tornarci.
              </button>
            )}
            {parallel.length > 0 && (
              <div className="rounded-xl border border-line bg-info-soft p-3">
                <h2 className="section-title mb-1 text-lg text-info">Nel frattempo puoi</h2>
                <ul className="space-y-1">
                  {parallel.map(({ step: p, index: i }) => (
                    <li key={p.id}>
                      <button className="w-full min-h-11 rounded-lg px-2 py-1 text-left text-info hover:bg-surface-2" onClick={() => setIndex(i)}>
                        <span className="font-semibold">Passo {i + 1}:</span> {renderStepPlain(p, scaled)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stepIngredients.length > 1 && (
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
            <div className="flex gap-1" role="group" aria-label="Voto">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${n <= rating ? 'text-accent' : 'text-muted'}`}
                  aria-label={`${n} ${n === 1 ? 'stella' : 'stelle'}`}
                  aria-pressed={n <= rating}
                >
                  <Icon name="star" size={28} fill={n <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <label className="block">
              <span className="sr-only">Note sulla cottura</span>
              <textarea
                className="w-full"
                rows={4}
                placeholder="Cosa cambieresti? Tempi, quantità, consistenza…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 flex gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        {index < 0 ? (
          <button className="btn-primary flex-1 py-3 text-lg" onClick={begin}>
            {cook?.step !== undefined ? 'Ricomincia dal primo passo' : 'Inizia'}
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
              {index === total - 1 ? 'Concludi' : 'Avanti'} <Icon name="right" />
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
