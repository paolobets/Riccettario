import type { Timer } from '@/core'
import { formatRemaining, timerId, useTimers } from '../timers/store'
import Icon from './Icon'

interface Props {
  recipeId: string
  stepId: string
  timer: Timer
  size?: 'sm' | 'lg'
}

/** Avvia o mostra il timer di un passaggio; lo stato vive nel TimerProvider. */
export default function TimerButton({ recipeId, stepId, timer, size = 'sm' }: Props) {
  const { get, start, cancel, now } = useTimers()
  const id = timerId(recipeId, stepId)
  const active = get(id)
  const big = size === 'lg'
  const label = timer.label ?? 'Timer'

  if (!active) {
    return (
      <button
        className={`btn-secondary ${big ? 'px-6 py-3 text-lg' : 'text-sm'}`}
        onClick={() => start({ recipeId, stepId, label, minutes: timer.minutes })}
      >
        <Icon name="timer" size={big ? 20 : 16} /> {label} · {formatRemaining(timer.minutes * 60)}
      </button>
    )
  }
  const remaining = (active.endAt - now) / 1000
  const done = remaining <= 0
  return (
    <div className={`inline-flex items-center gap-3 rounded-xl ${done ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-text'} ${big ? 'px-5 py-3' : 'px-3 py-1.5'}`}>
      <span className={`font-mono font-bold tabular-nums ${big ? 'text-3xl' : 'text-base'}`}>{done ? 'Pronto!' : formatRemaining(remaining)}</span>
      <span className="text-sm">{label}</span>
      <button className="btn-ghost px-2 py-1 text-sm" onClick={() => cancel(id)}>
        {done ? 'OK' : 'Annulla'}
      </button>
    </div>
  )
}
