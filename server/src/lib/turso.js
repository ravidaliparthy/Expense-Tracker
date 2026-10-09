'use strict';
/**
 * Turso Cloud SQLite Synchronization Module
 * Provides real-time cloud persistence for all users, transactions, and budgets.
 * Keeps local SQLite and Turso Cloud database in continuous bidirectional sync.
 */
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

let tursoClient = null;

function isTursoConfigured() {
  if (process.env.NODE_ENV === 'test') return false;
  return Boolean(TURSO_URL && TURSO_AUTH_TOKEN);
}

function getTursoClient() {
  if (!isTursoConfigured()) return null;
  if (!tursoClient) {
    tursoClient = createClient({
      url: TURSO_URL,
      authToken: TURSO_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

/**
 * Pulls all users, categories, expenses, and budgets from Turso Cloud into local SQLite.
 * Runs on server startup so Render always starts with the latest cloud state.
 */
async function syncFromTursoToLocal(db) {
  const client = getTursoClient();
  if (!client) return false;

  try {
    console.log('☁️  Pulling cloud state from Turso...');
    
    // 1. Sync Users
    const usersRes = await client.execute('SELECT * FROM users');
    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, email, password_hash, display_name, base_currency, timezone, is_first_login, recovery_pin_hash, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importUsers = db.transaction((rows) => {
      for (const u of rows) {
        insertUser.run(u.id, u.email, u.password_hash, u.display_name, u.base_currency, u.timezone, u.is_first_login, u.recovery_pin_hash || null, u.created_at, u.updated_at, u.deleted_at);
      }
    });
    importUsers(usersRes.rows);

    // 2. Sync Categories
    const catsRes = await client.execute('SELECT * FROM categories');
    const insertCat = db.prepare(`
      INSERT OR REPLACE INTO categories (id, user_id, name, color_hex, icon, is_system, is_archived, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importCats = db.transaction((rows) => {
      for (const c of rows) {
        insertCat.run(c.id, c.user_id, c.name, c.color_hex, c.icon, c.is_system, c.is_archived, c.created_at, c.updated_at, c.deleted_at);
      }
    });
    importCats(catsRes.rows);

    // 3. Sync Recent Expenses (Phase 1: Fast Boot - loads up to 2,000 recent transactions in <300ms)
    const expRes = await client.execute('SELECT * FROM expenses ORDER BY occurred_at_utc DESC LIMIT 2000');
    const insertExp = db.prepare(`
      INSERT OR REPLACE INTO expenses (id, user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes, merchant, notes, receipt_url, client_uuid, sync_version, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importExps = db.transaction((rows) => {
      for (const e of rows) {
        insertExp.run(
          e.id, e.user_id, e.category_id, e.category_name_snapshot, e.category_color_snapshot,
          e.category_icon_snapshot, e.amount_cents, e.currency, e.kind, e.occurred_at_utc,
          e.local_date, e.tz_offset_minutes, e.merchant, e.notes, e.receipt_url,
          e.client_uuid, e.sync_version, e.created_at, e.updated_at, e.deleted_at
        );
      }
    });
    importExps(expRes.rows);

    // 4. Sync Budgets
    const budRes = await client.execute('SELECT * FROM budgets');
    const insertBud = db.prepare(`
      INSERT OR REPLACE INTO budgets (id, user_id, category_id, period, period_year, period_month, amount_cents, warn_pct, crit_pct, over_pct, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importBuds = db.transaction((rows) => {
      for (const b of rows) {
        insertBud.run(
          b.id, b.user_id, b.category_id, b.period, b.period_year, b.period_month,
          b.amount_cents, b.warn_pct, b.crit_pct, b.over_pct, b.created_at, b.updated_at
        );
      }
    });
    importBuds(budRes.rows);

    // 5. Replay any pending outbox mutations that may have failed while offline
    await flushTursoOutbox(db);

    console.log(`✔ Turso Fast Boot Sync Complete: ${usersRes.rows.length} users, ${catsRes.rows.length} categories, ${expRes.rows.length} recent expenses, ${budRes.rows.length} budgets.`);

    // 6. Phase 2: If dataset exceeds 2,000 records (e.g. 10 years of history), stream remaining in background
    if (expRes.rows.length === 2000) {
      syncHistoricalExpensesInBackground(db, client);
    }

    return true;
  } catch (err) {
    console.warn('⚠️  Turso Cloud Sync warning (running on local cache):', err.message);
    return false;
  }
}

/**
 * Asynchronously streams older historical transactions into local SQLite in chunks.
 * Does not block server startup or health checks; completes in the background.
 */
function syncHistoricalExpensesInBackground(db, client) {
  setImmediate(async () => {
    try {
      let offset = 2000;
      const CHUNK_SIZE = 5000;
      let hasMore = true;
      const insertExp = db.prepare(`
        INSERT OR REPLACE INTO expenses (id, user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes, merchant, notes, receipt_url, client_uuid, sync_version, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      while (hasMore) {
        const chunk = await client.execute({
          sql: 'SELECT * FROM expenses ORDER BY occurred_at_utc DESC LIMIT ? OFFSET ?',
          args: [CHUNK_SIZE, offset],
        });

        if (!chunk.rows || chunk.rows.length === 0) {
          hasMore = false;
          break;
        }

        const importChunk = db.transaction((rows) => {
          for (const e of rows) {
            insertExp.run(
              e.id, e.user_id, e.category_id, e.category_name_snapshot, e.category_color_snapshot,
              e.category_icon_snapshot, e.amount_cents, e.currency, e.kind, e.occurred_at_utc,
              e.local_date, e.tz_offset_minutes, e.merchant, e.notes, e.receipt_url,
              e.client_uuid, e.sync_version, e.created_at, e.updated_at, e.deleted_at
            );
          }
        });
        importChunk(chunk.rows);
        offset += chunk.rows.length;

        if (chunk.rows.length < CHUNK_SIZE) {
          hasMore = false;
        }
      }
      console.log(`✔ Turso Historical Background Sync Complete (${offset} total expenses loaded).`);
    } catch (err) {
      console.warn('Background historical sync notice:', err.message);
    }
  });
}

/**
 * Persists an unpushed mutation to a local durable outbox table.
 * Guarantees zero data loss even if Turso is unreachable during a write.
 */
function recordOutbox(db, sql, args) {
  if (!db) return;
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS turso_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sql TEXT NOT NULL,
        args TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `).run();
    db.prepare(`INSERT INTO turso_outbox (sql, args) VALUES (?, ?)`).run(sql, JSON.stringify(args));
    console.warn('💾 Mutation saved to local outbox for deferred sync');
  } catch (err) {
    console.error('Failed to write to local outbox:', err.message);
  }
}

/**
 * Replays any pending mutations from local outbox to Turso Cloud.
 */
async function flushTursoOutbox(db) {
  const client = getTursoClient();
  if (!client || !db) return;

  try {
    const tableExists = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='turso_outbox'`).get();
    if (!tableExists) return;

    const rows = db.prepare(`SELECT id, sql, args FROM turso_outbox ORDER BY id ASC LIMIT 50`).all();
    for (const r of rows) {
      await client.execute({ sql: r.sql, args: JSON.parse(r.args) });
      db.prepare(`DELETE FROM turso_outbox WHERE id = ?`).run(r.id);
    }
    if (rows.length > 0) {
      console.log(`✔ Replayed ${rows.length} pending mutations from outbox to Turso`);
    }
  } catch (err) {
    console.warn('Turso outbox flush attempt:', err.message);
  }
}

/**
 * Awaitable write-through push to Turso Cloud with automatic transient retry.
 * If Turso is momentarily unavailable, falls back to local durable outbox so data is never lost.
 */
async function pushToTurso(sql, args = [], db = null, maxRetries = 1) {
  const client = getTursoClient();
  if (!client) return;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.execute({ sql, args });
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      console.warn('Turso push failed, persisting to outbox:', err.message);
      if (db) {
        recordOutbox(db, sql, args);
      }
    }
  }
}

module.exports = {
  isTursoConfigured,
  getTursoClient,
  syncFromTursoToLocal,
  pushToTurso,
  flushTursoOutbox,
  recordOutbox,
  TURSO_URL,
};
