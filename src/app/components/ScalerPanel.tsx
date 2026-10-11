import { useId, useState } from 'react'
import Icon from './Icon'
import { factorFromPan, formatFactor, formatPan, isFactorFeasible, suggestFeasibleFactors, type Pan, type Recipe, type ScaledRecipe } from '@/core'

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
  const [panShape, setPanShape] = useState<Pan['shape']>(recipe.pan?.shape ?? 'round')
  const [panA, setPanA] = useState('')
  const [panB, setPanB] = useState('')
  const panId = useId()
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

      {recipe.pan && (
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault()
            const a = Number(panA)
            const b = Number(panB)
            const target: Pan | null = panShape === 'round' ? (a > 0 ? { shape: 'round', diameterCm: a } : null) : a > 0 && b > 0 ? { shape: 'rect', widthCm: a, lengthCm: b } : null
            const f = target ? factorFromPan(recipe, target) : null
            if (f) onFactor(f)
          }}
        >
          <div className="flex items-center gap-3">
            <label htmlFor={panId} className="w-24 shrink-0 text-sm text-muted">
              Teglia
            </label>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <select id={panId} className="min-w-0 py-1.5 text-sm" value={panShape} onChange={(e) => setPanShape(e.target.value as Pan['shape'])}>
                <option value="round">tonda</option>
                <option value="rect">rettangolare</option>
              </select>
              <input type="number" min={1} step="any" className="w-20 min-w-0 py-1.5" aria-label={panShape === 'round' ? 'Diametro in centimetri' : 'Lato in centimetri'} placeholder={panShape === 'round' ? 'Ø cm' : 'cm'} value={panA} onChange={(e) => setPanA(e.target.value)} />
              {panShape === 'rect' && <input type="number" min={1} step="any" className="w-20 min-w-0 py-1.5" aria-label="Altro lato in centimetri" placeholder="cm" value={panB} onChange={(e) => setPanB(e.target.value)} />}
              <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" type="submit" disabled={!panA || (panShape === 'rect' && !panB)}>
                Applica
              </button>
            </div>
          </div>
          <p className="pl-27 text-xs text-muted">La ricetta è per una teglia {formatPan(recipe.pan)}: il fattore segue il rapporto tra le aree, lo spessore resta uguale.</p>
        </form>
      )}

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
