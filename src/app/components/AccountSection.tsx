import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { changePassword, listDevices, logout, logoutOthers, revokeDevice, useSignedIn, type Device } from '@/auth/session'
import type { Account } from '@/ai/account'
import { formatUsd } from '@/ai/usage'
import { useConfirm } from './ConfirmDialog'
import PasswordField from './PasswordField'
import Icon from './Icon'

interface Props {
  account: Account | null
  /** Da chiamare dopo uscita o cambio password, per rileggere lo stato. */
  onChange: () => void
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Blocco "Account" delle Impostazioni quando l'app gira con il suo server: chi sei, budget, dispositivi, password. */
export default function AccountSection({ account, onChange }: Props) {
  const signedIn = useSignedIn()
  const { confirm, dialog } = useConfirm()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [showDevices, setShowDevices] = useState(false)
  const [changing, setChanging] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!showDevices || !signedIn) return
    listDevices()
      .then(setDevices)
      .catch((e: Error) => setError(e.message))
  }, [showDevices, signedIn])

  if (signedIn === undefined) return null

  if (!signedIn) {
    return (
      <section className="rule space-y-3 pt-4">
        <h2 className="section-title text-lg">Account</h2>
        <p className="text-sm text-muted">Accedi per usare l'assistente e ritrovare ricette, diario e conversazioni su ogni dispositivo. Senza accesso l'app funziona solo su questo telefono.</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/accedi" className="btn-primary">
            Accedi
          </Link>
          <Link to="/registrati" className="btn-secondary">
            Crea l'account
          </Link>
        </div>
        <p className="text-xs text-muted">
          Gestisci l'app?{' '}
          <Link to="/amministrazione" className="text-accent-text underline-offset-2 hover:underline">
            Amministrazione
          </Link>
        </p>
      </section>
    )
  }

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      setChanging(false)
      setCurrent('')
      setNext('')
      setMessage('Password cambiata. Gli altri dispositivi dovranno rifare l\'accesso.')
      setDevices(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const exit = async () => {
    const ok = await confirm({
      title: 'Uscire dall\'account?',
      body: 'Le ricette restano su questo dispositivo ma non si aggiornano più finché non rientri. L\'assistente non sarà disponibile.',
      confirmLabel: 'Esci',
      cancelLabel: 'Resta collegato',
    })
    if (!ok) return
    await logout()
    onChange()
  }

  const who = account?.email ?? account?.user
  return (
    <section className="rule space-y-3 pt-4">
      <h2 className="section-title text-lg">Account</h2>
      {account ? (
        <div className="text-sm text-fg-2">
          <p>
            Collegato come <b className="text-fg">{who}</b>
            {account.email && account.user !== account.email ? ` (${account.user})` : ''}
            {account.plan ? `, piano ${account.plan}` : ''}
            {account.role === 'admin' ? ', amministratore' : ''}.
          </p>
          {account.usage && (
            <>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  Il tuo mese: <b className="text-fg">{formatUsd(account.usage.costUsd)}</b> su {formatUsd(account.budgetUsd)}
                </span>
                <span className="text-muted">{account.usage.requests} richieste</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-surface-3" aria-hidden="true">
                <div
                  className={`h-1.5 rounded-full ${account.usage.costUsd / account.budgetUsd > 0.8 ? 'bg-warning' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, (account.usage.costUsd / account.budgetUsd) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Sessione salvata su questo dispositivo. Il server non risponde: se il problema resta, esci e rientra.</p>
      )}
      {message && (
        <p className="text-sm text-success" role="status">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button" onClick={() => setShowDevices(!showDevices)} aria-expanded={showDevices}>
          Dispositivi collegati
        </button>
        <button className="btn-secondary" type="button" onClick={() => setChanging(!changing)} aria-expanded={changing}>
          Cambia password
        </button>
        <button className="btn-ghost" type="button" onClick={exit}>
          Esci
        </button>
      </div>
      {showDevices && (
        <div className="space-y-2 text-sm">
          {!devices && !error && <p className="text-muted">Carico…</p>}
          {devices && (
            <ul className="divide-y divide-line">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-fg">
                      {d.device ?? 'dispositivo'}
                      {d.current ? ' (questo)' : ''}
                    </span>
                    <span className="block text-xs text-muted">ultimo uso {when(d.lastUsedAt)}</span>
                  </span>
                  {!d.current && (
                    <button
                      className="btn-ghost min-h-10 shrink-0 px-2 py-1 text-xs"
                      type="button"
                      onClick={async () => {
                        try {
                          await revokeDevice(d.id)
                          setDevices(devices.filter((x) => x.id !== d.id))
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      <Icon name="close" size={14} /> Scollega
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {devices && devices.length > 1 && (
            <button
              className="btn-ghost min-h-10 px-2 py-1 text-xs"
              type="button"
              onClick={async () => {
                try {
                  await logoutOthers()
                  setDevices(devices.filter((d) => d.current))
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
            >
              Scollega tutti gli altri
            </button>
          )}
          <p className="text-xs text-muted">Se non riconosci un dispositivo, scollegalo e cambia la password.</p>
        </div>
      )}
      <p className="text-xs text-muted">
        Gestisci l'app?{' '}
        <Link to="/amministrazione" className="text-accent-text underline-offset-2 hover:underline">
          Amministrazione
        </Link>
        : inviti, persone e consumi.
      </p>
      {changing && (
        <form className="space-y-3" onSubmit={submitPassword}>
          <PasswordField label="Password attuale" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="Nuova password" value={next} onChange={setNext} autoComplete="new-password" hint="Almeno 10 caratteri: va bene anche una frase facile da ricordare." />
          <button className="btn-primary" type="submit" disabled={busy || !current || !next}>
            {busy ? 'Un momento…' : 'Salva la nuova password'}
          </button>
        </form>
      )}
      {error && (
        <p className="notice bg-danger-soft text-danger" role="alert">
          {error}
        </p>
      )}
      {dialog}
    </section>
  )
}
