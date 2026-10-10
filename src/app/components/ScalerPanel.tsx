import { useState } from 'react'
import Icon from './Icon'
import { formatFactor, isFactorFeasible, suggestFeasibleFactors, type Recipe, type ScaledRecipe } from '@/core'

interface Props {
  recipe: Recipe
  scaled: ScaledRecipe
  onServings: (n: number) => void
  onYield: (n: number) => void
  onFactor: (f: number) => void
  onReset: () => void
}

export default function ScalerPanel({ recipe, scaled, onServings, onYield, onFactor, onReset }: Props) {
  const [yieldInput, setYieldInput] = useState('')
  const servings = Math.round(scaled.servings * 100) / 100
  const feasible = isFactorFeasible(recipe, scaled.factor)
  const suggestions = feasible ? [] : suggestFeasibleFactors(recipe, scaled.factor).slice(0, 2)
  const isScaled = Math.abs(scaled.factor - 1) > 1e-9

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="label-caps">Quantità</h2>
        <div className="flex items-center gap-2">
          <span className={`chip ${isScaled ? '' : 'opacity-60'}`}>{formatFactor(scaled.factor)}</span>
          {isScaled && (
            <button className="btn-ghost px-2 py-1 text-sm" onClick={onReset}>
              Ripristina
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-24 text-sm text-muted">Porzioni</span>
        <button className="btn-secondary h-10 w-10 p-0 text-xl" onClick={() => onServings(Math.max(1, Math.round(servings) - 1))} aria-label="Meno porzioni">
          −
        </button>
        <input
          type="number"
          min={1}
          step="any"
          className="w-20 text-center text-lg font-semibold"
          value={servings}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n > 0) onServings(n)
          }}
        />
        <button className="btn-secondary h-10 w-10 p-0 text-xl" onClick={() => onServings(Math.round(servings) + 1)} aria-label="Più porzioni">
          +
        </button>
      </div>

      {recipe.yield && (
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(yieldInput)
            if (n > 0) onYield(n)
            setYieldInput('')
          }}
        >
          <span className="w-24 text-sm text-muted">Resa totale</span>
          <input
            type="number"
            min={0}
            step="any"
            className="w-28"
            placeholder={String(Math.round(scaled.yield!.amount * 100) / 100)}
            value={yieldInput}
            onChange={(e) => setYieldInput(e.target.value)}
          />
          <span className="text-sm text-muted">{recipe.yield.unit}</span>
          <button className="btn-secondary px-3 py-1.5 text-sm" type="submit" disabled={!yieldInput}>
            Applica
          </button>
        </form>
      )}

      <p className="text-xs text-muted">
        Oppure tocca la quantità di un ingrediente qui sotto e scrivi quanto ne hai: il resto si adatta.
      </p>

      {suggestions.length > 0 && (
        <div className="notice bg-warning-soft text-warning">
          <p className="font-medium">Con questo fattore gli ingredienti a pezzi non tornano interi.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const name = recipe.ingredients.find((i) => i.id === s.ingredientId)?.name ?? s.ingredientId
              return (
                <button key={`${s.ingredientId}-${s.count}`} className="btn-secondary px-3 py-1 text-sm" onClick={() => onFactor(s.factor)}>
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
