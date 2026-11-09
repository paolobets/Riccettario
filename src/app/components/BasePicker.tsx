import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { baseFactor, baseUnits, isBase, pickerQuantity, wouldCycle, type Quantity, type Recipe, type Unit } from '@/core'
import Icon from './Icon'

interface Props {
  recipes: Recipe[]
  /** La ricetta in cui si copia: esclusa dall'elenco, insieme alle Basi che la contengono. */
  currentId: string
  /** Quantità della riga da sostituire. */
  initial?: Quantity
  /** Vero se si sta sostituendo una riga: senza una quantità usabile il campo resta vuoto e la si chiede. */
  replacing?: boolean
  /** Titolo del dialogo: "Aggiungi una Base" o "Sostituisci «crema» con una Base". */
  title: string
  onPick: (base: Recipe, quantity: Quantity) => void
  onClose: () => void
}

/** Dialogo per scegliere una Base e quanta copiarne. */
export default function BasePicker({ recipes, currentId, initial, replacing = false, title, onPick, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Recipe | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<Unit>('')

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const bases = useMemo(
    () =>
      recipes
        .filter((r) => isBase(r) && !wouldCycle(recipes, currentId, r.id))
        .filter((r) => !query.trim() || r.title.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title, 'it')),
    [recipes, currentId, query],
  )
  const choose = (b: Recipe) => {
    setChosen(b)
    const q = pickerQuantity(b, initial, replacing)
    setAmount(q.amount)
    setUnit(q.unit)
  }
  const quantity: Quantity = { amount: Number(amount.replace(',', '.')), unit }
  const check = chosen ? baseFactor(quantity, chosen) : null

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="base-picker-title"
      className="w-full max-w-lg"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <h2 id="base-picker-title" className="section-title text-xl">
        {title}
      </h2>
      {!chosen ? (
        <div className="mt-3 space-y-2">
          <label className="relative block">
            <span className="sr-only">Cerca una Base</span>
            <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input type="search" autoFocus placeholder="Cerca tra le Basi…" className="w-full pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {bases.length === 0 ? (
            <p className="text-sm text-muted">{query.trim() ? 'Nessuna Base corrisponde.' : 'Nessuna Base: segna una ricetta come Base dalla sua pagina.'}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {bases.map((b) => (
                <li key={b.id}>
                  <button type="button" className="flex min-h-12 w-full flex-col items-start rounded-md px-2 py-2 text-left hover:bg-surface-2" onClick={() => choose(b)}>
                    <span className="text-fg">{b.title}</span>
                    <span className="text-xs text-muted">
                      {b.ingredients.length} ingredienti{b.yield ? `, resa ${b.yield.amount} ${b.yield.unit}` : ', senza resa (a dosi)'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (check?.factor) onPick(chosen, quantity)
          }}
        >
          <p className="text-fg-2">
            «{chosen.title}»{chosen.yield ? `, resa ${chosen.yield.amount} ${chosen.yield.unit}` : ''}. Quanta ne serve?
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              autoFocus
              className="w-28"
              aria-label={`Quantità di ${chosen.title}`}
              aria-invalid={check?.factor === null}
              aria-describedby={check?.problem ? 'base-picker-problem' : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select aria-label="Unità" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {baseUnits(chosen).map((u) => (
                <option key={u} value={u}>
                  {u === '' ? 'dosi' : u}
                </option>
              ))}
            </select>
          </div>
          {check?.problem && amount.trim() !== '' && (
            <p id="base-picker-problem" className="text-sm text-danger">
              {check.problem}
            </p>
          )}
          <p className="text-xs text-muted">Ingredienti e passaggi vengono copiati nella ricetta, scalati: poi li puoi modificare senza toccare la Base.</p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setChosen(null)}>
              <Icon name="left" size={16} /> Altra Base
            </button>
            <button type="submit" className="btn-primary" disabled={!check?.factor}>
              Copia la Base
            </button>
          </div>
        </form>
      )}
      {!chosen && (
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      )}
    </dialog>,
    document.body,
  )
}
