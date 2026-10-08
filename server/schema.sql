-- ============================================================
-- Expense Tracker — SQLite schema (driver: better-sqlite3)
-- Design notes:
--   * Money is stored as INTEGER CENTS (never REAL) to avoid float drift.
--   * Timestamps in UTC (ISO-8601 TEXT). local_date = user's calendar date,
--     used for ALL month/year grouping so expenses never bleed across months.
--   * Soft deletes everywhere: deleted_at IS NULL = live row.
--   * Category names are snapshotted onto expenses so archived or even
--     purged categories can never break historical reports.
-- ============================================================
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  display_name   TEXT    NOT NULL,
  base_currency  TEXT    NOT NULL DEFAULT 'USD',
  timezone       TEXT    NOT NULL DEFAULT 'UTC',     -- IANA, e.g. 'Asia/Kolkata'
  is_first_login INTEGER NOT NULL DEFAULT 1,         -- drives onboarding (§5)
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);

-- ------------------------------------------------------------
-- CATEGORIES (dynamic, soft delete + archive)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  color_hex   TEXT    NOT NULL DEFAULT '#6366F1',
  icon        TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,   -- seeded Food/Travel…: not deletable
  is_archived INTEGER NOT NULL DEFAULT 0,   -- hidden from pickers, kept for history
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);
-- Live-name uniqueness (partial index → NULLs in deleted_at handled correctly)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_user_name_live
  ON categories(user_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cat_user_live
  ON categories(user_id, deleted_at, is_archived);

-- ------------------------------------------------------------
-- EXPENSES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id             INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  category_name_snapshot  TEXT    NOT NULL,     -- history-safe label
  category_color_snapshot TEXT,
  category_icon_snapshot  TEXT,                 -- history-safe emoji (survives category purge)
  amount_cents            INTEGER NOT NULL,     -- CHECK: non-negative
  currency                TEXT    NOT NULL DEFAULT 'USD',
  kind                    TEXT    NOT NULL DEFAULT 'expense'
                          CHECK (kind IN ('expense','income')),  -- money OUT vs money IN
  occurred_at_utc         TEXT    NOT NULL,     -- ISO-8601 UTC instant
  local_date              TEXT    NOT NULL,     -- 'YYYY-MM-DD' in user's tz → grouping key
  tz_offset_minutes       INTEGER NOT NULL DEFAULT 0,
  merchant                TEXT,
  notes                   TEXT,                 -- contextual log / receipt / reminder
  receipt_url             TEXT,
  client_uuid             TEXT    NOT NULL,     -- idempotency key for offline sync
  sync_version            INTEGER NOT NULL DEFAULT 1,  -- optimistic locking
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at              TEXT,
  CHECK (amount_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exp_client_uuid ON expenses(user_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_exp_user_local_date ON expenses(user_id, local_date);

-- ------------------------------------------------------------
-- BUDGETS (per-category AND global: category_id NULL = GLOBAL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  scope_key    TEXT    NOT NULL GENERATED ALWAYS AS
                 (CASE WHEN category_id IS NULL THEN 'GLOBAL'
                       ELSE 'CAT:' || category_id END) STORED,
  period       TEXT    NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','yearly')),
  period_year  INTEGER NOT NULL,
  period_month INTEGER NOT NULL DEFAULT 0,      -- 1..12; 0 = whole year (yearly budgets)
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  warn_pct     INTEGER NOT NULL DEFAULT 80,     -- customizable thresholds
  crit_pct     INTEGER NOT NULL DEFAULT 90,
  over_pct     INTEGER NOT NULL DEFAULT 100,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (period_month BETWEEN 0 AND 12)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_scope
  ON budgets(user_id, scope_key, period, period_year, period_month);

-- ------------------------------------------------------------
-- AUDIT LOG (enterprise-grade traceability)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT    NOT NULL CHECK (entity_type IN ('expense','category','budget')),
  entity_id   INTEGER NOT NULL,
  action      TEXT    NOT NULL CHECK (action IN ('create','update','soft_delete','restore','archive')),
  payload     TEXT,                               -- JSON
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

