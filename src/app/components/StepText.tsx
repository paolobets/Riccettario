import { renderStep, type ScaledRecipe, type Step } from '@/core'

interface Props {
  step: Step
  scaled: ScaledRecipe
  className?: string
  /** Elemento contenitore: `h1` in modalità cucina, dove il passaggio è il titolo della schermata. */
  as?: 'p' | 'h1' | 'span'
}

/** Testo del passaggio con le quantità riscalate evidenziate. */
export default function StepText({ step, scaled, className, as: Tag = 'p' }: Props) {
  const segments = renderStep(step, scaled)
  return (
    <Tag className={className}>
      {segments.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.text}</span>
        if (s.kind === 'missing')
          return (
            <span key={i} className="rounded bg-danger-soft px-1 text-danger" title="Ingrediente non trovato">
              {s.text}
            </span>
          )
        return (
          <span
            key={i}
            className={`font-semibold ${s.nameOnly ? 'text-fg' : 'rounded-sm bg-accent-soft px-1 text-accent-text'} ${s.ingredient.adjusted ? 'underline decoration-warning decoration-2 underline-offset-2' : ''}`}
            title={s.ingredient.warning}
          >
            {s.text}
          </span>
        )
      })}
    </Tag>
  )
}
