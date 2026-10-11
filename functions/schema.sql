-- Schema di D1 per il Ricettario. Si crea da solo alla prima richiesta; questo file serve per leggerlo o eseguirlo a mano:
--   wrangler d1 execute ricettario --remote --file=functions/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'tester',
  budget_usd REAL,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
  );

CREATE TABLE IF NOT EXISTS recipes (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
  );

CREATE TABLE IF NOT EXISTS sessions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
  );

CREATE TABLE IF NOT EXISTS chats (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
  );

CREATE INDEX IF NOT EXISTS recipes_synced ON recipes (user_id, synced_at);

CREATE INDEX IF NOT EXISTS sessions_synced ON sessions (user_id, synced_at);

CREATE INDEX IF NOT EXISTS chats_synced ON chats (user_id, synced_at);

CREATE TABLE IF NOT EXISTS usage (
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
  );

CREATE INDEX IF NOT EXISTS usage_user_at ON usage (user_id, at);

CREATE INDEX IF NOT EXISTS usage_at ON usage (at);
