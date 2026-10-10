import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { formatDuration, totalDuration } from '@/core'

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
      <input
        type="search"
        placeholder="Cerca per titolo o ingrediente…"
        className="w-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button className={`chip ${tag === null ? 'ring-2 ring-brand-600' : ''}`} onClick={() => setTag(null)}>
            tutte
          </button>
          {tags.map((t) => (
            <button key={t} className={`chip ${tag === t ? 'ring-2 ring-brand-600' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card text-center text-stone-600">
          <p>Nessuna ricetta trovata.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link to="/ricetta/nuova" className="btn-primary">
              Crea la prima ricetta
            </Link>
            <Link to="/importa" className="btn-secondary">
              ✨ Importa con l'AI
            </Link>
          </div>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((r) => {
          const minutes = totalDuration(r.steps)
          return (
            <li key={r.id}>
              <Link to={`/ricetta/${r.id}`} className="card block hover:border-brand-600">
                <h2 className="text-lg font-semibold text-brand-900">{r.title}</h2>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{r.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span>{r.servings} porzioni</span>
                  <span>·</span>
                  <span>{r.ingredients.length} ingredienti</span>
                  {minutes > 0 && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(minutes)}</span>
                    </>
                  )}
                  {r.tags.map((t) => (
                    <span key={t} className="chip">
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
