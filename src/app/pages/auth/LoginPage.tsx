import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { login } from '@/auth/session'
import AuthShell from '../../components/AuthShell'
import PasswordField from '../../components/PasswordField'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = params.get('next') || '/'

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Scrivi email e password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Accedi"
      intro="Con l'accesso ritrovi le tue ricette su ogni dispositivo e puoi usare l'assistente."
      error={error}
      onSubmit={submit}
      footer={
        <>
          <p>
            <Link to="/password-dimenticata" className="inline-flex min-h-11 items-center text-accent-text underline-offset-2 hover:underline">
              Password dimenticata?
            </Link>
          </p>
          <p>
            Hai ricevuto un invito?{' '}
            <Link to="/registrati" className="inline-flex min-h-11 items-center text-accent-text underline-offset-2 hover:underline">
              Crea l'account
            </Link>
          </p>
        </>
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg-2">Email, o il nome utente se hai una password da tester</span>
        <input className="w-full" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <button className="btn-primary w-full" type="submit" disabled={busy}>
        {busy ? 'Un momento…' : 'Accedi'}
      </button>
    </AuthShell>
  )
}
