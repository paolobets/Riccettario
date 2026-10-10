import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ChatTurn } from '@/ai/assist'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { newId, type Recipe } from '@/core'

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
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [partial, setPartial] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variantMode, setVariantMode] = useState(false)
  const [instruction, setInstruction] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && configured === null) loadAiSettings().then((s) => setConfigured(isAiConfigured(s)))
  }, [open, configured])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, partial])

  const ask = async (q: string) => {
    if (!q.trim() || busy) return
    setError(null)
    setBusy(true)
    setQuestion('')
    setPartial('')
    try {
      let acc = ''
      const { askAboutRecipe } = await import('@/ai/assist')
      const answer = await askAboutRecipe({ recipe, factor, sessions, history, question: q }, (d) => {
        acc += d
        setPartial(acc)
      })
      setHistory([...history, { role: 'user', text: q }, { role: 'assistant', text: answer }])
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setError(describeAiError(e))
    } finally {
      setPartial(null)
      setBusy(false)
    }
  }

  const makeVariant = async () => {
    if (!instruction.trim() || busy) return
    setError(null)
    setBusy(true)
    try {
      const { proposeVariant } = await import('@/ai/assist')
      const { recipe: v, warnings } = await proposeVariant({ recipe, sessions, instruction })
      const saved = await saveRecipe({ ...v, id: newId('r'), title: v.title === recipe.title ? `${v.title} (variante)` : v.title })
      navigate(`/ricetta/${saved.id}`, { state: { warnings } })
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setError(describeAiError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary w-full" onClick={() => setOpen(true)}>
        ✨ Chiedi all'AI o crea una variante
      </button>
    )
  }

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
          {history.length === 0 && partial === null && (
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} className="chip hover:bg-brand-200" onClick={() => ask(q)} disabled={busy || configured === false}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {history.map((t, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${t.role === 'user' ? 'ml-8 bg-brand-100' : 'mr-4 bg-stone-100'}`}>
                {t.text}
              </div>
            ))}
            {partial !== null && <div className="mr-4 rounded-xl bg-stone-100 px-3 py-2 text-sm whitespace-pre-wrap">{partial || '…'}</div>}
            <div ref={bottom} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              ask(question)
            }}
          >
            <input className="flex-1" placeholder="Fai una domanda sulla ricetta…" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} />
            <button className="btn-primary" type="submit" disabled={busy || !question.trim() || configured === false}>
              {busy ? '…' : 'Invia'}
            </button>
          </form>
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
            {busy ? 'Creo la variante…' : 'Crea variante'}
          </button>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    </section>
  )
}
