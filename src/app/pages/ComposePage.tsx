import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { copyBaseInto, isBase, isMassUnit, isVolumeUnit, newId, type Recipe, type Unit } from '@/core'
import Icon from '../components/Icon'

interface Pick {
  baseId: string
  amount: string
  unit: Unit
}

/** "Componi da Basi": scegli le Basi e quanta ne serve; vengono copiate nella ricetta nuova, poi il wizard per il montaggio. */
export default function ComposePage() {
  const navigate = useNavigate()
  const recipes = useLiveQuery(() => db.recipes.orderBy('title').toArray(), [])
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (recipes ?? []).filter((r) => isBase(r) && (!q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q))))
  }, [recipes, query])
  if (!recipes) return null
  const byId = new Map(recipes.map((r) => [r.id, r]))

  const toggle = (r: Recipe) => {
    if (picks.some((p) => p.baseId === r.id)) {
      setPicks(picks.filter((p) => p.baseId !== r.id))
      return
    }
    const y = r.yield?.unit as Unit | undefined
    const unit: Unit = y && isMassUnit(y) ? 'g' : y && isVolumeUnit(y) ? 'ml' : ''
    setPicks([...picks, { baseId: r.id, unit, amount: unit ? String(r.yield!.amount) : '1' }])
  }

  const go = () => {
    const now = new Date().toISOString()
    let recipe: Recipe = { id: newId('r'), title: title.trim(), servings: 8, tags: [], ingredients: [], steps: [], createdAt: now, updatedAt: now }
    for (const p of picks) {
      const base = byId.get(p.baseId)!
      const amount = Number(p.amount.replace(',', '.'))
      const res = copyBaseInto(recipe, base, { amount, unit: p.unit })
      if (!res.ok) {
        setProblem(`${base.title}: ${res.problem}`)
        return
      }
      recipe = res.recipe
    }
    navigate('/ricetta/nuova', { state: { recipe, startPhase: 0, composed: true } })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Componi da Basi</h1>
      <p className="text-sm text-muted">Scegli le Basi che entrano nella nuova ricetta (frolla, crema, frangipane…) e quanta ne serve. Ingredienti e passaggi vengono copiati nella ricetta, ognuna nella sua sezione: poi li puoi modificare e scrivere il montaggio.</p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg-2">Come si chiama la nuova ricetta</span>
        <input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crostata moderna alle noci" />
      </label>
      {picks.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title text-lg">Basi scelte</h2>
          <ul className="space-y-2">
            {picks.map((p) => {
              const r = byId.get(p.baseId)!
              return (
                <li key={p.baseId} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium text-fg">{r.title}</span>
                  <input type="number" inputMode="decimal" step="any" min={0} className="w-24 py-1.5" aria-label={`Quantità di ${r.title}`} value={p.amount} onChange={(e) => setPicks(picks.map((x) => (x.baseId === p.baseId ? { ...x, amount: e.target.value } : x)))} />
                  <select className="py-1.5 text-sm" aria-label={`Unità di ${r.title}`} value={p.unit} onChange={(e) => setPicks(picks.map((x) => (x.baseId === p.baseId ? { ...x, unit: e.target.value as Unit } : x)))}>
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
          <p className="text-xs text-muted">In grammi o millilitri la Base si riscala sulla sua resa; a dosi vale la ricetta intera moltiplicata.</p>
        </section>
      )}
      <section className="space-y-2">
        <label className="relative block">
          <span className="sr-only">Cerca una Base</span>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Cerca tra le tue Basi…" className="w-full pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="divide-y divide-line">
          {filtered.map((r) => {
            const on = picks.some((p) => p.baseId === r.id)
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
        {filtered.length === 0 && <p className="text-sm text-muted">{query.trim() ? 'Nessuna Base corrisponde.' : 'Nessuna Base: segna una ricetta come Base dalla sua pagina.'}</p>}
      </section>
      {problem && (
        <p className="notice flex items-start gap-2 bg-warning-soft text-warning" role="alert">
          <Icon name="alert" size={16} className="mt-0.5" /> <span>{problem}</span>
        </p>
      )}
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
