import { formatRemaining, useTimers, type ActiveTimer } from '../timers/store'

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
    <div className="flex gap-2 overflow-x-auto border-b border-brand-200 bg-white px-3 py-2">
      {visible.map((t) => {
        const remaining = (t.endAt - now) / 1000
        const done = remaining <= 0
        return (
          <div
            key={t.id}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm ${done ? 'animate-pulse bg-green-100 text-green-900' : 'bg-brand-100 text-brand-900'}`}
          >
            <button className="flex items-center gap-2" onClick={() => onSelect?.(t)} disabled={!onSelect}>
              <span className="font-mono font-bold tabular-nums">{done ? 'Pronto!' : formatRemaining(remaining)}</span>
              <span className="max-w-32 truncate">{t.label}</span>
            </button>
            <button className="rounded-full px-1 text-stone-500 hover:text-stone-900" onClick={() => cancel(t.id)} aria-label="Chiudi timer">
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
