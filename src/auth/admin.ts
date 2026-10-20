/**
 * Chiamate alle rotte /admin del backend: con la sessione di un account con
 * ruolo admin, oppure con la password amministratore (ADMIN_TOKEN) conservata
 * sul dispositivo.
 */
import { db } from '@/data/db'
import { loadAiSettings } from '@/ai/settings'

const TOKEN_KEY = 'admin-token'

export async function loadAdminToken(): Promise<string> {
  return ((await db.settings.get(TOKEN_KEY))?.value as string | undefined) ?? ''
}
export async function saveAdminToken(token: string): Promise<void> {
  if (token) await db.settings.put({ key: TOKEN_KEY, value: token })
  else await db.settings.delete(TOKEN_KEY)
}

export interface AdminUser {
  user: string
  email: string | null
  role: string
  plan: string
  budgetUsd: number | null
  disabled: number
  lastSeenAt: string | null
  costUsd: number
  requests: number
}
export interface AdminInvite {
  code: string
  email: string | null
  plan: string
  budget_usd: number | null
  created_at: string
  expires_at: string
  used_at: string | null
  used_by: string | null
  link: string
}

async function call<T>(path: string, init: RequestInit = {}, adminToken = ''): Promise<T> {
  const s = await loadAiSettings()
  const base = s.proxyUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Questa copia dell\'app non ha un server.')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (adminToken) headers['x-admin-token'] = adminToken
  else if (s.apiKey.trim()) headers['x-api-key'] = s.apiKey.trim()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, headers })
  } catch {
    throw new Error('Server non raggiungibile: controlla la connessione.')
  }
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) throw new Error(body?.error?.message ?? `Il server ha risposto ${res.status}.`)
  return body as T
}

export const admin = {
  usage: (token: string) => call<{ month: string; defaultBudgetUsd: number; users: AdminUser[]; today: { costUsd: number; requests: number } }>('/admin/usage', {}, token),
  invites: (token: string) => call<{ invites: AdminInvite[]; open: boolean }>('/admin/invites', {}, token),
  createInvite: (token: string, input: { email?: string; budgetUsd?: number; days?: number }) =>
    call<{ code: string; link: string; email: string | null; days: number }>('/admin/invites', { method: 'POST', body: JSON.stringify(input) }, token),
  setDisabled: (token: string, name: string, disabled: boolean) => call<{ name: string }>(`/admin/users/${encodeURIComponent(name)}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' }, token),
  setRole: (token: string, name: string, role: 'admin' | 'user') => call<{ name: string }>(`/admin/users/${encodeURIComponent(name)}/role`, { method: 'POST', body: JSON.stringify({ role }) }, token),
  resetLink: (token: string, name: string) => call<{ link: string; minutes: number }>(`/admin/users/${encodeURIComponent(name)}/reset-link`, { method: 'POST' }, token),
}
