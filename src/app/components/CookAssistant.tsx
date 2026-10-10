import { useState } from 'react'
import type { Recipe } from '@/core'
import { useRecipeChat } from '../hooks/useRecipeChat'
import ChatThread from './ChatThread'

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
  const [question, setQuestion] = useState('')

  const ask = (q: string) => {
    setQuestion('')
    chat.ask(q, stepContext)
  }

  if (!open) {
    return (
      <button className="btn-secondary px-3 py-2 text-sm" onClick={() => setOpen(true)}>
        ✨ Chiedi
      </button>
    )
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl rounded-t-2xl border-t border-brand-200 bg-white p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-brand-900">✨ Domanda su questo passaggio</h2>
        <button className="btn-ghost px-2 py-1" onClick={() => setOpen(false)} aria-label="Chiudi">
          ✕
        </button>
      </div>
      {chat.turns.length === 0 && chat.partial === null && (
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} className="chip hover:bg-brand-200" onClick={() => ask(q)} disabled={chat.busy}>
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
        <input className="flex-1 text-lg" placeholder="Scrivi la domanda…" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={chat.busy} />
        <button className="btn-primary" type="submit" disabled={chat.busy || !question.trim()}>
          {chat.busy ? '…' : 'Invia'}
        </button>
      </form>
      {chat.error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{chat.error}</p>}
    </div>
  )
}
