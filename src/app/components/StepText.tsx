import { renderStep, type ScaledRecipe, type Step } from '@/core'

interface Props {
  step: Step
  scaled: ScaledRecipe
  className?: string
}

/** Testo del passaggio con le quantità riscalate evidenziate. */
export default function StepText({ step, scaled, className }: Props) {
  const segments = renderStep(step, scaled)
  return (
    <p className={className}>
      {segments.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.text}</span>
        if (s.kind === 'missing')
          return (
            <span key={i} className="rounded bg-red-100 px-1 text-red-800" title="Ingrediente non trovato">
              {s.text}
            </span>
          )
        return (
          <span
            key={i}
            className={`rounded px-1 font-semibold ${s.nameOnly ? 'text-stone-800' : 'bg-brand-100 text-brand-900'} ${s.ingredient.adjusted ? 'ring-1 ring-amber-400' : ''}`}
            title={s.ingredient.warning}
          >
            {s.text}
          </span>
        )
      })}
    </p>
  )
}
