import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { inviteInfo, register, type InviteInfo } from '@/auth/session'
import AuthShell from '../../components/AuthShell'
import PasswordField from '../../components/PasswordField'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const code = params.get('invito') ?? ''
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    inviteInfo(code)
      .then((info) => {
        if (!alive) return
        setInvite(info)
        if (info.email) setEmail(info.email)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [code])

  const canRegister = invite?.valid || invite?.open
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Scrivi email e password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await register({ invite: code || undefined, email, password, name })
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const intro = !invite
    ? 'Controllo l\'invito…'
    : invite.valid
      ? `Invito valido${invite.email ? ` per ${invite.email}` : ''}. Scegli una password: ti servirà su ogni dispositivo.`
      : invite.open
        ? 'Crea l\'account con la tua email e una password: ti serviranno su ogni dispositivo.'
        : code
          ? 'Questo invito non è valido o è scaduto: chiedi a chi ti ha invitato di mandartene uno nuovo.'
          : 'Per ora si entra su invito: chiedi il link a chi gestisce l\'app.'

  return (
    <AuthShell
      title="Crea l'account"
      intro={intro}
      error={error}
      onSubmit={submit}
      footer={
        <p>
          Hai già un account?{' '}
          <Link to="/accedi" className="inline-flex min-h-11 items-center text-accent-text underline-offset-2 hover:underline">
            Accedi
          </Link>
        </p>
      }
    >
      {canRegister && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Come ti chiami</span>
            <input className="w-full" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Email</span>
            <input className="w-full" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required readOnly={Boolean(invite?.email)} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" hint="Almeno 10 caratteri: va bene anche una frase facile da ricordare." />
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : "Crea l'account"}
          </button>
        </>
      )}
    </AuthShell>
  )
}
