import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { clearShoppingList, removeFromShoppingList, setShoppingChecked, SHOPPING_LIST_ID } from '@/data/repo'
import { buildShoppingList, formatFactor, formatQuantity, shoppingListText, type Recipe } from '@/core'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'

/** Lista della spesa: le ricette scelte, con le loro porzioni, sommate in un'unica lista spuntabile. */
export default function ShoppingPage() {
  // `null` quando la lista non esiste ancora: `undefined` vorrebbe dire "sto ancora leggendo".
  const list = useLiveQuery(async () => (await db.lists.get(SHOPPING_LIST_ID)) ?? null, [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
  const [message, setMessage] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const entries = useMemo(() => {
    if (!list || !recipes) return []
    const byId = new Map(recipes.map((r) => [r.id, r]))
    return list.entries.map((e) => ({ recipe: byId.get(e.recipeId), factor: e.factor })).filter((e): e is { recipe: Recipe; factor: number } => Boolean(e.recipe))
  }, [list, recipes])
  const lines = useMemo(() => buildShoppingList(entries), [entries])
  // Spunte in stato locale, aggiornate subito; il database segue.
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const storedChecked = list?.checked
  useEffect(() => setChecked(new Set(storedChecked ?? [])), [storedChecked])

  if (list === undefined || !recipes) return null
  const toTake = lines.filter((l) => !checked.has(l.key))
  const taken = lines.filter((l) => checked.has(l.key))

  const toggle = (key: string) => {
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChecked(next)
    void setShoppingChecked([...next])
  }

  const copy = async () => {
    const text = shoppingListText(lines, checked)
    try {
      if (navigator.share && /Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ title: 'Lista della spesa', text })
        return
      }
      await navigator.clipboard.writeText(text)
      setMessage('Lista copiata: incollala in un messaggio o nelle note.')
    } catch {
      setMessage('Non sono riuscito a copiare: seleziona il testo a mano.')
    }
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-medium text-fg">Lista della spesa</h1>
        {lines.length > 0 && (
          <button className="btn-secondary shrink-0" onClick={copy}>
            <Icon name="share" size={16} /> Copia
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-10 text-center text-muted">
          <Icon name="cart" size={40} className="mx-auto mb-3 text-muted" />
          <p className="font-medium text-fg">La lista è vuota.</p>
          <p className="mt-1 text-sm">Apri una ricetta, imposta le porzioni e tocca «Aggiungi alla spesa»: gli ingredienti di più ricette si sommano qui.</p>
          <Link to="/" className="btn-primary mt-3">
            Vai alle ricette
          </Link>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="section-title text-lg">Ricette</h2>
            <ul className="flex flex-wrap gap-2">
              {entries.map(({ recipe, factor }) => (
                <li key={recipe.id} className="chip min-h-10 gap-2 py-1 pr-1 pl-3 text-sm">
                  <Link to={`/ricetta/${recipe.id}${Math.abs(factor - 1) > 1e-9 ? `?f=${factor}` : ''}`} className="hover:underline">
                    {recipe.title}, {(recipe.servings * factor).toLocaleString('it-IT', { maximumFractionDigits: 1 })} porzioni{Math.abs(factor - 1) > 1e-9 ? ` (${formatFactor(factor)})` : ''}
                  </Link>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-3" aria-label={`Togli ${recipe.title} dalla lista`} onClick={() => removeFromShoppingList(recipe.id)}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rule pt-4">
            <h2 className="section-title mb-2 text-lg">Da prendere</h2>
            {toTake.length === 0 ? (
              <p className="text-sm text-muted">Hai preso tutto.</p>
            ) : (
              <ul className="divide-y divide-line">
                {toTake.map((l) => (
                  <Line key={l.key} line={l} checked={false} onToggle={() => toggle(l.key)} />
                ))}
              </ul>
            )}
          </section>

          {taken.length > 0 && (
            <section className="rule pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="section-title text-lg">Già nel carrello</h2>
                <button
                  className="btn-ghost min-h-9 px-2 py-1 text-sm"
                  onClick={() => {
                    setChecked(new Set())
                    void setShoppingChecked([])
                  }}
                >
                  Rimetti tutto da prendere
                </button>
              </div>
              <ul className="divide-y divide-line">
                {taken.map((l) => (
                  <Line key={l.key} line={l} checked onToggle={() => toggle(l.key)} />
                ))}
              </ul>
            </section>
          )}

          {message && (
            <p className="text-sm text-fg-2" role="status">
              {message}
            </p>
          )}
          <div className="rule pt-4">
            <button
              className="btn-ghost text-danger"
              onClick={async () => {
                const ok = await confirm({ title: 'Svuotare la lista?', body: 'Le ricette scelte e le spunte vengono tolte. Le ricette restano nel ricettario.', confirmLabel: 'Svuota', cancelLabel: 'Tieni la lista', danger: true })
                if (ok) await clearShoppingList()
              }}
            >
              <Icon name="trash" size={16} /> Svuota la lista
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Line({ line, checked, onToggle }: { line: ReturnType<typeof buildShoppingList>[number]; checked: boolean; onToggle: () => void }) {
  const titles = [...new Set(line.sources.map((s) => s.title))]
  return (
    <li>
      <label className={`flex min-h-12 cursor-pointer items-start gap-3 py-2 ${checked ? 'text-muted' : 'text-fg'}`}>
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent" checked={checked} onChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className={checked ? 'line-through' : ''}>
            {line.quantity && <span className="qty font-semibold">{formatQuantity(line.quantity)} </span>}
            {line.name}
            {line.toTaste ? <span className="text-muted">, q.b.</span> : null}
            {line.optional ? <span className="text-muted">, facoltativo</span> : null}
          </span>
          {titles.length > 1 && <span className="block text-xs text-muted">{titles.join(', ')}</span>}
        </span>
      </label>
    </li>
  )
}
