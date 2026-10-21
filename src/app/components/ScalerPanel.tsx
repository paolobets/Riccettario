import { useId, useRef, useState } from 'react'
import Icon from './Icon'
import {
  DOUGH_TYPES,
  doughTypeOf,
  doughWeight,
  factorFromPans,
  factorFromMolds,
  factorFromPieces,
  formatFactor,
  formatPan,
  formatQuantity,
  isFactorFeasible,
  MOLD_OVERFILL,
  MOLD_SIZES,
  moldedTypeOf,
  moldsFromDough,
  recipeDoughDensity,
  splitDough,
  suggestFeasibleFactors,
  type DoughType,
  type MoldCount,
  type Pan,
  type PanCount,
  type Recipe,
  type ScaledRecipe,
} from '@/core'

interface Props {
  recipe: Recipe
  scaled: ScaledRecipe
  onServings: (n: number) => void
  onYield: (n: number) => void
  onFactor: (f: number) => void
  onReset: () => void
}

/** La resa totale ha senso come comando solo se è una massa, un volume o un numero di pezzi > 1. */
function yieldIsEditable(recipe: Recipe): boolean {
  if (!recipe.yield) return false
  return /^(g|kg|ml|l)$/i.test(recipe.yield.unit.trim()) || recipe.yield.amount > 1
}

