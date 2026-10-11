import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { resetPassword } from '@/auth/session'
import AuthShell from '../../components/AuthShell'
import PasswordField from '../../components/PasswordField'

export default function ResetPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Nuova password"
      intro={token ? 'Scegli la nuova password. Gli altri dispositivi collegati dovranno rifare l\'accesso.' : 'Il link non è completo: apri quello ricevuto per email, oppure chiedine uno nuovo.'}
      error={error}
      onSubmit={submit}
      footer={
        <p>
          <Link to="/password-dimenticata" className="inline-flex min-h-11 items-center text-accent-text underline-offset-2 hover:underline">
            Chiedi un nuovo link
          </Link>
        </p>
      }
    >
      {token && (
        <>
          <PasswordField label="Nuova password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus hint="Almeno 10 caratteri: va bene anche una frase facile da ricordare." />
          <button className="btn-primary w-full" type="submit" disabled={busy || !password}>
            {busy ? 'Un momento…' : 'Salva e accedi'}
          </button>
        </>
      )}
    </AuthShell>
  )
}
