import { useState } from 'react'
import {
  formatAmount,
  formatQuantity,
  formatUnit,
  toDisplayUnit,
  toBase,
  type ScaledIngredient,
  type ScaledRecipe,
  type PivotResult,
} from '@/core'

interface Props {
  scaled: ScaledRecipe
  onPivot?: (ingredientId: string, amountInBaseUnit: number) => PivotResult
  checkable?: boolean
}

function groupBySection(items: ScaledIngredient[]): Array<[string | undefined, ScaledIngredient[]]> {
  const map = new Map<string | undefined, ScaledIngredient[]>()
  for (const i of items) {
    const list = map.get(i.section) ?? []
    list.push(i)
    map.set(i.section, list)
  }
  return [...map.entries()]
}

export default function IngredientList({ scaled, onPivot, checkable }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const startEdit = (ing: ScaledIngredient) => {
    if (!onPivot || !ing.scaled) return
    const d = toDisplayUnit(ing.scaled)
    setEditing(ing.id)
    setValue(String(Math.round(d.amount * 100) / 100))
    setError(null)
  }

  const commit = (ing: ScaledIngredient) => {
    if (!onPivot || !ing.scaled) return
    const n = Number(value.replace(',', '.'))
    if (!(n > 0)) {
      setEditing(null)
      return
    }
    // l'utente scrive nell'unità visualizzata (kg/l), riportiamo in base
    const displayUnit = toDisplayUnit(ing.scaled).unit
    const inBase = toBase({ amount: n, unit: displayUnit }).amount
    const r = onPivot(ing.id, inBase)
    if (!r.ok) setError(r.reason)
    else setEditing(null)
  }

  return (
    <div className="space-y-4">
      {groupBySection(scaled.ingredients).map(([section, items]) => (
        <div key={section ?? '_'}>
          {section && <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand-800">{section}</h3>}
          <ul className="divide-y divide-stone-100">
            {items.map((ing) => {
              const isEditing = editing === ing.id
              const d = ing.scaled ? toDisplayUnit(ing.scaled) : undefined
              const done = checked.has(ing.id)
              return (
                <li key={ing.id} className={`flex items-start gap-3 py-2 ${done ? 'opacity-50' : ''}`}>
                  {checkable && (
                    <input
                      type="checkbox"
                      className="mt-1.5 h-5 w-5 accent-brand-700"
                      checked={done}
                      onChange={() => {
                        const next = new Set(checked)
                        if (done) next.delete(ing.id)
                        else next.add(ing.id)
                        setChecked(next)
                      }}
                    />
                  )}
                  <div className="w-28 shrink-0 text-right">
                    {d && !isEditing && (
                      <button
                        className={`rounded px-1 font-semibold tabular-nums ${onPivot && ing.scaling?.mode !== 'fixed' && ing.scaling?.mode !== 'toTaste' ? 'text-brand-800 underline decoration-dotted hover:bg-brand-100' : 'text-stone-800'} ${ing.adjusted ? 'text-amber-700' : ''}`}
                        onClick={() => startEdit(ing)}
                        disabled={!onPivot}
                        title={ing.warning}
                      >
                        {formatQuantity(d)}
                      </button>
                    )}
                    {d && isEditing && (
                      <form
                        className="flex items-center justify-end gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          commit(ing)
                        }}
                      >
                        <input
                          autoFocus
                          inputMode="decimal"
                          className="w-20 px-2 py-1 text-right"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          onBlur={() => commit(ing)}
                          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                        />
                        <span className="text-xs text-stone-500">{formatUnit(d.unit, 2)}</span>
                      </form>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={done ? 'line-through' : ''}>
                      {ing.name}
                      {ing.optional && <span className="text-stone-500"> (facoltativo)</span>}
                    </span>
                    {ing.note && <span className="text-sm text-stone-500">, {ing.note}</span>}
                    {ing.adjusted && ing.warning && <p className="text-xs text-amber-700">{ing.warning}</p>}
                    {isEditing && error && <p className="text-xs text-red-700">{error}</p>}
                    {ing.original && ing.scaled && Math.abs(scaled.factor - 1) > 1e-9 && (
                      <p className="text-xs text-stone-400">
                        originale {formatAmount(toDisplayUnit(ing.original).amount, toDisplayUnit(ing.original).unit)} {formatUnit(toDisplayUnit(ing.original).unit, toDisplayUnit(ing.original).amount)}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
