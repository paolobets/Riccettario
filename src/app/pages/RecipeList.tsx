import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { activeDuration, formatDuration, totalDuration, type Recipe } from '@/core'
import { HOSTED } from '@/ai/settings'
import { useSignedIn } from '@/auth/session'
import Icon from '../components/Icon'

type Sort = 'recenti' | 'alfabetico' | 'cucinate'
const SORT_KEY = 'lista:ordine'
const SORT_LABELS: Record<Sort, string> = { recenti: 'Più recenti', alfabetico: 'Dalla A alla Z', cucinate: 'Più cucinate' }

function loadSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v === 'alfabetico' || v === 'cucinate' ? v : 'recenti'
  } catch {
    return 'recenti'
  }
}

interface Cooked {
  count: number
  last: string
}

function cookedLabel(c: Cooked | undefined): string | null {
  if (!c) return null
  const when = new Date(c.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return c.count === 1 ? `Cucinata una volta, il ${when}` : `Cucinata ${c.count} volte, l'ultima il ${when}`
}

export default function RecipeList() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.filter((s) => Boolean(s.finishedAt)).toArray(), [])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [sort, setSort] = useState<Sort>(() => loadSort())
  const signedIn = useSignedIn()
  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      // storage non disponibile
    }
  }, [sort])

  const cooked = useMemo(() => {
    const map = new Map<string, Cooked>()
    for (const s of sessions ?? []) {
      const prev = map.get(s.recipeId)
      const last = s.finishedAt ?? s.startedAt
      map.set(s.recipeId, { count: (prev?.count ?? 0) + 1, last: prev && prev.last > last ? prev.last : last })
    }
    return map
  }, [sessions])
  const hasFavorites = useMemo(() => recipes?.some((r) => r.favorite) ?? false, [recipes])

  const tags = useMemo(() => {
    const s = new Set<string>()
    recipes?.forEach((r) => r.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [recipes])

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    const list = recipes.filter((r) => {
      if (tag && !r.tags.includes(tag)) return false
      if (onlyFavorites && !r.favorite) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    const by: Record<Sort, (a: Recipe, b: Recipe) => number> = {
      recenti: () => 0,
      alfabetico: (a, b) => a.title.localeCompare(b.title, 'it'),
      cucinate: (a, b) => (cooked.get(b.id)?.count ?? 0) - (cooked.get(a.id)?.count ?? 0) || (cooked.get(b.id)?.last ?? '').localeCompare(cooked.get(a.id)?.last ?? ''),
    }
    return sort === 'recenti' ? list : [...list].sort(by[sort])
  }, [recipes, query, tag, onlyFavorites, sort, cooked])

  if (!recipes) return null
  const filtering = query.trim() !== '' || tag !== null || onlyFavorites

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
      {(tags.length > 0 || hasFavorites) && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtra per tag">
          <button className={`chip-button ${tag === null && !onlyFavorites ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`} aria-pressed={tag === null && !onlyFavorites} onClick={() => { setTag(null); setOnlyFavorites(false) }}>
            tutte
          </button>
          {hasFavorites && (
            <button className={`chip-button ${onlyFavorites ? 'bg-accent text-on-accent hover:bg-accent-strong' : ''}`} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}>
              <Icon name="star" size={14} fill={onlyFavorites ? 'currentColor' : 'none'} /> preferite
            </button>
          )}
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

      {recipes.length > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted">
          <label htmlFor="ordine">Ordina</label>
          <select id="ordine" className="min-h-9 py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="rule divide-y divide-line">
        {filtered.map((r) => {
          const diary = cookedLabel(cooked.get(r.id))
          const total = totalDuration(r.steps)
          const active = activeDuration(r.steps)
          const waiting = total - active
          return (
            <li key={r.id}>
              <Link to={`/ricetta/${r.id}`} className="group -mx-2 block rounded-xl px-2 py-4">
                <h2 className="font-display flex items-start gap-2 text-2xl font-medium text-fg group-hover:text-accent-text">
                  {r.favorite && <Icon name="star" size={16} fill="currentColor" className="mt-2 text-warning" aria-label="Preferita" />}
                  <span>{r.title}</span>
                </h2>
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
                  {diary && (
                    <span className="inline-flex items-center gap-1 basis-full">
                      <Icon name="flame" size={14} /> {diary}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
