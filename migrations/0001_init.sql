-- Luna initial schema (generated to match src/infra/db/schema.ts).
-- Applied transactionally by scripts/migrate.ts.

CREATE TABLE IF NOT EXISTS users (
  telegram_id   INTEGER PRIMARY KEY,
  github_login  TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  chat_id       INTEGER NOT NULL,
  path          TEXT    NOT NULL,
  added_at      TEXT    NOT NULL,
  last_used_at  TEXT,
  PRIMARY KEY (chat_id, path)
);
CREATE INDEX IF NOT EXISTS ws_by_chat ON workspaces(chat_id);

CREATE TABLE IF NOT EXISTS sessions (
  chat_id        INTEGER PRIMARY KEY,
  session_id     TEXT,
  model          TEXT NOT NULL,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  last_used_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id        INTEGER NOT NULL,
  name           TEXT    NOT NULL,
  job_type       TEXT    NOT NULL,
  prompt         TEXT    NOT NULL,
  schedule_data  TEXT    NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  auto_remove    INTEGER NOT NULL DEFAULT 0,
  fired_at       TEXT,
  created_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_by_chat_active ON jobs(chat_id, active);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
