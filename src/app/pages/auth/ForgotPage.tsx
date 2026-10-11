import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { forgotPassword } from '@/auth/session'
import AuthShell from '../../components/AuthShell'

export default function ForgotPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ mail: boolean } | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Scrivi la tua email.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setDone(await forgotPassword(email))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Password dimenticata"
      intro={done ? undefined : 'Scrivi l\'email con cui ti sei registrato: ti mandiamo un link per sceglierne una nuova.'}
      error={error}
      onSubmit={submit}
      footer={
        <p>
          <Link to="/accedi" className="inline-flex min-h-11 items-center text-accent-text underline-offset-2 hover:underline">
            Torna all'accesso
          </Link>
        </p>
      }
    >
      {done ? (
        <p className="notice bg-info-soft text-info" role="status">
          {done.mail
            ? 'Se l\'indirizzo è registrato, entro qualche minuto riceverai un\'email con il link. Vale un\'ora: controlla anche la posta indesiderata.'
            : 'Questo server non manda email. Scrivi a chi gestisce l\'app: può darti un link per reimpostare la password.'}
        </p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Email</span>
            <input className="w-full" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : 'Mandami il link'}
          </button>
        </>
      )}
    </AuthShell>
  )
}
