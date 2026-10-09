'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..', '..');            // expense-tracker/
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'db', 'expense-tracker.db');
const SCHEMA_PATH = fs.existsSync(path.join(ROOT, 'db', 'schema.sql'))
  ? path.join(ROOT, 'db', 'schema.sql')
  : (fs.existsSync(path.join(__dirname, '..', 'schema.sql')) ? path.join(__dirname, '..', 'schema.sql') : path.join(__dirname, 'schema.sql'));
const SEED_DATA_PATH = fs.existsSync(path.join(ROOT, 'db', 'seed-data.json'))
  ? path.join(ROOT, 'db', 'seed-data.json')
  : (fs.existsSync(path.join(__dirname, '..', 'seed-data.json'))
      ? path.join(__dirname, '..', 'seed-data.json')
      : (fs.existsSync(path.join(__dirname, 'seed-data.json')) ? path.join(__dirname, 'seed-data.json') : path.join(ROOT, 'db', 'seed-data.json')));

const { syncFromTursoToLocal, pushToTurso, flushTursoOutbox } = require('./lib/turso');

let db = null;

let initPromise = null;

function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);                                            // idempotent (IF NOT EXISTS)
  migrate();                                               // idempotent ALTERs for older DBs
  restoreSeedData(db);
  ensureDemoUser();
  scheduleBackgroundTasks();
  return db;
}

async function initDbAsync() {
  getDb();
  if (!initPromise) {
    initPromise = syncFromTursoToLocal(db).catch((err) => {
      console.warn('Startup Turso sync warning:', err.message);
    });
  }
  return initPromise;
}

function restoreSeedData(dbInstance) {
  if (!fs.existsSync(SEED_DATA_PATH)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));
    const insertUser = dbInstance.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, display_name, base_currency, timezone, is_first_login, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCategory = dbInstance.prepare(`
      INSERT OR IGNORE INTO categories (id, user_id, name, color_hex, icon, is_system, is_archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertExpense = dbInstance.prepare(`
      INSERT OR IGNORE INTO expenses (id, user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes, merchant, notes, client_uuid, sync_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBudget = dbInstance.prepare(`
      INSERT OR IGNORE INTO budgets (id, user_id, category_id, period, period_year, period_month, amount_cents, warn_pct, crit_pct, over_pct, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runAll = dbInstance.transaction(() => {
      for (const u of (raw.users || [])) {
        insertUser.run(u.id, u.email, u.password_hash, u.display_name, u.base_currency || 'USD', u.timezone || 'UTC', u.is_first_login ? 1 : 0, u.created_at, u.updated_at);
      }
      for (const c of (raw.categories || [])) {
        insertCategory.run(c.id, c.user_id, c.name, c.color_hex, c.icon, c.is_system ? 1 : 0, c.is_archived ? 1 : 0, c.created_at, c.updated_at);
      }
      for (const e of (raw.expenses || [])) {
        insertExpense.run(
          e.id, e.user_id, e.category_id, e.category_name_snapshot, e.category_color_snapshot,
          e.category_icon_snapshot || null, e.amount_cents, e.currency || 'USD', e.kind || 'expense',
          e.occurred_at_utc, e.local_date, e.tz_offset_minutes || 0, e.merchant, e.notes,
          e.client_uuid, e.sync_version || 1, e.created_at, e.updated_at
        );
      }
      for (const b of (raw.budgets || [])) {
        insertBudget.run(
          b.id, b.user_id, b.category_id, b.period, b.period_year, b.period_month,
          b.amount_cents, b.warn_pct || 80, b.crit_pct || 90, b.over_pct || 100, b.created_at, b.updated_at
        );
      }
    });

    runAll();
    console.log(`✔ Restored persistent seed data (${(raw.users || []).length} users) from ${path.basename(SEED_DATA_PATH)}`);
    return true;
  } catch (err) {
    console.error('Seed restore warning:', err);
    return false;
  }
}

function persistUserToSeed(user, categories = []) {
  try {
    let data = { version: 1, users: [], categories: [], expenses: [], budgets: [] };
    if (fs.existsSync(SEED_DATA_PATH)) {
      data = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));
    }
    const existingIndex = (data.users || []).findIndex(u => u.email === user.email);
    if (existingIndex >= 0) {
      data.users[existingIndex] = { ...data.users[existingIndex], ...user };
    } else {
      (data.users = data.users || []).push(user);
    }
    if (categories && categories.length) {
      data.categories = data.categories || [];
      for (const cat of categories) {
        if (!data.categories.some(c => c.id === cat.id && c.user_id === cat.user_id)) {
          data.categories.push(cat);
        }
      }
    }
    fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not update seed-data.json:', err.message);
  }
}

function ensureDemoUser() {
  try {
    const user = db.prepare(`SELECT id, recovery_pin_hash FROM users WHERE email = ?`).get('demo@expense.test');
    if (!user) {
      const { seedDemoUser } = require('./seed');
      seedDemoUser(db, true);
    } else {
      // Ensure demo account has recovery_pin_hash set (hashed 'demo1234')
      if (!user.recovery_pin_hash) {
        const bcrypt = require('bcryptjs');
        const defaultPinHash = bcrypt.hashSync('demo1234', 10);
        db.prepare('UPDATE users SET recovery_pin_hash = ? WHERE id = ?').run(defaultPinHash, user.id);
      }
      // Auto-heal demo account: if visitor wiped demo transactions, restore baseline demo data
      const count = db.prepare(`SELECT COUNT(*) as c FROM expenses WHERE user_id = ? AND deleted_at IS NULL`).get(user.id).c;
      if (count < 10) {
        console.log('🔄 Auto-restoring demo baseline expenses from seed-data.json...');
        restoreSeedData(db);
      }
    }
  } catch (err) {
    console.error('Auto-seed check error:', err);
  }
}

function scheduleBackgroundTasks() {
  if (process.env.NODE_ENV === 'test') return;
  // Periodic demo account baseline sanity check (every 2 hours)
  setInterval(() => {
    ensureDemoUser();
  }, 2 * 60 * 60 * 1000).unref();

  // Periodic flush of any pending outbox mutations (every 60s)
  setInterval(() => {
    flushTursoOutbox(db).catch(() => {});
  }, 60 * 1000).unref();
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
  // Secret recovery PIN for password resets (zero external email dependency).
  if (!userCols.includes('recovery_pin_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN recovery_pin_hash TEXT`);
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

function closeDb() {
  if (db) {
    try {
      if (db.open) {
        db.close();
      }
    } catch (_) {}
    db = null;
  }
}

if (require.main === module) {
  getDb();
  console.log('✔ SQLite database initialized at', DB_PATH);
}

module.exports = { getDb, initDbAsync, closeDb, audit, DB_PATH, persistUserToSeed, pushToTurso };
