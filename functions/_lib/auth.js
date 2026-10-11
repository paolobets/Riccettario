/**
 * Autenticazione: password con hash lento (PBKDF2-SHA256, 100 000 iterazioni,
 * il massimo consentito dai Workers), sessioni per dispositivo con token
 * opachi conservati come hash, limiti ai tentativi di accesso, inviti e reset
 * della password. Niente dipendenze: solo Web Crypto, disponibile sia nei
 * Workers sia in Node.
 */

const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 90
const SESSION_RENEW_AFTER_HOURS = 24
const MAX_FAILURES = 5
const LOCK_MINUTES = 15
const RESET_MINUTES = 60

const enc = new TextEncoder()

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export function randomToken(prefix, bytes = 32) {
  return `${prefix}_${b64url(crypto.getRandomValues(new Uint8Array(bytes)))}`
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, iter, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false
  const again = await hashPassword(password, fromB64url(salt), Number(iter))
  const a = again.split('$')[3]
  if (a.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

/** Regole minime: almeno 10 caratteri, non solo cifre, non uguale all'email. */
export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < 10) return 'La password deve avere almeno 10 caratteri: va bene anche una frase.'
  if (/^\d+$/.test(password)) return 'La password non può essere fatta solo di cifre.'
  if (email && password.toLowerCase() === email.toLowerCase()) return 'La password non può essere uguale all\'email.'
  return null
}

export function normalizeEmail(email) {
  const e = String(email ?? '')
    .trim()
    .toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null
}

const nowIso = () => new Date().toISOString()
const plusMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString()
const plusDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString()

// --- Limite ai tentativi ------------------------------------------------------

/** `true` se la chiave (email o IP) è bloccata per troppi tentativi falliti. */
export async function isLocked(db, key) {
  const row = await db.prepare('SELECT failures, locked_until FROM throttle WHERE key = ?').bind(key).first()
  return Boolean(row?.locked_until && row.locked_until > nowIso())
}

export async function registerFailure(db, key) {
  const row = await db.prepare('SELECT failures FROM throttle WHERE key = ?').bind(key).first()
  const failures = (row?.failures ?? 0) + 1
  const lockedUntil = failures >= MAX_FAILURES ? plusMinutes(LOCK_MINUTES) : null
  await db
    .prepare('INSERT INTO throttle (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at')
    .bind(key, failures >= MAX_FAILURES ? 0 : failures, lockedUntil, nowIso())
    .run()
  return lockedUntil
}

export async function clearFailures(db, key) {
  await db.prepare('DELETE FROM throttle WHERE key = ?').bind(key).run()
}

// --- Sessioni ------------------------------------------------------------------

export async function createSession(db, userId, device) {
  const token = randomToken('sess')
  const id = randomToken('s', 9)
  await db
    .prepare('INSERT INTO auth_sessions (id, user_id, token_hash, device, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, await sha256(token), (device ?? '').slice(0, 120) || null, nowIso(), nowIso(), plusDays(SESSION_DAYS))
    .run()
  return { id, token }
}

/** Utente di una sessione valida, con rinnovo scorrevole; `null` se scaduta, revocata o inesistente. */
export async function userFromSession(db, token) {
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.last_used_at, s.expires_at, u.id, u.name, u.email, u.plan, u.role, u.budget_usd, u.disabled
       FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
    )
    .bind(await sha256(token))
    .first()
  if (!row || row.disabled || row.expires_at <= nowIso()) return null
  if (new Date(row.last_used_at).getTime() < Date.now() - SESSION_RENEW_AFTER_HOURS * 3_600_000) {
    await db.prepare('UPDATE auth_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').bind(nowIso(), plusDays(SESSION_DAYS), row.session_id).run()
  }
  return { id: row.id, name: row.name, email: row.email, plan: row.plan, role: row.role, budgetUsd: row.budget_usd, sessionId: row.session_id }
}

export async function listSessions(db, userId) {
  return (await db.prepare('SELECT id, device, created_at, last_used_at, expires_at FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_used_at DESC').bind(userId, nowIso()).all()).results
}

export async function revokeSession(db, userId, sessionId) {
  const r = await db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id = ? AND revoked_at IS NULL').bind(nowIso(), userId, sessionId).run()
  return Boolean(r.meta?.changes)
}

export async function revokeAllSessions(db, userId, exceptSessionId = null) {
  await db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR id <> ?)').bind(nowIso(), userId, exceptSessionId, exceptSessionId).run()
}

// --- Inviti --------------------------------------------------------------------

export async function createInvite(db, { email = null, plan = 'tester', budgetUsd = null, days = 14, createdBy = 'admin' }) {
  const code = randomToken('inv', 12)
  await db.prepare('INSERT INTO invites (code, email, plan, budget_usd, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(code, email, plan, budgetUsd, createdBy, nowIso(), plusDays(days)).run()
  return code
}

export async function validInvite(db, code) {
  const row = await db.prepare('SELECT code, email, plan, budget_usd, expires_at, used_at FROM invites WHERE code = ?').bind(code ?? '').first()
  if (!row || row.used_at || row.expires_at <= nowIso()) return null
  return row
}

export async function consumeInvite(db, code, userId) {
  await db.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE code = ?').bind(nowIso(), userId, code).run()
}

export async function listInvites(db) {
  return (await db.prepare('SELECT code, email, plan, budget_usd, created_at, expires_at, used_at, used_by FROM invites ORDER BY created_at DESC LIMIT 200').all()).results
}

// --- Reset della password ------------------------------------------------------

export async function createResetToken(db, userId) {
  const token = randomToken('rst')
  await db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, nowIso(), plusMinutes(RESET_MINUTES)).run()
  return token
}

export async function consumeResetToken(db, token) {
  const hash = await sha256(token ?? '')
  const row = await db.prepare('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?').bind(hash).first()
  if (!row || row.used_at || row.expires_at <= nowIso()) return null
  await db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(nowIso(), hash).run()
  return row.user_id
}

// --- Email ---------------------------------------------------------------------

/** Manda un'email tramite Resend se configurato (RESEND_API_KEY e MAIL_FROM); altrimenti `false`. */
export async function sendMail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  })
  return res.ok
}