export default function ScalerPanel({ recipe, scaled, onServings, onYield, onFactor, onReset }: Props) {
  const [yieldInput, setYieldInput] = useState('')
  const servingsId = useId()
  const yieldId = useId()
  const servings = Math.round(scaled.servings * 100) / 100
  const feasible = isFactorFeasible(recipe, scaled.factor)
  const suggestions = feasible ? [] : suggestFeasibleFactors(recipe, scaled.factor).slice(0, 2)
  const isScaled = Math.abs(scaled.factor - 1) > 1e-9

  return (
    <section className="card space-y-3" aria-labelledby={`${servingsId}-title`}>
      <div className="flex items-center justify-between">
        <h2 id={`${servingsId}-title`} className="section-title text-lg">
          Dosi
        </h2>
        <div className="flex items-center gap-2">
          <span className={`chip ${isScaled ? '' : 'opacity-60'}`}>{formatFactor(scaled.factor)}</span>
          {isScaled && (
            <button className="btn-ghost min-h-9 px-2 py-1 text-sm" onClick={onReset}>
              Ripristina
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={servingsId} className="w-full text-sm text-muted min-[360px]:w-24">
          Porzioni
        </label>
        <button className="btn-secondary h-11 w-11 p-0 text-xl" onClick={() => onServings(Math.max(1, Math.round(servings) - 1))} aria-label="Meno porzioni">
          −
        </button>
        <input
          id={servingsId}
          type="number"
          min={1}
          step="any"
          className="qty h-11 w-20 text-center text-xl font-semibold"
          value={servings}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n > 0) onServings(n)
          }}
        />
        <button className="btn-secondary h-11 w-11 p-0 text-xl" onClick={() => onServings(Math.round(servings) + 1)} aria-label="Più porzioni">
          +
        </button>
      </div>

      {recipe.yield && yieldIsEditable(recipe) && (
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(yieldInput)
            if (n > 0) onYield(n)
            setYieldInput('')
          }}
        >
          <label htmlFor={yieldId} className="w-24 shrink-0 text-sm text-muted">
            Resa totale
          </label>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              id={yieldId}
              type="number"
              min={0}
              step="any"
              className="w-24 min-w-0"
              placeholder={String(Math.round(scaled.yield!.amount * 100) / 100)}
              value={yieldInput}
              onChange={(e) => setYieldInput(e.target.value)}
            />
            <span className="truncate text-sm text-muted">{recipe.yield.unit}</span>
          </div>
          <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" type="submit" disabled={!yieldInput}>
            Applica
          </button>
        </form>
      )}

      {moldedTypeOf(recipe) ? <MoldPlanner recipe={recipe} factor={scaled.factor} onFactor={onFactor} /> : <PanPlanner recipe={recipe} factor={scaled.factor} onFactor={onFactor} />}

      <p className="inline-flex items-start gap-1.5 text-xs text-muted">
        <Icon name="edit" size={14} className="mt-0.5" />
        <span>Tocca una quantità qui sotto e scrivi quanto ne hai: il resto si adatta.</span>
      </p>

      {suggestions.length > 0 && (
        <div className="notice bg-warning-soft text-warning">
          <p className="font-medium">Con questo fattore gli ingredienti a pezzi non tornano interi.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const name = recipe.ingredients.find((i) => i.id === s.ingredientId)?.name ?? s.ingredientId
              return (
                <button key={`${s.ingredientId}-${s.count}`} className="btn-secondary min-h-9 px-3 py-1 text-sm" onClick={() => onFactor(s.factor)}>
                  {s.count} {name} ({formatFactor(s.factor)})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {scaled.warnings.map((w) => (
        <p key={w} className="notice flex items-start gap-2 bg-warning-soft text-warning">
          <Icon name="alert" size={16} className="mt-0.5" /> <span>{w}</span>
        </p>
      ))}
    </section>
  )
}

interface PanRow {
  key: number
  count: string
  shape: Pan['shape']
  a: string
  b: string
}

function rowToPan(r: PanRow): PanCount | null {
  const count = Number(r.count)
  const a = Number(r.a)
  const b = Number(r.b)
  if (!(count > 0) || !(a > 0)) return null
  if (r.shape === 'round') return { pan: { shape: 'round', diameterCm: a }, count }
  return b > 0 ? { pan: { shape: 'rect', widthCm: a, lengthCm: b }, count } : null
}

const decimal = (n: number, digits = 2) => n.toLocaleString('it-IT', { maximumFractionDigits: digits })
const grams = (g: number) => formatQuantity({ amount: Math.round(g / 5) * 5, unit: 'g' })

/**
 * Teglie e pizze: una o più teglie (1 da 40×40, oppure 2 da 15×25) o un numero di
 * panetti. Compare se la ricetta ha una teglia o è un impasto da teglia.
 */
function PanPlanner({ recipe, factor, onFactor }: { recipe: Recipe; factor: number; onFactor: (f: number) => void }) {
  const type = doughTypeOf(recipe)
  const dough = doughWeight(recipe)
  const ownDensity = recipeDoughDensity(recipe)
  const nextKey = useRef(1)
  const [rows, setRows] = useState<PanRow[]>(() => [{ key: 0, count: '1', shape: recipe.pan?.shape ?? 'rect', a: '', b: '' }])
  const [kind, setKind] = useState<DoughType | ''>(type ?? 'pizzaTeglia')
  const [density, setDensity] = useState(() => decimal(DOUGH_TYPES[type ?? 'pizzaTeglia'].gPerCm2))
  const [applied, setApplied] = useState<{ pans: PanCount[]; factor: number } | null>(null)
  const [pieces, setPieces] = useState('')
  const [pieceGrams, setPieceGrams] = useState('250')
  const id = useId()
  if (!recipe.pan && !(type && dough)) return null

  const pans = rows.map(rowToPan)
  const ready = pans.length > 0 && pans.every(Boolean)
  const gPerCm2 = Number(density.replace(',', '.'))
  const update = (key: number, patch: Partial<PanRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const showSplit = applied && Math.abs(applied.factor - factor) < 1e-3 && dough

  return (
    <div className="rule space-y-3 pt-3">
      <form
        className="space-y-2"
        aria-labelledby={`${id}-pan`}
        onSubmit={(e) => {
          e.preventDefault()
          const chosen = pans.filter((p): p is PanCount => Boolean(p))
          const f = factorFromPans(recipe, chosen, gPerCm2)
          if (!f) return
          onFactor(f)
          setApplied({ pans: chosen, factor: f })
        }}
      >
        <p id={`${id}-pan`} className="text-sm text-muted">
          Teglie
        </p>
        {rows.map((r, idx) => (
          <div key={r.key} className="flex flex-wrap items-center gap-1.5">
            <input type="number" min={1} step={1} className="w-12 shrink-0 px-1 py-1.5 text-center" aria-label={`Numero di teglie, riga ${idx + 1}`} value={r.count} onChange={(e) => update(r.key, { count: e.target.value })} />
            <select className="w-30 shrink-0 px-2 py-1.5 text-sm" aria-label={`Forma, riga ${idx + 1}`} value={r.shape} onChange={(e) => update(r.key, { shape: e.target.value as Pan['shape'] })}>
              <option value="rect">rettangolare</option>
              <option value="round">tonda</option>
            </select>
            <div className="flex min-w-40 flex-1 items-center gap-1.5">
            <input type="number" min={1} step="any" className="min-w-0 flex-1 px-2 py-1.5" aria-label={r.shape === 'round' ? `Diametro in centimetri, riga ${idx + 1}` : `Lato in centimetri, riga ${idx + 1}`} placeholder={r.shape === 'round' ? 'Ø cm' : 'cm'} value={r.a} onChange={(e) => update(r.key, { a: e.target.value })} />
            {r.shape === 'rect' && (
              <>
                <span className="text-muted" aria-hidden="true">
                  ×
                </span>
                <input type="number" min={1} step="any" className="min-w-0 flex-1 px-2 py-1.5" aria-label={`Altro lato in centimetri, riga ${idx + 1}`} placeholder="cm" value={r.b} onChange={(e) => update(r.key, { b: e.target.value })} />
              </>
            )}
            {rows.length > 1 && (
              <button type="button" className="btn-ghost h-9 w-9 shrink-0 p-0" aria-label={`Togli la riga ${idx + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Icon name="close" size={16} />
              </button>
            )}
            </div>
          </div>
        ))}
        {!recipe.pan && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-kind`} className="sr-only">
              Tipo di impasto
            </label>
            <select
              id={`${id}-kind`}
              className="min-w-0 flex-1 px-2 py-1.5 text-sm"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DoughType | ''
                setKind(k)
                if (k) setDensity(decimal(DOUGH_TYPES[k].gPerCm2))
              }}
            >
              {(Object.keys(DOUGH_TYPES) as DoughType[]).map((k) => (
                <option key={k} value={k}>
                  {DOUGH_TYPES[k].label}
                </option>
              ))}
              <option value="">altro spessore</option>
            </select>
            <input
              id={`${id}-density`}
              inputMode="decimal"
              aria-label="Grammi di impasto per centimetro quadrato"
              className="w-20 min-w-0 px-2 py-1.5 text-center"
              value={density}
              onChange={(e) => {
                setDensity(e.target.value)
                setKind('')
              }}
            />
            <span className="text-sm text-muted">g per cm²</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost min-h-9 px-2 py-1 text-sm" onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, count: '1', shape: rs[rs.length - 1]?.shape ?? 'rect', a: '', b: '' }])}>
            <Icon name="plus" size={16} /> Aggiungi teglia
          </button>
          <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" type="submit" disabled={!ready || (!recipe.pan && !(gPerCm2 > 0))}>
            Applica
          </button>
        </div>
        <p className="text-xs text-muted">
          {recipe.pan
            ? `La ricetta è per una teglia ${formatPan(recipe.pan)}${ownDensity ? `, circa ${decimal(ownDensity)} g di impasto per cm²` : ''}: le dosi seguono l'area totale, lo spessore resta uguale.`
            : `Impasto = area della teglia × grammi per cm² (indice di carico), qui su ${grams(dough!)} di impasto della ricetta. Più alto il valore, più alta la pizza: correggi a gusto.`}
        </p>
        {showSplit && (
          <ul className="space-y-0.5 text-sm" aria-label="Impasto per teglia">
            {splitDough(dough * factor, applied.pans).map((p, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Icon name="pan" size={14} className="text-muted" />
                <span>
                  {p.count > 1 ? `${p.count} teglie ${formatPan(p.pan)}: ` : `Teglia ${formatPan(p.pan)}: `}
                  <span className="qty">{grams(p.grams)}</span> di impasto{p.count > 1 ? ' ciascuna' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      {type && dough && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const f = factorFromPieces(recipe, Number(pieces), Number(pieceGrams))
            if (f) onFactor(f)
          }}
        >
          <label htmlFor={`${id}-pieces`} className="text-sm text-muted">
            {type === 'focaccia' ? 'Panetti' : type === 'pinsa' ? 'Pinse' : 'Pizze'}
          </label>
          <input id={`${id}-pieces`} type="number" min={1} step={1} className="w-16 min-w-0 px-2 py-1.5 text-center" value={pieces} placeholder={String(Math.max(1, Math.round(dough / Number(pieceGrams || 250))))} onChange={(e) => setPieces(e.target.value)} />
          <label htmlFor={`${id}-grams`} className="text-sm text-muted">
            da
          </label>
          <input id={`${id}-grams`} type="number" min={1} step="any" className="w-20 min-w-0 px-2 py-1.5 text-center" value={pieceGrams} onChange={(e) => setPieceGrams(e.target.value)} />
          <span className="text-sm text-muted">g</span>
          <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" type="submit" disabled={!(Number(pieces) > 0 && Number(pieceGrams) > 0)}>
            Applica
          </button>
        </form>
      )}
    </div>
  )
}

const MOLD_NAMES = { panettone: ['panettone', 'panettoni'], pandoro: ['pandoro', 'pandori'], colomba: ['colomba', 'colombe'] } as const

const moldLabel = (g: number) => (g >= 1000 ? `${decimal(g / 1000)} kg` : `${g} g`)

/**
 * Panettone, pandoro e colomba: si ragiona in stampi venduti per peso del prodotto
 * finito, con il 10 % di impasto in più per il calo in cottura.
 */
function MoldPlanner({ recipe, factor, onFactor }: { recipe: Recipe; factor: number; onFactor: (f: number) => void }) {
  const type = moldedTypeOf(recipe)!
  const dough = doughWeight(recipe)
  const nextKey = useRef(1)
  const [rows, setRows] = useState<{ key: number; count: string; grams: number }[]>([{ key: 0, count: '1', grams: 1000 }])
  const id = useId()
  if (!dough) return null

  const [one, many] = MOLD_NAMES[type]
  const molds: MoldCount[] = rows.map((r) => ({ grams: r.grams, count: Number(r.count) }))
  const ready = molds.length > 0 && molds.every((m) => m.count > 0)
  const current = dough * factor
  const fits = ([1000, 750, 500] as const).map((g) => ({ g, ...moldsFromDough(current, g) })).filter((f) => f.count > 0)
  const update = (key: number, patch: Partial<{ count: string; grams: number }>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <form
      className="rule space-y-2 pt-3"
      aria-labelledby={`${id}-molds`}
      onSubmit={(e) => {
        e.preventDefault()
        const f = factorFromMolds(recipe, molds)
        if (f) onFactor(f)
      }}
    >
      <p id={`${id}-molds`} className="text-sm text-muted">
        Stampi
      </p>
      {rows.map((r, idx) => (
        <div key={r.key} className="flex items-center gap-1.5">
          <input type="number" min={1} step={1} className="w-14 shrink-0 px-1 py-1.5 text-center" aria-label={`Numero di stampi, riga ${idx + 1}`} value={r.count} onChange={(e) => update(r.key, { count: e.target.value })} />
          <label htmlFor={`${id}-size-${r.key}`} className="text-sm text-muted">
            da
          </label>
          <select id={`${id}-size-${r.key}`} className="w-28 shrink-0 px-2 py-1.5 text-sm" value={r.grams} onChange={(e) => update(r.key, { grams: Number(e.target.value) })}>
            {MOLD_SIZES.map((g) => (
              <option key={g} value={g}>
                {moldLabel(g)}
              </option>
            ))}
          </select>
          {rows.length > 1 && (
            <button type="button" className="btn-ghost h-9 w-9 shrink-0 p-0" aria-label={`Togli la riga ${idx + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost min-h-9 px-2 py-1 text-sm" onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, count: '1', grams: 500 }])}>
          <Icon name="plus" size={16} /> Aggiungi stampo
        </button>
        <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" type="submit" disabled={!ready}>
          Applica
        </button>
      </div>
      <p className="text-sm">
        Con queste dosi hai <span className="qty">{grams(current)}</span> di impasto
        {fits.length > 0 ? `: ${fits.map((f) => `${f.count} ${f.count > 1 ? many : one} da ${moldLabel(f.g)}`).join(', oppure ')}.` : `, meno di uno stampo da 500 g.`}
      </p>
      <p className="text-xs text-muted">Lo stampo indica il peso del prodotto finito: si mette il {Math.round(MOLD_OVERFILL * 100)} % di impasto in più, che si perde in cottura (1 kg di stampo, 1,1 kg di impasto).</p>
    </form>
  )
}
