import { useEffect, useRef } from 'react'
import type { Chat } from '@/data/db'

interface Props {
  turns: Chat['turns']
  partial: string | null
  maxHeight?: string
}

function formatUsd(v: number): string {
  return v < 0.01 ? '< $0,01' : `$${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Elenco dei turni di una conversazione, con risposta parziale in streaming. */
export default function ChatThread({ turns, partial, maxHeight = 'max-h-96' }: Props) {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns, partial])
  if (turns.length === 0 && partial === null) return null
  return (
    <div className={`${maxHeight} space-y-2 overflow-y-auto`} aria-live="polite">
      {turns.map((t, i) => (
        <div key={i} className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${t.role === 'user' ? 'ml-8 bg-accent-soft' : 'mr-4 bg-surface-2'}`}>
          {t.text}
          {t.role === 'assistant' && t.costUsd !== undefined && <div className="mt-1 text-right text-xs text-muted">{formatUsd(t.costUsd)}</div>}
        </div>
      ))}
      {partial !== null && <div className="mr-4 rounded-xl bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">{partial || '…'}</div>}
      <div ref={bottom} />
    </div>
  )
}
