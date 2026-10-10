import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'

/**
 * Timer attivi, condivisi tra lettura e modalità cucina e persistiti in
 * localStorage: ricaricare la pagina o cambiare passaggio non li perde.
 * Il conto alla rovescia si basa su `endAt` (timestamp), non su un contatore,
 * quindi regge anche se il tab viene sospeso.
 */
export interface ActiveTimer {
  id: string
  recipeId: string
  stepId: string
  label: string
  minutes: number
  endAt: number
  notified: boolean
}

type Action =
  | { type: 'start'; timer: ActiveTimer }
  | { type: 'cancel'; id: string }
  | { type: 'notified'; id: string }
  | { type: 'clearRecipe'; recipeId: string }

const STORAGE_KEY = 'timers:v1'

function load(): ActiveTimer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ActiveTimer[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function reducer(state: ActiveTimer[], action: Action): ActiveTimer[] {
  switch (action.type) {
    case 'start':
      return [...state.filter((t) => t.id !== action.timer.id), action.timer]
    case 'cancel':
      return state.filter((t) => t.id !== action.id)
    case 'notified':
      return state.map((t) => (t.id === action.id ? { ...t, notified: true } : t))
    case 'clearRecipe':
      return state.filter((t) => t.recipeId !== action.recipeId)
  }
}

export function timerId(recipeId: string, stepId: string): string {
  return `${recipeId}:${stepId}`
}

function notify(label: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Timer finito', { body: label, icon: `${import.meta.env.BASE_URL}icon.svg` })
    }
    if ('vibrate' in navigator) navigator.vibrate?.([300, 100, 300, 100, 600])
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.start()
    osc.stop(ctx.currentTime + 0.8)
  } catch {
    // ambiente senza audio o notifiche
  }
}

interface TimerContextValue {
  timers: ActiveTimer[]
  now: number
  start: (t: Omit<ActiveTimer, 'endAt' | 'notified' | 'id'>) => void
  cancel: (id: string) => void
  get: (id: string) => ActiveTimer | undefined
}

const TimerContext = createContext<TimerContextValue | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timers, dispatch] = useReducer(reducer, undefined, load)
  const [now, tick] = useReducer(() => Date.now(), Date.now())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers))
    } catch {
      // storage non disponibile
    }
  }, [timers])

  // tick solo se c'è almeno un timer in corso
  const running = timers.some((t) => !t.notified)
  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    for (const t of timers) {
      if (!t.notified && t.endAt <= now) {
        dispatch({ type: 'notified', id: t.id })
        notify(t.label)
      }
    }
  }, [now, timers])

  const start = useCallback((t: Omit<ActiveTimer, 'endAt' | 'notified' | 'id'>) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }
    dispatch({
      type: 'start',
      timer: { ...t, id: timerId(t.recipeId, t.stepId), endAt: Date.now() + t.minutes * 60_000, notified: false },
    })
    tick()
  }, [])
  const cancel = useCallback((id: string) => dispatch({ type: 'cancel', id }), [])
  const get = useCallback((id: string) => timers.find((t) => t.id === id), [timers])

  const value = useMemo(() => ({ timers, now, start, cancel, get }), [timers, now, start, cancel, get])
  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}

export function useTimers(): TimerContextValue {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers richiede TimerProvider')
  return ctx
}

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
