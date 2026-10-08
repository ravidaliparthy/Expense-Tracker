'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..', '..');            // expense-tracker/
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'db', 'expense-tracker.db');
const SCHEMA_PATH = fs.existsSync(path.join(ROOT, 'db', 'schema.sql'))
  ? path.join(ROOT, 'db', 'schema.sql')
  : (fs.existsSync(path.join(__dirname, '..', 'schema.sql')) ? path.join(__dirname, '..', 'schema.sql') : path.join(__dirname, 'schema.sql'));

let db = null;

function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);                                            // idempotent (IF NOT EXISTS)
  migrate();                                               // idempotent ALTERs for older DBs
  ensureDemoUser();
  return db;
}

function ensureDemoUser() {
  try {
    const exists = db.prepare(`SELECT 1 FROM users WHERE email = ?`).get('demo@expense.test');
    if (!exists) {
      const { seedDemoUser } = require('./seed');
      seedDemoUser(db, true);
    }
  } catch (err) {
    console.error('Auto-seed check error:', err);
  }
}

/** Adds columns introduced after a DB file was first created. Safe to rerun. */
function migrate() {
  const expCols = db
    .prepare(`PRAGMA table_info(expenses)`)
    .all()
    .map((c) => c.name);
  // Emoji history integrity: snapshot the category icon onto each transaction
  // so archived/purged categories keep their emoji in old reports.
  if (!expCols.includes('category_icon_snapshot')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN category_icon_snapshot TEXT`);
  }
  // Currency choice: per-transaction currency (older DBs predate this column).
  if (!expCols.includes('currency')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`);
  }
  // Income tracking: money OUT vs money IN (older DBs predate this column).
  if (!expCols.includes('kind')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'`);
  }

  const catCols = db
    .prepare(`PRAGMA table_info(categories)`)
    .all()
    .map((c) => c.name);
  // Customizable category emojis (older DBs predate this column).
  if (!catCols.includes('icon')) {
    db.exec(`ALTER TABLE categories ADD COLUMN icon TEXT`);
  }

  const userCols = db
    .prepare(`PRAGMA table_info(users)`)
    .all()
    .map((c) => c.name);
  // Profile currency selector: older DB files may not have the user preference.
  if (!userCols.includes('base_currency')) {
    db.exec(`ALTER TABLE users ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'USD'`);
  }
}

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');                       // concurrent readers + writer
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');                       // offline-resilient retries
    db.pragma('synchronous = NORMAL');                      // WAL-safe fast fsync (100s of concurrent users)
    db.pragma('temp_store = MEMORY');                       // sorts/groupings stay in RAM
    db.pragma('cache_size = -64000');                       // 64 MB page cache
    db.pragma('mmap_size = 268435456');                     // 256 MB memory-mapped I/O
    init();
    ensureIndexes();
  }
  return db;
}

/** Hot-path indexes: list/filter, analytics windows, budget lookups, sync idempotency. */
function ensureIndexes() {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_exp_user_date       ON expenses(user_id, local_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_exp_user_kind_date  ON expenses(user_id, kind, local_date)`,
    `CREATE INDEX IF NOT EXISTS idx_exp_user_cat_date   ON expenses(user_id, category_id, local_date)`,
    `CREATE INDEX IF NOT EXISTS idx_exp_user_merchant   ON expenses(user_id, merchant)`,
    `CREATE INDEX IF NOT EXISTS idx_exp_client_uuid     ON expenses(user_id, client_uuid)`,
    `CREATE INDEX IF NOT EXISTS idx_cat_user            ON categories(user_id, deleted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_budget_user_period  ON budgets(user_id, period, period_year, period_month)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_user_created  ON audit_log(user_id, created_at DESC)`,
  ];
  const run = db.transaction(() => { for (const sql of statements) db.exec(sql); });
  run();
}

function audit(userId, entityType, entityId, action, payload) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (user_id, entity_type, entity_id, action, payload)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, entityType, entityId, action, payload ? JSON.stringify(payload) : null);
}

if (require.main === module) {
  getDb();
  console.log('✔ SQLite database initialized at', DB_PATH);
}

module.exports = { getDb, audit, DB_PATH };
