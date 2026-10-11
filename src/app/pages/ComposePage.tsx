import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { isMassUnit, isVolumeUnit, newId, slugify, type Ingredient, type Recipe, type Unit } from '@/core'
import Icon from '../components/Icon'

interface Pick {
  recipeId: string
  amount: string
  unit: Unit
}

/** "Componi da basi": scegli ricette esistenti e quanta ne serve; poi il wizard per il montaggio. */
export default function ComposePage() {
  const navigate = useNavigate()
  const recipes = useLiveQuery(() => db.recipes.orderBy('title').toArray(), [])
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (recipes ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)))
  }, [recipes, query])
  if (!recipes) return null
  const byId = new Map(recipes.map((r) => [r.id, r]))

  const toggle = (r: Recipe) => {
    if (picks.some((p) => p.recipeId === r.id)) {
      setPicks(picks.filter((p) => p.recipeId !== r.id))
      return
    }
    const y = r.yield?.unit as Unit | undefined
    const unit: Unit = y && isMassUnit(y) ? 'g' : y && isVolumeUnit(y) ? 'ml' : ''
    setPicks([...picks, { recipeId: r.id, unit, amount: unit ? String(r.yield!.amount) : '1' }])
  }

  const go = () => {
    const now = new Date().toISOString()
    const ingredients: Ingredient[] = picks
      .map((p) => {
        const r = byId.get(p.recipeId)!
        const amount = Number(p.amount.replace(',', '.'))
        return { id: slugify(r.title) || newId('i'), name: r.title.toLowerCase(), quantity: { amount: amount > 0 ? amount : 1, unit: p.unit }, recipeId: r.id }
      })
      .map((i, idx, all) => (all.findIndex((o) => o.id === i.id) === idx ? i : { ...i, id: `${i.id}-${idx + 1}` }))
    const recipe: Recipe = { id: newId('r'), title: title.trim(), servings: 8, tags: [], ingredients, steps: [], createdAt: now, updatedAt: now }
    navigate('/ricetta/nuova', { state: { recipe, startPhase: 0, composed: true } })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Componi da basi</h1>
      <p className="text-sm text-muted">Scegli le ricette che entrano nella nuova (frolla, crema, frangipane…) e quanta ne serve. Poi scrivi i passaggi di montaggio: le basi restano ricette a sé e si riscalano con la madre.</p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg-2">Come si chiama la nuova ricetta</span>
        <input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crostata moderna alle noci" />
      </label>
      {picks.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title text-lg">Basi scelte</h2>
          <ul className="space-y-2">
            {picks.map((p) => {
              const r = byId.get(p.recipeId)!
              return (
                <li key={p.recipeId} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium text-fg">{r.title}</span>
                  <input type="number" inputMode="decimal" step="any" min={0} className="w-24 py-1.5" aria-label={`Quantità di ${r.title}`} value={p.amount} onChange={(e) => setPicks(picks.map((x) => (x.recipeId === p.recipeId ? { ...x, amount: e.target.value } : x)))} />
                  <select className="py-1.5 text-sm" aria-label={`Unità di ${r.title}`} value={p.unit} onChange={(e) => setPicks(picks.map((x) => (x.recipeId === p.recipeId ? { ...x, unit: e.target.value as Unit } : x)))}>
                    <option value="">dosi</option>
                    {r.yield && isMassUnit(r.yield.unit as Unit) && <option value="g">g</option>}
                    {r.yield && isVolumeUnit(r.yield.unit as Unit) && <option value="ml">ml</option>}
                  </select>
                  <button className="btn-ghost h-10 w-10 p-0" aria-label={`Togli ${r.title}`} onClick={() => toggle(r)}>
                    <Icon name="close" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted">In grammi o millilitri la base si riscala sulla sua resa; a dosi vale la ricetta intera moltiplicata.</p>
        </section>
      )}
      <section className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Cerca una ricetta</span>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Cerca tra le tue ricette…" className="w-full pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="divide-y divide-line">
          {filtered.map((r) => {
            const on = picks.some((p) => p.recipeId === r.id)
            return (
              <li key={r.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                  <input type="checkbox" className="h-5 w-5 accent-accent" checked={on} onChange={() => toggle(r)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-fg">{r.title}</span>
                    <span className="block text-xs text-muted">
                      {r.ingredients.length} ingredienti{r.yield ? `, resa ${r.yield.amount} ${r.yield.unit}` : ', senza resa (a dosi)'}
                      {r.tags.length ? `, ${r.tags.join(', ')}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        {filtered.length === 0 && <p className="text-sm text-muted">Nessuna ricetta corrisponde.</p>}
      </section>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={picks.length === 0 || !title.trim()} onClick={go}>
          Continua con i passaggi <Icon name="right" size={16} />
        </button>
        <Link to="/" className="btn-secondary">
          Annulla
        </Link>
      </div>
    </div>
  )
}
