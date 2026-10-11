/**
 * Accesso all'app pubblicata: email e password contro le rotte /auth del
 * backend. Il token di sessione (sess_…) vive in AiSettings.apiKey, lo stesso
 * posto della password dei tester: tutto il resto dell'app (assistente,
 * sincronizzazione, /me) non distingue tra i due.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { loadAiSettings, saveAiSettings } from '@/ai/settings'
import { resetSyncCursor, syncNow } from '@/data/sync'

export interface SessionUser {
  name: string
  email: string | null
  plan: string
  role: 'admin' | 'user' | string
}

export interface Device {
  id: string
  device: string | null
  createdAt: string
  lastUsedAt: string
  current: boolean
}

export const SESSION_PREFIX = 'sess_'

/** Nome breve del dispositivo, mostrato nell'elenco "Dispositivi collegati". */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'dispositivo'
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'dispositivo'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const standalone = (window.matchMedia?.('(display-mode: standalone)').matches ?? false) || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  return [os, standalone ? 'app installata' : browser].filter(Boolean).join(', ')
}

async function proxyBase(): Promise<string> {
  const s = await loadAiSettings()
  const base = s.proxyUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Questa copia dell\'app non ha un server: l\'accesso non è disponibile.')
  return base
}

interface ApiErrorBody {
  error?: { type?: string; message?: string }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const base = await proxyBase()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.auth) {
    const s = await loadAiSettings()
    if (!s.apiKey.trim()) throw new Error('Non hai fatto l\'accesso.')
    headers['x-api-key'] = s.apiKey.trim()
  }
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, headers })
  } catch {
    throw new Error('Server non raggiungibile: controlla la connessione e riprova.')
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const message = (body as ApiErrorBody | null)?.error?.message
    throw new Error(message ?? `Il server ha risposto ${res.status}.`)
  }
  return body as T
}

interface SessionReply {
  token: string
  sessionId: string
  user: SessionUser
}

/** Salva il token come chiave dell'app, azzera i cursori e scarica subito l'archivio del server. */
async function adopt(reply: SessionReply): Promise<SessionUser> {
  const s = await loadAiSettings()
  await saveAiSettings({ ...s, apiKey: reply.token })
  await resetSyncCursor()
  void syncNow()
  return reply.user
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const reply = await call<SessionReply>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password, device: deviceLabel() }) })
  return adopt(reply)
}

export async function register(input: { invite?: string; email: string; password: string; name?: string }): Promise<SessionUser> {
  const reply = await call<SessionReply>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ invite: input.invite || undefined, email: input.email.trim(), password: input.password, name: input.name?.trim() || undefined, device: deviceLabel() }),
  })
  return adopt(reply)
}

export interface InviteInfo {
  valid: boolean
  open?: boolean
  email?: string | null
  plan?: string
  expiresAt?: string
}

export function inviteInfo(code: string): Promise<InviteInfo> {
  return call<InviteInfo>(`/auth/invite?code=${encodeURIComponent(code)}`)
}

/** Sempre senza errore se l'indirizzo è ben formato; `mail` dice se il server può davvero scrivere. */
export function forgotPassword(email: string): Promise<{ ok: boolean; mail: boolean }> {
  return call('/auth/forgot', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
}

export async function resetPassword(token: string, password: string): Promise<SessionUser> {
  const reply = await call<SessionReply>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password, device: deviceLabel() }) })
  return adopt(reply)
}

export function changePassword(current: string, password: string): Promise<{ ok: boolean }> {
  return call('/auth/password', { method: 'POST', auth: true, body: JSON.stringify({ current, password }) })
}

export async function listDevices(): Promise<Device[]> {
  return (await call<{ sessions: Device[] }>('/auth/sessions', { auth: true })).sessions
}

export function revokeDevice(id: string): Promise<{ ok: boolean }> {
  return call(`/auth/sessions/${encodeURIComponent(id)}/revoke`, { method: 'POST', auth: true })
}

export function logoutOthers(): Promise<{ ok: boolean }> {
  return call('/auth/logout-all', { method: 'POST', auth: true })
}

/** Chiude la sessione sul server (se raggiungibile) e dimentica il token. Le ricette restano sul dispositivo. */
export async function logout(): Promise<void> {
  const s = await loadAiSettings()
  if (s.apiKey.startsWith(SESSION_PREFIX)) {
    try {
      await call('/auth/logout', { method: 'POST', auth: true })
    } catch {
      // già scaduta o server irraggiungibile: basta dimenticarla qui
    }
  }
  await saveAiSettings({ ...s, apiKey: '' })
  await resetSyncCursor()
}

/** Vero se c'è una chiave salvata (sessione o password tester); `undefined` finché non è letta. */
export function useSignedIn(): boolean | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get('ai')
    const v = (row?.value ?? {}) as { apiKey?: string }
    return Boolean(v.apiKey?.trim())
  }, [])
}
