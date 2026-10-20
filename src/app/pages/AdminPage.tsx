import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { admin, loadAdminToken, saveAdminToken, type AdminInvite, type AdminUser } from '@/auth/admin'
import { fetchAccount } from '@/ai/account'
import { loadAiSettings } from '@/ai/settings'
import { formatUsd } from '@/ai/usage'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : 'mai'
}

/** Amministrazione: inviti, persone, consumi. Per chi gestisce l'app, dall'app. */
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [draftToken, setDraftToken] = useState('')
  const [isAdminSession, setIsAdminSession] = useState<boolean | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [today, setToday] = useState<{ costUsd: number; requests: number } | null>(null)
  const [invites, setInvites] = useState<AdminInvite[] | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [budget, setBudget] = useState('')
  const [created, setCreated] = useState<{ link: string; email: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    loadAdminToken().then(setToken)
    loadAiSettings().then((s) => fetchAccount(s).then((a) => setIsAdminSession(a?.role === 'admin')))
  }, [])
  const key = isAdminSession ? '' : (token ?? '')
  const ready = isAdminSession === true || Boolean(token)

  const reload = useCallback(async () => {
    if (!ready) return
    setError(null)
    try {
      const [u, i] = await Promise.all([admin.usage(key), admin.invites(key)])
      setUsers(u.users)
      setToday(u.today)
      setInvites(i.invites)
      setOpen(i.open)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [ready, key])
  useEffect(() => {
    void reload()
  }, [reload])

  if (token === null || isAdminSession === null) return null

  const saveToken = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await saveAdminToken(draftToken.trim())
    setToken(draftToken.trim())
  }

  const createInvite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await admin.createInvite(key, { email: email.trim() || undefined, budgetUsd: budget ? Number(budget) : undefined })
      setCreated({ link: r.link, email: r.email })
      setEmail('')
      setBudget('')
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const share = async (link: string, who: string | null) => {
    const text = `Ciao! Ecco il tuo invito al Ricettario${who ? ` (per ${who})` : ''}: apri il link sul telefono, scegli una password e sei dentro. Vale due settimane.\n${link}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Invito al Ricettario', text })
        return
      }
      await navigator.clipboard.writeText(text)
      setMessage('Invito copiato: incollalo in un messaggio.')
    } catch {
      setMessage('Copia il link a mano dal riquadro.')
    }
  }

  return (
    <div className="space-y-5">
      {dialog}
      <div>
        <h1 className="text-3xl font-medium text-fg">Amministrazione</h1>
        <p className="text-sm text-muted">Inviti, persone e consumi del server. {isAdminSession ? 'Sei collegato con un account amministratore.' : ''}</p>
      </div>

      {!ready && (
        <form className="space-y-3" onSubmit={saveToken}>
          <p className="text-sm text-fg-2">Entra con un account amministratore, oppure inserisci la password amministratore del server (il segreto ADMIN_TOKEN). Resta salvata su questo dispositivo.</p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Password amministratore</span>
            <input className="w-full" type="password" autoComplete="off" value={draftToken} onChange={(e) => setDraftToken(e.target.value)} />
          </label>
          <button className="btn-primary" type="submit" disabled={!draftToken.trim()}>
            Entra
          </button>
        </form>
      )}

      {error && (
        <p className="notice flex items-start gap-2 bg-danger-soft text-danger" role="alert">
          <Icon name="alert" size={16} className="mt-0.5" /> <span>{error}</span>
        </p>
      )}

      {ready && (
        <>
          <section className="rule space-y-3 pt-4">
            <h2 className="section-title text-lg">Nuovo invito</h2>
            <form className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]" onSubmit={createInvite}>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-fg-2">Email (facoltativa)</span>
                <input className="w-full" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vale per chiunque, se vuota" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-fg-2">Budget $/mese</span>
                <input className="w-full" type="number" min={0} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="3" />
              </label>
              <button className="btn-primary self-end" type="submit" disabled={busy}>
                <Icon name="plus" size={16} /> Crea invito
              </button>
            </form>
            {created && (
              <div className="card space-y-2" role="status">
                <p className="text-sm text-fg-2">Invito creato{created.email ? ` per ${created.email}` : ''}. Vale due settimane, una sola registrazione.</p>
                <p className="qty break-all rounded-lg bg-surface-2 px-2 py-1 text-sm">{created.link}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => share(created.link, created.email)}>
                    <Icon name="share" size={16} /> Manda l'invito
                  </button>
                  <button className="btn-secondary" onClick={() => setCreated(null)}>
                    Chiudi
                  </button>
                </div>
              </div>
            )}
            {message && (
              <p className="text-sm text-fg-2" role="status">
                {message}
              </p>
            )}
            {open && <p className="text-xs text-warning">La registrazione è aperta a tutti (OPEN_SIGNUP): gli inviti non servono finché resta così.</p>}
          </section>

          <section className="rule space-y-2 pt-4">
            <h2 className="section-title text-lg">Persone</h2>
            {today && (
              <p className="text-sm text-muted">
                Oggi, tutti insieme: {formatUsd(today.costUsd)} in {today.requests} richieste.
              </p>
            )}
            {users && users.length === 0 && <p className="text-sm text-muted">Nessun account ancora.</p>}
            <ul className="divide-y divide-line">
              {users?.map((u) => (
                <li key={u.user} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-medium text-fg">
                      {u.email ?? u.user}
                      {u.email && <span className="text-muted"> ({u.user})</span>}
                      {u.role === 'admin' && <span className="chip ml-2">admin</span>}
                      {u.disabled ? <span className="chip ml-2 bg-danger-soft text-danger">sospeso</span> : null}
                    </span>
                    <span className="text-sm text-muted">
                      {formatUsd(u.costUsd)} su {formatUsd(u.budgetUsd ?? 3)}, {u.requests} richieste, visto {when(u.lastSeenAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      className="btn-ghost min-h-9 px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          const r = await admin.resetLink(key, u.user)
                          await share(r.link, u.email)
                          setMessage(`Link per reimpostare la password di ${u.email ?? u.user}: vale un'ora. ${r.link}`)
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      Link nuova password
                    </button>
                    <button
                      className="btn-ghost min-h-9 px-2 py-1 text-xs"
                      onClick={async () => {
                        try {
                          await admin.setRole(key, u.user, u.role === 'admin' ? 'user' : 'admin')
                          await reload()
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      {u.role === 'admin' ? 'Togli admin' : 'Rendi admin'}
                    </button>
                    <button
                      className={`btn-ghost min-h-9 px-2 py-1 text-xs ${u.disabled ? '' : 'text-danger'}`}
                      onClick={async () => {
                        if (!u.disabled) {
                          const ok = await confirm({ title: `Sospendere ${u.email ?? u.user}?`, body: 'Non potrà più entrare né usare l\'assistente finché non la riattivi. Le sue ricette restano.', confirmLabel: 'Sospendi', cancelLabel: 'Lascia attivo', danger: true })
                          if (!ok) return
                        }
                        try {
                          await admin.setDisabled(key, u.user, !u.disabled)
                          await reload()
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      {u.disabled ? 'Riattiva' : 'Sospendi'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rule space-y-2 pt-4">
            <h2 className="section-title text-lg">Inviti emessi</h2>
            {invites && invites.length === 0 && <p className="text-sm text-muted">Nessun invito ancora.</p>}
            <ul className="divide-y divide-line text-sm">
              {invites?.map((i) => {
                const expired = !i.used_at && i.expires_at <= new Date().toISOString()
                return (
                  <li key={i.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="text-fg">{i.email ?? 'chiunque'}</span>
                      <span className="block text-xs text-muted">
                        {i.used_at ? `usato il ${when(i.used_at)}` : expired ? `scaduto il ${when(i.expires_at)}` : `vale fino al ${when(i.expires_at)}`}
                        {i.budget_usd ? `, budget ${formatUsd(i.budget_usd)}` : ''}
                      </span>
                    </span>
                    {!i.used_at && !expired && (
                      <button className="btn-ghost min-h-9 px-2 py-1 text-xs" onClick={() => share(i.link, i.email)}>
                        <Icon name="share" size={14} /> Rimanda
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {!isAdminSession && (
            <button
              className="btn-ghost text-sm"
              onClick={async () => {
                await saveAdminToken('')
                setToken('')
                setUsers(null)
                setInvites(null)
              }}
            >
              Dimentica la password amministratore su questo dispositivo
            </button>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        <Link to="/impostazioni" className="text-accent-text underline-offset-2 hover:underline">
          Torna alle impostazioni
        </Link>
      </p>
    </div>
  )
}
