/**
 * Accesso a D1 (SQLite di Cloudflare): utenti, archivio sincronizzato, consumi.
 *
 * Lo schema si crea da solo alla prima richiesta (CREATE TABLE IF NOT EXISTS),
 * così su Pages non serve un passo di migrazione; `functions/schema.sql` è la
 * stessa cosa in forma leggibile, per chi vuole eseguirla a mano.
 *
 * Il contenuto di ricette, cotture e conversazioni resta JSON dentro la riga:
 * il modello dati vive nell'app, il server lo sincronizza senza interpretarlo.
 * Ogni riga ha `updated_at` (ora del dispositivo che ha modificato, decide chi
 * vince) e `synced_at` (ora del server, decide cosa è "nuovo" per gli altri
 * dispositivi).
 */

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'tester',
    budget_usd REAL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  )`,
  ...['recipes', 'sessions', 'chats'].map(
    (t) => `CREATE TABLE IF NOT EXISTS ${t} (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  ),
  ...['recipes', 'sessions', 'chats'].map((t) => `CREATE INDEX IF NOT EXISTS ${t}_synced ON ${t} (user_id, synced_at)`),
  `CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    at TEXT NOT NULL,
    feature TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS usage_user_at ON usage (user_id, at)`,
  `CREATE INDEX IF NOT EXISTS usage_at ON usage (at)`,
]

const SYNC_TABLES = ['recipes', 'sessions', 'chats']
const PULL_LIMIT = 2000

const ready = new WeakSet()
export async function ensureSchema(db) {
  if (ready.has(db)) return
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)))
  ready.add(db)
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Password facili da dettare: quattro parole e due cifre, circa 50 bit. */
const WORDS = 'mela pera noce fico uva kiwi lime cedro menta salvia timo basilico farro orzo riso miglio pane burro latte panna sale pepe zucca cipolla aglio porro sedano carota rapa bieta rucola fava cece lenticchia pinolo mandorla tartufo forno pentola padella mestolo grattugia setaccio brocca tazza cucchiaio forchetta tovaglia candela finestra giardino collina fiume lago monte bosco prato sole luna stella nuvola vento neve pioggia'.split(' ')
export function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint32Array(5))
  const pick = (i) => WORDS[bytes[i] % WORDS.length]
  return `${pick(0)}-${pick(1)}-${pick(2)}-${pick(3)}-${10 + (bytes[4] % 90)}`
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export async function findUserByToken(db, token) {
  const hash = await sha256(token)
  const row = await db.prepare('SELECT id, name, plan, budget_usd, disabled FROM users WHERE token_hash = ?').bind(hash).first()
  if (!row || row.disabled) return null
  return row
}

export async function findUserByName(db, name) {
  return db.prepare('SELECT id, name, plan, budget_usd, disabled, created_at, last_seen_at FROM users WHERE name = ?').bind(name).first()
}

