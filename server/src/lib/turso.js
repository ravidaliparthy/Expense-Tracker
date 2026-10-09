'use strict';
/**
 * Turso Cloud SQLite Synchronization Module
 * Provides real-time cloud persistence for all users, transactions, and budgets.
 * Keeps local SQLite and Turso Cloud database in continuous bidirectional sync.
 */
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://expense-tracker-ravidaliparthy.aws-us-east-2.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE1MTg1NjMsImlkIjoiMDFhMTFlZDEtZWMwMS03YTY5LWJkMDgtNDQwNTQwZDFkMjVhIiwia2lkIjoickhrc1NjRXBXaTJCMVlIWDVyMEFwOEFIckZUN2JBNlJEdGg3NkN4NUdmQSIsInJpZCI6ImFkMjBiZWY0LTZlZmEtNDlkMy05OTBmLTYyZDAxOWUwOGJkNSJ9.YJNqPAstgraoKT9SgsWxAafbCEHg7HLn0hEXZArsH4bQsTvY9FDSkaPOcCqvuPELA7ajhoFSaQNrLNNjb7ceDA';

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
      INSERT OR REPLACE INTO users (id, email, password_hash, display_name, base_currency, timezone, is_first_login, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const importUsers = db.transaction((rows) => {
      for (const u of rows) {
        insertUser.run(u.id, u.email, u.password_hash, u.display_name, u.base_currency, u.timezone, u.is_first_login, u.created_at, u.updated_at, u.deleted_at);
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

    // 3. Sync Expenses
    const expRes = await client.execute('SELECT * FROM expenses');
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

    console.log(`✔ Turso Cloud Sync Complete: ${usersRes.rows.length} users, ${catsRes.rows.length} categories, ${expRes.rows.length} expenses, ${budRes.rows.length} budgets.`);
    return true;
  } catch (err) {
    console.warn('⚠️  Turso Cloud Sync warning (running on local cache):', err.message);
    return false;
  }
}

/**
 * Asynchronously pushes a mutation to Turso Cloud in the background.
 * Fire-and-forget: does not block the user's HTTP response.
 */
function pushToTurso(sql, args = []) {
  const client = getTursoClient();
  if (!client) return;

  setImmediate(async () => {
    try {
      await client.execute({ sql, args });
    } catch (err) {
      console.warn('Turso push warning:', err.message);
    }
  });
}

module.exports = {
  isTursoConfigured,
  getTursoClient,
  syncFromTursoToLocal,
  pushToTurso,
  TURSO_URL,
};
