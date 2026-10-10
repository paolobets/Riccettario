import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'
import { formatDuration, lastCookedDays, rankSuggestions, type Suggestion } from '@/core'
import type { AiSuggestion } from '@/ai/suggest'
import Icon from '../components/Icon'

type Meal = 'pranzo' | 'cena'
const TIMES: Array<[number | undefined, string]> = [
  [20, '20 minuti'],
  [45, '45 minuti'],
  [90, 'Un\'ora e mezza'],
  [undefined, 'Non ho fretta'],
]
/** Basi e preparazioni non sono un pasto: restano fuori dalla scelta. */
const EXCLUDED_TAGS = ['base', 'basi', 'salse', 'condimenti']

function formatUsd(v: number): string {
  return v < 0.01 ? '< $0,01' : `$${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function cookedLabel(days: number | null): string {
  if (days === null) return 'mai cucinata'
  if (days === 0) return 'cucinata oggi'
  if (days === 1) return 'cucinata ieri'
  if (days < 30) return `cucinata ${days} giorni fa`
  return `cucinata ${Math.floor(days / 30)} mesi fa`
}

/** "Cosa preparo?": pesca tra le proprie ricette, con l'AI come seconda opinione. */
export default function SuggestPage() {
  const navigate = useNavigate()
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [meal, setMeal] = useState<Meal>(() => (new Date().getHours() < 15 ? 'pranzo' : 'cena'))
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(45)
  const [pantry, setPantry] = useState('')
  const [asked, setAsked] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiResult, setAiResult] = useState<(AiSuggestion & { costUsd: number }) | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    loadAiSettings().then((s) => setConfigured(isAiConfigured(s)))
  }, [])

  const ranked = useMemo<Suggestion[]>(
    () => (recipes && sessions ? rankSuggestions(recipes, sessions, { maxActiveMinutes: maxMinutes, pantry, excludeTags: EXCLUDED_TAGS }) : []),
    [recipes, sessions, maxMinutes, pantry],
  )

  if (!recipes || !sessions) return null
  const pick = ranked.length > 0 ? ranked[cursor % ranked.length] : undefined
  const pantryWordsGiven = pantry.trim().length > 0

  const ask = () => {
    setAsked(true)
    setCursor(0)
    setAiResult(null)
    setAiError(null)
  }

  const askAi = async () => {
    setAiBusy(true)
    setAiError(null)
    try {
      const { suggestDish } = await import('@/ai/suggest')
      const pool = recipes.filter((r) => !r.tags.some((t) => EXCLUDED_TAGS.includes(t.toLowerCase())))
      setAiResult(await suggestDish({ recipes: pool, lastCookedDays: lastCookedDays(sessions, new Date()), meal, maxActiveMinutes: maxMinutes, pantry }))
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setAiError(describeAiError(e))
    } finally {
      setAiBusy(false)
    }
  }

  const aiRecipe = aiResult?.kind === 'existing' ? recipes.find((r) => r.id === aiResult.recipeId) : undefined

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-medium text-fg">Cosa preparo?</h1>
        <p className="mt-1 text-sm text-muted">Dimmi quanto tempo hai e cosa c'è in casa: pesco tra le tue ricette.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-fg-2">Per quale pasto</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Pasto">
          {(['pranzo', 'cena'] as Meal[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={meal === m}
              className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${meal === m ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
              onClick={() => setMeal(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-fg-2">Quanto tempo hai ai fornelli</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tempo disponibile">
          {TIMES.map(([min, label]) => (
            <button
              key={label}
              role="radio"
              aria-checked={maxMinutes === min}
              className={`chip-button ${maxMinutes === min ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`}
              onClick={() => setMaxMinutes(min)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-fg-2">Cosa hai in casa (facoltativo)</span>
        <input className="w-full" placeholder="Es. zucchine, uova, pecorino" value={pantry} onChange={(e) => setPantry(e.target.value)} />
      </label>

      <button className="btn-primary w-full py-3 text-lg" onClick={ask}>
        <Icon name="chef" size={20} /> Proponimi qualcosa
      </button>

      {asked && (
        <section className="rule space-y-4 pt-4" aria-live="polite">
          {pick ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {meal === 'pranzo' ? 'A pranzo' : 'Stasera'} potresti fare{ranked.length > 1 ? ` (${(cursor % ranked.length) + 1} di ${ranked.length})` : ''}:
              </p>
              <h2 className="font-display text-3xl font-medium leading-tight text-fg">{pick.recipe.title}</h2>
              {pick.recipe.description && <p className="text-fg-2">{pick.recipe.description}</p>}
              <ul className="space-y-1 text-sm text-muted">
                {pick.activeMinutes > 0 && (
                  <li className="inline-flex items-center gap-1.5">
                    <Icon name="timer" size={14} /> {formatDuration(pick.activeMinutes)} ai fornelli
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <Icon name="book" size={14} /> {cookedLabel(pick.daysSinceCooked)}
                </li>
                {pick.matched.length > 0 && (
                  <li className="flex items-start gap-1.5 text-accent-text">
                    <Icon name="check" size={14} className="mt-0.5" /> Hai già {pick.matched.join(', ')}
                  </li>
                )}
                {pantryWordsGiven && pick.matched.length === 0 && (
                  <li className="flex items-start gap-1.5">
                    <Icon name="alert" size={14} className="mt-0.5" /> Non usa quello che hai indicato
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link to={`/ricetta/${pick.recipe.id}`} className="btn-primary">
                  Apri la ricetta
                </Link>
                <Link to={`/ricetta/${pick.recipe.id}/cucina`} className="btn-secondary">
                  <Icon name="chef" size={16} /> Cucina subito
                </Link>
                {ranked.length > 1 && (
                  <button className="btn-ghost" onClick={() => setCursor((c) => c + 1)}>
                    Un'altra
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-fg">
                {maxMinutes ? `Nessuna ricetta del tuo ricettario sta in ${formatDuration(maxMinutes)} ai fornelli.` : 'Nessuna ricetta adatta nel tuo ricettario.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {maxMinutes && (
                  <button className="btn-secondary" onClick={() => setMaxMinutes(undefined)}>
                    Togli il limite di tempo
                  </button>
                )}
                <Link to={`/importa?piatto=${encodeURIComponent(pantry.trim() ? `qualcosa con ${pantry.trim()}` : `un piatto veloce per ${meal}`)}`} className="btn-secondary">
                  <Icon name="sparkles" size={16} /> Fatti scrivere una ricetta
                </Link>
              </div>
            </div>
          )}

          <div className="rule space-y-3 pt-4">
            {aiResult === null && (
              <>
                <p className="text-sm text-muted">
                  Vuoi una seconda opinione? L'AI legge tutte le tue ricette e quello che hai in casa, e se non trova niente di adatto propone un piatto
                  nuovo.
                </p>
                {configured === false ? (
                  <p className="notice bg-warning-soft text-warning">
                    L'assistente non è ancora configurato.{' '}
                    <Link to="/impostazioni" className="underline">
                      Inserisci la chiave API nelle impostazioni
                    </Link>
                    .
                  </p>
                ) : (
                  <button className="btn-secondary" onClick={askAi} disabled={aiBusy || configured === null}>
                    <Icon name="sparkles" size={16} /> {aiBusy ? 'Ci penso…' : "Chiedi all'AI"}
                  </button>
                )}
                {aiError && <p className="notice bg-danger-soft text-danger">{aiError}</p>}
              </>
            )}
            {aiResult && (
              <div className="space-y-3">
                <h2 className="inline-flex items-center gap-2 font-semibold text-fg">
                  <Icon name="sparkles" size={16} className="text-accent" /> L'AI propone
                </h2>
                <p className="font-display text-2xl font-medium leading-tight text-fg">{aiRecipe ? aiRecipe.title : aiResult.dish}</p>
                <p className="whitespace-pre-wrap text-fg-2">{aiResult.reason}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {aiRecipe ? (
                    <Link to={`/ricetta/${aiRecipe.id}`} className="btn-primary">
                      Apri la ricetta
                    </Link>
                  ) : (
                    <button className="btn-primary" onClick={() => navigate(`/importa?piatto=${encodeURIComponent(aiResult.dish ?? '')}`)}>
                      <Icon name="sparkles" size={16} /> Scrivi la ricetta
                    </button>
                  )}
                  <button className="btn-ghost" onClick={askAi} disabled={aiBusy}>
                    {aiBusy ? 'Ci penso…' : 'Chiedi di nuovo'}
                  </button>
                  <span className="text-xs text-muted">{formatUsd(aiResult.costUsd)}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
