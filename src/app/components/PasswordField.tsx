import { useId, useState } from 'react'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  hint?: string
  autoFocus?: boolean
}

/** Campo password con "Mostra": sul telefono vedere quello che si scrive evita metà degli errori. */
export default function PasswordField({ label, value, onChange, autoComplete, hint, autoFocus }: Props) {
  const [show, setShow] = useState(false)
  const id = useId()
  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block font-medium text-fg-2">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="min-w-0 flex-1"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          minLength={autoComplete === 'new-password' ? 10 : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button className="btn-secondary shrink-0 px-3" type="button" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? 'Nascondi' : 'Mostra'}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
