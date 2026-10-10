import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
  factorFromPivot,
  factorFromServings,
  factorFromYield,
  scaleRecipe,
  type PivotResult,
  type Recipe,
} from '@/core'

/**
 * Stato del configuratore. Il fattore vive nell'URL (`?f=1.5`) così la modalità
 * assistita lo riceve e il link si può condividere o ricaricare.
 */
export function useScaler(recipe: Recipe | undefined) {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('f'))
  const factor = Number.isFinite(raw) && raw > 0 ? raw : 1

  const setFactor = useCallback(
    (f: number) => {
      const next = new URLSearchParams(params)
      if (Math.abs(f - 1) < 1e-9) next.delete('f')
      else next.set('f', String(Math.round(f * 10000) / 10000))
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, factor) : undefined), [recipe, factor])

  const setServings = useCallback(
    (servings: number) => recipe && setFactor(factorFromServings(recipe, servings)),
    [recipe, setFactor],
  )
  const setYield = useCallback(
    (amount: number) => {
      if (!recipe) return
      const f = factorFromYield(recipe, amount)
      if (f) setFactor(f)
    },
    [recipe, setFactor],
  )
  const setPivot = useCallback(
    (ingredientId: string, amount: number): PivotResult => {
      if (!recipe) return { ok: false, reason: 'Ricetta non caricata.' }
      const r = factorFromPivot(recipe, ingredientId, amount)
      if (r.ok) setFactor(r.factor)
      return r
    },
    [recipe, setFactor],
  )
  const reset = useCallback(() => setFactor(1), [setFactor])

  return { factor, scaled, setFactor, setServings, setYield, setPivot, reset, search: params.toString() }
}