export async function createUser(db, { name, password = generatePassword(), plan = 'tester', budgetUsd = null }) {
  const id = newId('u')
  await db
    .prepare('INSERT INTO users (id, name, token_hash, plan, budget_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, await sha256(password), plan, budgetUsd, new Date().toISOString())
    .run()
  return { id, name, plan, budgetUsd, password }
}

export async function resetPassword(db, name, password = generatePassword()) {
  const r = await db.prepare('UPDATE users SET token_hash = ?, disabled = 0 WHERE name = ?').bind(await sha256(password), name).run()
  return r.meta?.changes ? password : null
}

export async function setDisabled(db, name, disabled) {
  const r = await db.prepare('UPDATE users SET disabled = ? WHERE name = ?').bind(disabled ? 1 : 0, name).run()
  return Boolean(r.meta?.changes)
}

export async function touchUser(db, id) {
  await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
}

export async function listUsers(db) {
  return (await db.prepare('SELECT id, name, plan, budget_usd, disabled, created_at, last_seen_at FROM users ORDER BY name').all()).results
}

const emptyUsage = () => ({ costUsd: 0, requests: 0, inputTokens: 0, outputTokens: 0 })

function sumRow(row) {
  return row ? { costUsd: row.cost ?? 0, requests: row.n ?? 0, inputTokens: row.inp ?? 0, outputTokens: row.out ?? 0 } : emptyUsage()
}

/** Somme di un utente dall'inizio del mese (ISO "YYYY-MM"). */
export async function monthUsage(db, userId, month) {
  const row = await db
    .prepare('SELECT SUM(cost_usd) AS cost, COUNT(*) AS n, SUM(input_tokens + cache_read_tokens + cache_write_tokens) AS inp, SUM(output_tokens) AS out FROM usage WHERE user_id = ? AND at >= ?')
    .bind(userId, `${month}-01`)
    .first()
  return sumRow(row)
}

/** Somme di tutti gli utenti in un giorno (ISO "YYYY-MM-DD"). */
export async function dayUsage(db, day) {
  const row = await db.prepare('SELECT SUM(cost_usd) AS cost, COUNT(*) AS n, SUM(input_tokens) AS inp, SUM(output_tokens) AS out FROM usage WHERE at >= ? AND at < ?').bind(day, `${day}~`).first()
  return sumRow(row)
}

/** Consumi del mese per utente, dal più alto. */
export async function monthUsageByUser(db, month) {
  const { results } = await db
    .prepare(
      `SELECT u.name AS user, u.plan AS plan, u.budget_usd AS budgetUsd, u.disabled AS disabled, u.last_seen_at AS lastSeenAt,
              COALESCE(SUM(x.cost_usd), 0) AS costUsd, COUNT(x.id) AS requests,
              COALESCE(SUM(x.input_tokens + x.cache_read_tokens + x.cache_write_tokens), 0) AS inputTokens, COALESCE(SUM(x.output_tokens), 0) AS outputTokens
       FROM users u LEFT JOIN usage x ON x.user_id = u.id AND x.at >= ?
       GROUP BY u.id ORDER BY costUsd DESC, u.name`,
    )
    .bind(`${month}-01`)
    .all()
  return results
}

export async function logUsage(db, { userId, feature, model, usage, costUsd }) {
  await db
    .prepare('INSERT INTO usage (user_id, at, feature, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, new Date().toISOString(), feature ?? null, model, usage.input_tokens ?? 0, usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0, usage.output_tokens ?? 0, costUsd)
    .run()
}

/**
 * Applica le modifiche di un dispositivo (ultima modifica vince, per riga) e
 * restituisce quelle degli altri dispositivi arrivate dopo `since`.
 */
export async function sync(db, userId, { since, recipes = [], sessions = [], chats = [] }) {
  const now = new Date().toISOString()
  const incoming = { recipes, sessions, chats }
  const statements = []
  for (const table of SYNC_TABLES) {
    for (const row of incoming[table]) {
      if (!row || typeof row.id !== 'string' || typeof row.updated_at !== 'string') continue
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table} (user_id, id, data, updated_at, deleted_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, synced_at = excluded.synced_at
             WHERE excluded.updated_at > ${table}.updated_at`,
          )
          .bind(userId, row.id, row.deleted_at ? null : JSON.stringify(row.data ?? null), row.updated_at, row.deleted_at ?? null, now),
      )
    }
  }
  if (statements.length > 0) await db.batch(statements)

  const out = { now }
  for (const table of SYNC_TABLES) {
    const { results } = await db
      .prepare(`SELECT id, data, updated_at, deleted_at, synced_at FROM ${table} WHERE user_id = ? AND synced_at > ? AND synced_at <= ? ORDER BY synced_at LIMIT ?`)
      .bind(userId, since ?? '', now, PULL_LIMIT)
      .all()
    out[table] = results.map((r) => ({ id: r.id, data: r.data ? JSON.parse(r.data) : null, updated_at: r.updated_at, deleted_at: r.deleted_at }))
  }
  out.more = SYNC_TABLES.some((t) => out[t].length === PULL_LIMIT)
  return out
}

export async function counts(db, userId) {
  const out = {}
  for (const table of SYNC_TABLES) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND deleted_at IS NULL`).bind(userId).first()
    out[table] = row?.n ?? 0
  }
  return out
}
