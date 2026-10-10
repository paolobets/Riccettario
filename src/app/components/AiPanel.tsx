import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { newId, type Recipe } from '@/core'
import { useRecipeChat } from '../hooks/useRecipeChat'
import ChatThread from './ChatThread'

interface Props {
  recipe: Recipe
  factor: number
}

const QUICK = [
  'Ho raddoppiato le dosi: tempi e teglia reggono?',
  'Cosa posso sostituire se manca un ingrediente?',
  'Come la rendo più leggera senza rovinarla?',
  'Quali sono gli errori tipici in questa ricetta?',
]

export default function AiPanel({ recipe, factor }: Props) {
  const navigate = useNavigate()
  const sessions = useLiveQuery(() => db.sessions.where('recipeId').equals(recipe.id).toArray(), [recipe.id]) ?? []
  const chat = useRecipeChat(recipe, factor)
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [question, setQuestion] = useState('')
  const [variantMode, setVariantMode] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [variantBusy, setVariantBusy] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  useEffect(() => {
    if (open && configured === null) loadAiSettings().then((s) => setConfigured(isAiConfigured(s)))
  }, [open, configured])

  const ask = (q: string) => {
    setQuestion('')
    chat.ask(q)
  }

  const makeVariant = async () => {
    if (!instruction.trim() || variantBusy) return
    setVariantError(null)
    setVariantBusy(true)
    try {
      const { proposeVariant } = await import('@/ai/assist')
      const { recipe: v, warnings, costUsd } = await proposeVariant({ recipe, sessions, instruction })
      const saved = await saveRecipe({ ...v, id: newId('r'), title: v.title === recipe.title ? `${v.title} (variante)` : v.title })
      navigate(`/ricetta/${saved.id}`, { state: { warnings, costUsd } })
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setVariantError(describeAiError(e))
    } finally {
      setVariantBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary w-full" onClick={() => setOpen(true)}>
        ✨ {chat.turns.length > 0 ? `Assistente (${chat.turns.length / 2} scambi)` : "Chiedi all'AI o crea una variante"}
      </button>
    )
  }

  const busy = chat.busy || variantBusy

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-900">✨ Assistente</h2>
        <div className="flex gap-1 text-sm">
          <button className={`btn-ghost px-2 py-1 ${!variantMode ? 'bg-brand-100' : ''}`} onClick={() => setVariantMode(false)}>
            Domande
          </button>
          <button className={`btn-ghost px-2 py-1 ${variantMode ? 'bg-brand-100' : ''}`} onClick={() => setVariantMode(true)}>
            Variante
          </button>
          <button className="btn-ghost px-2 py-1" onClick={() => setOpen(false)} aria-label="Chiudi">
            ✕
          </button>
        </div>
      </div>

      {configured === false && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Configura la chiave API nelle impostazioni per usare l'assistente.</p>
      )}

      {!variantMode && (
        <>
          {chat.turns.length === 0 && chat.partial === null && (
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} className="chip hover:bg-brand-200" onClick={() => ask(q)} disabled={busy || configured === false}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <ChatThread turns={chat.turns} partial={chat.partial} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              ask(question)
            }}
          >
            <input className="flex-1" placeholder="Fai una domanda sulla ricetta…" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} />
            <button className="btn-primary" type="submit" disabled={busy || !question.trim() || configured === false}>
              {chat.busy ? '…' : 'Invia'}
            </button>
          </form>
          {chat.turns.length > 0 && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={chat.reset} disabled={busy}>
              Nuova conversazione
            </button>
          )}
          {chat.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{chat.error}</p>}
        </>
      )}

      {variantMode && (
        <div className="space-y-2">
          <p className="text-sm text-stone-600">
            Descrivi la modifica: l'AI produce una nuova ricetta completa, salvata come variante accanto all'originale.
            {sessions.some((s) => s.notes || s.rating) && ' Tiene conto del tuo diario di cottura.'}
          </p>
          <textarea
            className="w-full"
            rows={3}
            placeholder="Es. versione senza lattosio; oppure: applica le note delle ultime cotture"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary w-full" onClick={makeVariant} disabled={busy || !instruction.trim() || configured === false}>
            {variantBusy ? 'Creo la variante…' : 'Crea variante'}
          </button>
          {variantError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{variantError}</p>}
        </div>
      )}
    </section>
  )
}
