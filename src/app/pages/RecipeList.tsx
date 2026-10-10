import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { formatDuration, totalDuration } from '@/core'
import Icon from '../components/Icon'

export default function RecipeList() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Cerca per titolo o ingrediente…"
          className="w-full pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1">
          <button className={`chip ${tag === null ? 'ring-2 ring-accent' : ''}`} onClick={() => setTag(null)}>
            tutte
          </button>
          {tags.map((t) => (
            <button key={t} className={`chip ${tag === t ? 'ring-2 ring-accent' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card py-10 text-center text-muted">
          <Icon name="book" size={40} className="mx-auto mb-3 text-faint" />
          <p className="font-medium text-fg">Nessuna ricetta trovata.</p>
          <p className="mt-1 text-sm">Crea la prima a mano o lascia che l'AI la strutturi da un testo o una foto.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link to="/ricetta/nuova" className="btn-primary">
              Crea la prima ricetta
            </Link>
            <Link to="/importa" className="btn-secondary">
              <Icon name="sparkles" size={16} /> Importa con l'AI
            </Link>
          </div>
        </div>
      )}

      <ul className="rule divide-y divide-line">
        {filtered.map((r) => {
          const minutes = totalDuration(r.steps)
          return (
            <li key={r.id}>
              <Link to={`/ricetta/${r.id}`} className="group -mx-2 block rounded-xl px-2 py-4 transition hover:bg-surface-2">
                <h2 className="font-display text-2xl font-medium text-fg group-hover:text-accent-text">{r.title}</h2>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="chef" size={14} /> {r.servings} porz.
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="book" size={14} /> {r.ingredients.length} ingr.
                  </span>
                  {minutes > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="timer" size={14} /> {formatDuration(minutes)}
                    </span>
                  )}
                </div>
                {r.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
