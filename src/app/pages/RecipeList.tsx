import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { activeDuration, formatDuration, totalDuration } from '@/core'
import { HOSTED } from '@/ai/settings'
import { useSignedIn } from '@/auth/session'
import Icon from '../components/Icon'

export default function RecipeList() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const signedIn = useSignedIn()

  const tags = useMemo(() => {
    const s = new Set<string>()
    recipes?.forEach((r) => r.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [recipes])

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    return recipes.filter((r) => {
      if (tag && !r.tags.includes(tag)) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [recipes, query, tag])

  if (!recipes) return null
  const filtering = query.trim() !== '' || tag !== null

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Ricette</h1>
      {HOSTED && signedIn === false && (
        <div className="notice flex flex-wrap items-center justify-between gap-2 bg-info-soft text-info">
          <span>Accedi per usare l'assistente e ritrovare le ricette su ogni dispositivo.</span>
          <span className="flex gap-2">
            <Link to="/accedi" className="btn-primary min-h-10 px-3 py-1 text-sm">
              Accedi
            </Link>
            <Link to="/registrati" className="btn-secondary min-h-10 px-3 py-1 text-sm">
              Crea l'account
            </Link>
          </span>
        </div>
      )}
      <label className="relative block">
        <span className="sr-only">Cerca per titolo o ingrediente</span>
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Cerca per titolo o ingrediente…"
          className="w-full pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {recipes.length > 0 && (
        <Link to="/cosa-preparo" className="btn-secondary w-full">
          <Icon name="chef" size={18} /> Cosa preparo oggi?
        </Link>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtra per tag">
          <button className={`chip-button ${tag === null ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`} aria-pressed={tag === null} onClick={() => setTag(null)}>
            tutte
          </button>
          {tags.map((t) => (
            <button
              key={t}
              className={`chip-button ${tag === t ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`}
              aria-pressed={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && recipes.length > 0 && filtering && (
        <div className="py-10 text-center text-muted">
          <Icon name="search" size={40} className="mx-auto mb-3 text-muted" />
          <p className="font-medium text-fg">Nessuna ricetta corrisponde{query.trim() ? ` a «${query.trim()}»` : ''}{tag ? ` con il tag «${tag}»` : ''}.</p>
          <p className="mt-1 text-sm">Prova con un ingrediente, oppure togli i filtri.</p>
          <button
            className="btn-secondary mt-3"
            onClick={() => {
              setQuery('')
              setTag(null)
            }}
          >
            Mostra tutte le ricette
          </button>
        </div>
      )}

      {recipes.length === 0 && (
        <div className="py-10 text-center text-muted">
          <Icon name="book" size={40} className="mx-auto mb-3 text-muted" />
          <p className="font-medium text-fg">Il ricettario è vuoto.</p>
          <p className="mt-1 text-sm">Scrivi la prima ricetta a mano o lascia che l'AI la strutturi da un testo o una foto.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link to="/ricetta/nuova" className="btn-primary">
              Scrivi la prima ricetta
            </Link>
            <Link to="/importa" className="btn-secondary">
              <Icon name="sparkles" size={16} /> Importa con l'AI
            </Link>
          </div>
        </div>
      )}

      <ul className="rule divide-y divide-line">
        {filtered.map((r) => {
          const total = totalDuration(r.steps)
          const active = activeDuration(r.steps)
          const waiting = total - active
          return (
            <li key={r.id}>
              <Link to={`/ricetta/${r.id}`} className="group -mx-2 block rounded-xl px-2 py-4">
                <h2 className="font-display text-2xl font-medium text-fg group-hover:text-accent-text">{r.title}</h2>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="chef" size={14} /> {r.servings} porzioni
                  </span>
                  {total > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="timer" size={14} />
                      {waiting > 0 && active > 0 ? `${formatDuration(active)} ai fornelli, ${formatDuration(waiting)} di attesa` : formatDuration(total)}
                    </span>
                  )}
                  {r.tags.map((t) => (
                    <span key={t} className="text-accent-text">
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
