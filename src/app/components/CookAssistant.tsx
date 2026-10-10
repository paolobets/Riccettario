import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import type { Recipe } from '@/core'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'
import { useRecipeChat } from '../hooks/useRecipeChat'
import ChatThread from './ChatThread'
import Icon from './Icon'

interface Props {
  recipe: Recipe
  factor: number
  /** Testo del passaggio corrente, già riscalato, dato come contesto. */
  stepContext: string
}

const QUICK = ['Come capisco che è pronto?', 'Ho sbagliato qualcosa, come rimedio?', 'Posso fermarmi qui e riprendere dopo?']

/** Foglio a scomparsa in modalità cucina: domande sul passaggio corrente. */
export default function CookAssistant({ recipe, factor, stepContext }: Props) {
  const chat = useRecipeChat(recipe, factor)
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const titleId = useId()

  useEffect(() => {
    if (open && configured === null) loadAiSettings().then((s) => setConfigured(isAiConfigured(s)))
  }, [open, configured])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const ask = (q: string) => {
    setQuestion('')
    chat.ask(q, stepContext)
  }

  if (!open) {
    return (
      <button className="btn-secondary min-h-11 px-4 py-2" onClick={() => setOpen(true)}>
        <Icon name="sparkles" size={16} /> Chiedi
      </button>
    )
  }
  return (
    <div
      className="fade-up fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl rounded-t-2xl border-t border-line bg-surface p-4 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 id={titleId} className="inline-flex items-center gap-2 font-semibold text-fg">
          <Icon name="sparkles" size={16} className="text-accent" /> Domanda su questo passaggio
        </h2>
        <button className="btn-ghost h-10 w-10 p-0" onClick={() => setOpen(false)} aria-label="Chiudi le domande">
          <Icon name="close" size={18} />
        </button>
      </div>
      {configured === false && (
        <p className="notice mb-2 bg-warning-soft text-warning">
          L'assistente non è ancora configurato.{' '}
          <Link to="/impostazioni" className="underline">
            Inserisci la chiave API nelle impostazioni
          </Link>
          .
        </p>
      )}
      {chat.turns.length === 0 && chat.partial === null && (
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} className="chip-button" onClick={() => ask(q)} disabled={chat.busy || configured === false}>
              {q}
            </button>
          ))}
        </div>
      )}
      <ChatThread turns={chat.turns.slice(-6)} partial={chat.partial} maxHeight="max-h-60" />
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
      >
        <input
          autoFocus
          className="min-w-0 flex-1 text-lg"
          placeholder="Scrivi la domanda…"
          aria-label="Domanda sul passaggio"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={chat.busy}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={chat.busy || !question.trim() || configured === false}>
          {chat.busy ? '…' : 'Invia'}
        </button>
      </form>
      {chat.error && <p className="notice mt-2 bg-danger-soft text-danger">{chat.error}</p>}
    </div>
  )
}
