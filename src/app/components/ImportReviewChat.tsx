import { useEffect, useRef, useState } from 'react'
import { recipeChanges, type Recipe } from '@/core'
import Icon from './Icon'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  costUsd?: number
  /** Cosa è cambiato nella bozza con questa risposta. */
  changes?: string[]
  warnings?: string[]
  /** Bozza prima della modifica, per annullarla. */
  before?: Recipe
  undone?: boolean
}

interface Props {
  recipe: Recipe
  /** Testo originale importato, se disponibile. */
  source?: string
  onReplace: (recipe: Recipe) => void
}

function formatUsd(v: number): string {
  return v < 0.01 ? '< $0,01' : `$${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Chat di revisione di una ricetta importata, prima del salvataggio: l'AI risponde
 * e aggiorna la bozza; ogni modifica si può annullare. Niente viene salvato qui.
 */
export default function ImportReviewChat({ recipe, source, onReplace }: Props) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns, busy])

  const quick = [
    ...(source ? ['Confronta la bozza con la fonte e correggi gli errori'] : []),
    'Ricontrolla le regole di scalatura degli ingredienti',
    'Le dosi vanno ragionate in teglie, non in porzioni',
  ]

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setMessage('')
    setError(null)
    setBusy(true)
    const history = turns.map((t) => ({ role: t.role, text: t.text }))
    setTurns((ts) => [...ts, { role: 'user', text: msg }])
    try {
      const { reviewImport } = await import('@/ai/review')
      const { reply, result, costUsd } = await reviewImport({ recipe, source, history, message: msg })
      const changes = result ? recipeChanges(recipe, result.recipe) : []
      if (result && changes.length) onReplace(result.recipe)
      setTurns((ts) => [
        ...ts,
        {
          role: 'assistant',
          text: reply || (changes.length ? 'Ho aggiornato la ricetta.' : 'Nessuna modifica.'),
          costUsd,
          changes: changes.length ? changes : undefined,
          warnings: result?.warnings.length ? result.warnings : undefined,
          before: changes.length ? recipe : undefined,
        },
      ])
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setError(describeAiError(e))
      // Il messaggio torna nel campo, così si può riprovare senza riscriverlo.
      setTurns((ts) => ts.slice(0, -1))
      setMessage(msg)
    } finally {
      setBusy(false)
    }
  }

  // Si annulla solo l'ultima modifica ancora in vigore: le precedenti si annullano a ritroso.
  const lastUndoable = turns.map((t, k) => (t.before && !t.undone ? k : -1)).reduce((a, b) => Math.max(a, b), -1)
  const undo = (idx: number) => {
    const t = turns[idx]
    if (!t?.before) return
    onReplace(t.before)
    setTurns(turns.map((x, k) => (k === idx ? { ...x, undone: true } : x)))
  }

  return (
    <section className="card space-y-3" aria-labelledby="review-chat-title">
      <div>
        <h2 id="review-chat-title" className="inline-flex items-center gap-2 font-semibold text-fg">
          <Icon name="sparkles" size={16} className="text-accent" /> Rivedi con l'AI
        </h2>
        <p className="text-sm text-muted">Scrivi cosa non torna: l'AI corregge la bozza qui sotto. Salvi tu quando va bene.</p>
      </div>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q} className="chip-button" onClick={() => send(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <div className="max-h-96 space-y-2 overflow-y-auto" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 text-sm ${t.role === 'user' ? 'ml-8 bg-accent-soft' : 'mr-4 bg-surface-2'}`}>
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.changes && (
                <ul className={`mt-2 space-y-0.5 ${t.undone ? 'text-muted line-through' : 'text-fg-2'}`}>
                  {t.changes.map((c) => (
                    <li key={c} className="flex items-start gap-1">
                      <Icon name="check" size={14} className="mt-0.5 shrink-0 text-accent" /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {t.warnings?.map((w) => (
                <p key={w} className="mt-1 flex items-start gap-1 text-warning">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
              {t.role === 'assistant' && (
                <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted">
                  {t.undone && <span>Modifica annullata</span>}
                  {i === lastUndoable && (
                    <button className="btn-ghost min-h-9 px-2 py-1 text-xs" onClick={() => undo(i)} disabled={busy}>
                      Annulla modifica
                    </button>
                  )}
                  {t.costUsd !== undefined && <span>{formatUsd(t.costUsd)}</span>}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="mr-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Rivedo la ricetta…</div>}
          <div ref={bottom} />
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send(message)
        }}
      >
        <input
          className="min-w-0 flex-1"
          placeholder="Es. le dosi sono per 6, il burro era 120 g"
          aria-label="Messaggio per l'AI sulla ricetta"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
        <button className="btn-primary" type="submit" disabled={busy || !message.trim()}>
          {busy ? '…' : 'Invia'}
        </button>
      </form>
      {error && <p className="notice bg-danger-soft text-danger">{error}</p>}
    </section>
  )
}
