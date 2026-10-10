import { formatRemaining, useTimers, type ActiveTimer } from '../timers/store'
import Icon from './Icon'

interface Props {
  recipeId?: string
  /** Chiamato quando si tocca un timer: la modalità cucina salta al passaggio. */
  onSelect?: (timer: ActiveTimer) => void
}

/** Barra sempre visibile con tutti i timer in corso. */
export default function TimerBar({ recipeId, onSelect }: Props) {
  const { timers, now, cancel } = useTimers()
  const visible = recipeId ? timers.filter((t) => t.recipeId === recipeId) : timers
  if (visible.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-3 py-1.5" role="status" aria-label="Timer attivi">
      {visible.map((t) => {
        const remaining = (t.endAt - now) / 1000
        const done = remaining <= 0
        return (
          <div
            key={t.id}
            className={`flex shrink-0 items-center rounded-full pl-3 ${done ? 'animate-pulse bg-success-soft text-success' : 'bg-accent-soft text-accent-text'}`}
          >
            <button className="flex min-h-9 items-center gap-2 text-sm" onClick={() => onSelect?.(t)} disabled={!onSelect}>
              <span className="qty text-base font-semibold">{done ? 'Pronto!' : formatRemaining(remaining)}</span>
              <span className="max-w-32 truncate">{t.label}</span>
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-fg"
              onClick={() => cancel(t.id)}
              aria-label={done ? `Chiudi timer ${t.label}` : `Annulla timer ${t.label}`}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
