import type { FormEvent, ReactNode } from 'react'
import Icon from './Icon'

interface Props {
  title: string
  intro?: ReactNode
  error?: string | null
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  footer?: ReactNode
}

/** Impalcatura comune delle schermate di accesso: titolo, testo, modulo, errori, collegamenti. */
export default function AuthShell({ title, intro, error, onSubmit, children, footer }: Props) {
  return (
    <div className="mx-auto max-w-sm space-y-4 py-4">
      <h1 className="font-display text-3xl font-medium text-fg">{title}</h1>
      {intro && <p className="text-sm text-fg-2">{intro}</p>}
      <form className="space-y-3" onSubmit={onSubmit} noValidate>
        {children}
        {error && (
          <p className="notice flex items-start gap-2 bg-danger-soft text-danger" role="alert">
            <Icon name="alert" size={16} className="mt-0.5" /> <span>{error}</span>
          </p>
        )}
      </form>
      {footer && <div className="rule space-y-2 pt-3 text-sm text-fg-2">{footer}</div>}
    </div>
  )
}
