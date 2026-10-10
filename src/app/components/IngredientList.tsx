import { useEffect, useState } from 'react'
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
import Icon from './Icon'

interface Props {
  scaled: ScaledRecipe
  onPivot?: (ingredientId: string, amountInBaseUnit: number) => PivotResult
  checkable?: boolean
  /** Se dato, le spunte sopravvivono al ricaricamento della pagina (sessionStorage). */
  storageKey?: string
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

function loadChecked(key?: string): Set<string> {
  if (!key) return new Set()
  try {
    const raw = sessionStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

/** Un ingrediente può fare da pivot solo se la sua quantità scala davvero. */
function isPivotable(ing: ScaledIngredient): boolean {
  return Boolean(ing.scaled) && ing.scaled!.unit !== 'q.b.' && ing.scaling?.mode !== 'fixed' && ing.scaling?.mode !== 'toTaste'
}

export default function IngredientList({ scaled, onPivot, checkable, storageKey }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(() => loadChecked(storageKey))
  const isScaled = Math.abs(scaled.factor - 1) > 1e-9

  useEffect(() => {
    if (!storageKey) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...checked]))
    } catch {
      // storage non disponibile
    }
  }, [checked, storageKey])

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

  const toggle = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  return (
    <div className="space-y-4">
      {groupBySection(scaled.ingredients).map(([section, items]) => (
        <div key={section ?? '_'}>
          {section && <h3 className="mb-1 text-sm font-semibold text-accent-text">{section}</h3>}
          <ul className="divide-y divide-line">
            {items.map((ing) => {
              const isEditing = editing === ing.id
              const d = ing.scaled ? toDisplayUnit(ing.scaled) : undefined
              const done = checked.has(ing.id)
              const pivotable = Boolean(onPivot) && isPivotable(ing)
              const showOriginal = isScaled && ing.original && ing.scaled && isPivotable(ing)
              const Row = checkable ? 'label' : 'div'
              return (
                <li key={ing.id}>
                  <Row className={`flex items-start gap-3 ${checkable ? 'cursor-pointer py-3' : 'py-2'} ${done ? 'opacity-50' : ''}`}>
                    {checkable && (
                      <input
                        type="checkbox"
                        className="mt-0.5 h-6 w-6 shrink-0 accent-accent"
                        checked={done}
                        onChange={() => toggle(ing.id)}
                        aria-label={`${ing.name}${d ? `, ${formatQuantity(d)}` : ''}`}
                      />
                    )}
                    <div className="w-30 shrink-0 text-right">
                      {d && !isEditing && pivotable && (
                        <button
                          className="qty inline-flex min-h-8 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[17px] leading-tight font-semibold text-accent-text transition hover:bg-accent-soft"
                          onClick={() => startEdit(ing)}
                          aria-label={`Cambia la quantità di ${ing.name}, ora ${formatQuantity(d)}`}
                          title={ing.warning ?? 'Scrivi quanto ne hai: il resto si adatta'}
                        >
                          <span className={ing.adjusted ? 'text-warning' : ''}>{formatQuantity(d)}</span>
                          <Icon name="edit" size={12} className="text-muted" />
                        </button>
                      )}
                      {d && !isEditing && !pivotable && (
                        <span className={`qty inline-block px-1.5 py-0.5 text-[17px] leading-tight font-semibold ${ing.adjusted ? 'text-warning' : 'text-fg'}`} title={ing.warning}>
                          {formatQuantity(d)}
                        </span>
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
                            aria-label={`Quantità di ${ing.name} in ${formatUnit(d.unit, 2) || 'pezzi'}`}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={() => commit(ing)}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          />
                          <span className="text-xs text-muted">{formatUnit(d.unit, 2)}</span>
                        </form>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className={done ? 'line-through' : ''}>
                        {ing.name}
                        {ing.optional && <span className="text-muted"> (facoltativo)</span>}
                      </span>
                      {ing.note && <span className="text-sm text-muted">, {ing.note}</span>}
                      {ing.adjusted && ing.warning && <p className="text-xs text-warning">{ing.warning}</p>}
                      {isEditing && error && <p className="text-xs text-danger">{error}</p>}
                      {showOriginal && (
                        <p className="text-xs text-muted">
                          prima {formatAmount(toDisplayUnit(ing.original!).amount, toDisplayUnit(ing.original!).unit)}{' '}
                          {formatUnit(toDisplayUnit(ing.original!).unit, toDisplayUnit(ing.original!).amount)}
                        </p>
                      )}
                    </div>
                  </Row>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
