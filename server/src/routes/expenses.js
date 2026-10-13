'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb, audit, pushToTurso } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate, expenseCreateSchema, expensePatchSchema, expenseQuerySchema, bulkDeleteSchema, bulkUpdateSchema } = require('../lib/validate');
const { sanitizeNotes } = require('../lib/sanitize');
const { resolveInstant } = require('../lib/time');

const router = express.Router();
router.use(requireAuth);

/** Per-user daily cap (2,000) — protects the service under concurrent load. */
const DAILY_TX_LIMIT = Number(process.env.DAILY_TX_LIMIT) || 2000;
function remainingToday(db, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const used = db.prepare(
    `SELECT COUNT(*) AS n FROM expenses
     WHERE user_id = ? AND deleted_at IS NULL AND created_at >= ?`
  ).get(userId, `${today}T00:00:00.000Z`).n;
  return Math.max(0, DAILY_TX_LIMIT - used);
}

const SELECT_EXP = `
  SELECT e.id, e.user_id AS userId, e.category_id AS categoryId,
         e.category_name_snapshot AS categorySnapshot,
         e.category_color_snapshot AS categoryColor,
         e.category_icon_snapshot AS categoryIcon,
         e.amount_cents AS amountCents, e.currency, e.kind, e.tag, e.source,
         e.occurred_at_utc AS occurredAtUtc, e.local_date AS localDate,
         e.tz_offset_minutes AS tzOffsetMinutes,
         e.merchant, e.notes, e.receipt_url AS receiptUrl,
         e.client_uuid AS clientUuid, e.sync_version AS syncVersion,
         e.created_at AS createdAt, e.updated_at AS updatedAt
  FROM expenses e`;

function buildFilters(query, userId) {
  const where = ['e.user_id = ?', 'e.deleted_at IS NULL'];
  const params = [userId];

  if (query.from) where.push('e.local_date >= ?'), params.push(query.from);
  if (query.to) where.push('e.local_date <= ?'), params.push(query.to);
  if (query.kind && query.kind !== 'all') where.push('e.kind = ?'), params.push(query.kind);
  if (query.tag && query.tag !== 'all') where.push('e.tag = ?'), params.push(query.tag);
  if (query.categoryIds) {
    const ids = query.categoryIds.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length) {
      where.push(`e.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (query.minAmount !== undefined) { where.push('e.amount_cents >= ?'); params.push(Math.round(query.minAmount * 100)); }
  if (query.maxAmount !== undefined) { where.push('e.amount_cents <= ?'); params.push(Math.round(query.maxAmount * 100)); }
  if (query.q) {
    where.push('(e.merchant LIKE ? OR e.notes LIKE ? OR e.category_name_snapshot LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  return { clause: where.join(' AND '), params };
}

function getCategorySnapshot(db, userId, categoryId) {
  if (!categoryId) {
    return { categoryId: null, name: 'Uncategorized', color: '#94A3B8', icon: '📌' };
  }
  const cat = db.prepare(
    `SELECT id, name, color_hex AS colorHex, icon FROM categories
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
  ).get(categoryId, userId);
  if (!cat) return null;
  return { categoryId: cat.id, name: cat.name, color: cat.colorHex, icon: cat.icon || '🏷️' };
}

router.get('/', (req, res, next) => {
  try {
    const q = validate(expenseQuerySchema, req.query);
    const { clause, params } = buildFilters(q, req.user.id);
    const sortMap = {
      'local_date:desc': 'e.local_date DESC, e.id DESC',
      'local_date:asc': 'e.local_date ASC, e.id ASC',
      'amount:desc': 'e.amount_cents DESC',
      'amount:asc': 'e.amount_cents ASC',
    };
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS n FROM expenses e WHERE ${clause}`).get(...params).n;
    const rows = db.prepare(`${SELECT_EXP} WHERE ${clause} ORDER BY ${sortMap[q.sort]} LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ items: rows, total, page: q.page, pageSize: q.pageSize });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const body = validate(expenseCreateSchema, req.body);
    const db = getDb();

    if (body.clientUuid) {
      const dup = db.prepare(`SELECT id FROM expenses WHERE user_id = ? AND client_uuid = ?`)
        .get(req.user.id, body.clientUuid);
      if (dup) return res.status(200).json({ id: dup.id, status: 'duplicate' });
    }

    if (remainingToday(db, req.user.id) <= 0) {
      return res.status(429).json({
        error: `Daily limit of ${DAILY_TX_LIMIT} transactions reached. Try again tomorrow.`,
      });
    }

    const snap = getCategorySnapshot(db, req.user.id, body.categoryId);
    if (!snap) return res.status(400).json({ error: 'Unknown category' });

    const inst = resolveInstant(body.occurredAt, req.user.timezone);
    const info = db.prepare(
      `INSERT INTO expenses
         (user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot,
          amount_cents, currency, kind, tag, source, occurred_at_utc, local_date, tz_offset_minutes,
          merchant, notes, receipt_url, client_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id, snap.categoryId, snap.name, snap.color, snap.icon,
      body.amountCents, req.user.baseCurrency, body.kind, body.tag || 'need', body.source || 'Others',
      inst.occurredAtUtc, inst.localDate, inst.tzOffsetMinutes,
      body.merchant ?? null, body.notes ?? null, body.receiptUrl ?? null,
      body.clientUuid || crypto.randomUUID()
    );

    audit(req.user.id, 'expense', info.lastInsertRowid, 'create', { amountCents: body.amountCents, kind: body.kind });
    const createdExp = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(info.lastInsertRowid);
    if (createdExp) {
      await pushToTurso(
        `INSERT OR REPLACE INTO expenses (id, user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes, merchant, notes, receipt_url, client_uuid, sync_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createdExp.id, createdExp.user_id, createdExp.category_id, createdExp.category_name_snapshot, createdExp.category_color_snapshot,
          createdExp.category_icon_snapshot, createdExp.amount_cents, createdExp.currency, createdExp.kind, createdExp.occurred_at_utc,
          createdExp.local_date, createdExp.tz_offset_minutes, createdExp.merchant, createdExp.notes, createdExp.receipt_url,
          createdExp.client_uuid, createdExp.sync_version, createdExp.created_at, createdExp.updated_at, createdExp.deleted_at
        ],
        db
      );
    }
    res.status(201).json(db.prepare(`${SELECT_EXP} WHERE e.id = ?`).get(info.lastInsertRowid));
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const body = validate(expensePatchSchema, req.body);
    const db = getDb();
    const existing = db.prepare(`${SELECT_EXP} WHERE e.id = ? AND e.user_id = ? AND e.deleted_at IS NULL`)
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    if (body.baseVersion !== undefined && body.baseVersion !== existing.syncVersion) {
      return res.status(409).json({ error: 'Version conflict — record changed since you loaded it', server: existing });
    }

    let snap = null;
    if (body.categoryId !== undefined) {
      snap = getCategorySnapshot(db, req.user.id, body.categoryId);
      if (!snap) return res.status(400).json({ error: 'Unknown category' });
    }

    const sets = []; const args = [];
    if (body.amountCents !== undefined) { sets.push('amount_cents = ?'); args.push(body.amountCents); }
    if (body.kind !== undefined) { sets.push('kind = ?'); args.push(body.kind); }
    if (body.tag !== undefined) { sets.push('tag = ?'); args.push(body.tag); }
    if (body.source !== undefined) { sets.push('source = ?'); args.push(body.source); }
    if (body.merchant !== undefined) { sets.push('merchant = ?'); args.push(body.merchant || null); }
    if (body.notes !== undefined) { sets.push('notes = ?'); args.push(body.notes || null); }
    if (snap) {
      sets.push('category_id = ?', 'category_name_snapshot = ?', 'category_color_snapshot = ?', 'category_icon_snapshot = ?');
      args.push(snap.categoryId, snap.name, snap.color, snap.icon);
    }
    if (body.occurredAt !== undefined) {
      const inst = resolveInstant(body.occurredAt, req.user.timezone);
      sets.push('occurred_at_utc = ?', 'local_date = ?', 'tz_offset_minutes = ?');
      args.push(inst.occurredAtUtc, inst.localDate, inst.tzOffsetMinutes);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    sets.push('sync_version = sync_version + 1', `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...args, existing.id);
    await pushToTurso(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, [...args, existing.id], db);
    audit(req.user.id, 'expense', existing.id, 'update', body);
    res.json(db.prepare(`${SELECT_EXP} WHERE e.id = ?`).get(existing.id));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const info = db.prepare(
      `UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    ).run(now, now, req.params.id, req.user.id);
    if (info.changes === 0) return res.status(204).end();
    await pushToTurso(
      `UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [now, now, req.params.id, req.user.id],
      db
    );
    audit(req.user.id, 'expense', Number(req.params.id), 'soft_delete');
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/restore/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`UPDATE expenses SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(now, req.params.id, req.user.id);
    await pushToTurso(
      `UPDATE expenses SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`,
      [now, req.params.id, req.user.id],
      db
    );
    const row = db.prepare(`${SELECT_EXP} WHERE e.id = ? AND e.user_id = ?`).get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    audit(req.user.id, 'expense', row.id, 'restore');
    res.json(row);
  } catch (err) { next(err); }
});

router.post('/bulk-delete', async (req, res, next) => {
  try {
    const body = validate(bulkDeleteSchema, req.body);
    const db = getDb();
    const now = new Date().toISOString();
    const placeholders = body.ids.map(() => '?').join(',');
    const info = db.prepare(
      `UPDATE expenses SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`
    ).run(now, now, req.user.id, ...body.ids);
    audit(req.user.id, 'expense', 0, 'soft_delete', { count: info.changes, ids: body.ids });
    res.json({ ok: true, deletedCount: info.changes });
  } catch (err) { next(err); }
});

router.post('/bulk-update', async (req, res, next) => {
  try {
    const body = validate(bulkUpdateSchema, req.body);
    const db = getDb();
    const sets = [];
    const args = [];
    if (body.categoryId !== undefined) {
      const snap = getCategorySnapshot(db, req.user.id, body.categoryId);
      if (!snap) return res.status(400).json({ error: 'Unknown category' });
      sets.push('category_id = ?', 'category_name_snapshot = ?', 'category_color_snapshot = ?', 'category_icon_snapshot = ?');
      args.push(snap.categoryId, snap.name, snap.color, snap.icon);
    }
    if (body.tag) {
      sets.push('tag = ?');
      args.push(body.tag);
    }
    if (body.source) {
      sets.push('source = ?');
      args.push(body.source);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    const placeholders = body.ids.map(() => '?').join(',');
    const info = db.prepare(
      `UPDATE expenses SET ${sets.join(', ')}
       WHERE user_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`
    ).run(...args, req.user.id, ...body.ids);
    audit(req.user.id, 'expense', 0, 'update', { count: info.changes, ids: body.ids });
    res.json({ ok: true, updatedCount: info.changes });
  } catch (err) { next(err); }
});

router.post('/bulk-import', async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Array of items required' });
    }
    if (items.length > 1000) {
      return res.status(400).json({ error: 'Max 1000 items per import' });
    }
    const db = getDb();
    const userId = req.user.id;
    const cats = db.prepare(
      `SELECT id, name, color_hex AS colorHex, icon FROM categories WHERE user_id = ? AND deleted_at IS NULL`
    ).all(userId);
    const catMap = new Map();
    for (const c of cats) {
      catMap.set(c.name.toLowerCase().trim(), c);
      catMap.set(String(c.id), c);
    }
    const defaultCat = cats[0] || { id: null, name: 'General', colorHex: '#64748B', icon: '🏷️' };

    const insert = db.prepare(
      `INSERT INTO expenses
         (user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot,
          amount_cents, currency, kind, tag, source, occurred_at_utc, local_date, tz_offset_minutes,
          merchant, notes, client_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const importTx = db.transaction(() => {
      let imported = 0;
      for (const item of items) {
        if (!item.amountCents || item.amountCents <= 0) continue;
        const kind = item.kind === 'income' ? 'income' : 'expense';
        const tag = ['need', 'want', 'saving'].includes(item.tag) ? item.tag : 'need';
        const source = ['SuperMoney', 'PhonePe', 'Google Pay', 'Credit Card', 'Debit Card', 'Cash', 'Others'].includes(item.source) ? item.source : 'Others';
        const occurredAt = item.occurredAt || new Date().toISOString();
        const inst = resolveInstant(occurredAt, req.user.timezone);
        let cat = defaultCat;
        if (item.category) {
          const match = catMap.get(String(item.category).toLowerCase().trim());
          if (match) cat = match;
        } else if (item.categoryId) {
          const match = catMap.get(String(item.categoryId));
          if (match) cat = match;
        }

        insert.run(
          userId,
          cat.id || null,
          cat.name,
          cat.colorHex || '#64748B',
          cat.icon || '🏷️',
          Math.round(item.amountCents),
          req.user.baseCurrency || 'USD',
          kind,
          tag,
          source,
          inst.occurredAtUtc,
          inst.localDate,
          inst.tzOffsetMinutes,
          item.merchant ?? null,
          sanitizeNotes(item.notes),
          crypto.randomUUID()
        );
        imported++;
      }
      return imported;
    });

    const count = importTx();
    audit(userId, 'expense', 0, 'create', { count });
    res.json({ ok: true, count });
  } catch (err) { next(err); }
});

router.post('/seed-sample', (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const cats = db.prepare(
      `SELECT id, name, color_hex AS colorHex, icon FROM categories WHERE user_id = ? AND deleted_at IS NULL`
    ).all(userId);
    const byName = Object.fromEntries(cats.map((c) => [c.name, c]));

    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const currency = req.user.base_currency || 'USD';
    const tz = req.user.timezone || 'UTC';

    const insert = db.prepare(
      `INSERT INTO expenses (user_id, category_id, category_name_snapshot, category_color_snapshot,
         category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes,
         merchant, notes, client_uuid)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );

    const samples = [
      { cat: 'Salary', kind: 'income', cents: 450000, day: '01', merchant: 'Direct Deposit', notes: 'Monthly payroll credit' },
      { cat: 'Food', kind: 'expense', cents: 4520, day: '02', merchant: 'Whole Foods Market', notes: 'Weekly grocery basket' },
      { cat: 'Utilities', kind: 'expense', cents: 9500, day: '03', merchant: 'Power & Gas Co', notes: 'Home utilities bill' },
      { cat: 'Entertainment', kind: 'expense', cents: 1999, day: '04', merchant: 'Netflix', notes: 'Monthly streaming subscription' },
      { cat: 'Shopping', kind: 'expense', cents: 6250, day: '05', merchant: 'Amazon', notes: 'Home essentials' },
      { cat: 'Travel', kind: 'expense', cents: 3400, day: '06', merchant: 'Metro Transit / Uber', notes: 'Transit fare' },
      { cat: 'Food', kind: 'expense', cents: 2850, day: '07', merchant: 'Local Cafe', notes: 'Lunch with team' },
      { cat: 'Health', kind: 'expense', cents: 4200, day: '08', merchant: 'Wellness Pharmacy', notes: 'Prescription & vitamins' },
    ];

    const seedTx = db.transaction(() => {
      let count = 0;
      for (const s of samples) {
        const c = byName[s.cat] || Object.values(byName)[0];
        const localDate = `${y}-${m}-${s.day}`;
        const timeIso = `${localDate}T12:00:00.000Z`;
        const { utc, offset } = resolveInstant(timeIso, tz);
        insert.run(
          userId,
          c ? c.id : null,
          c ? c.name : 'General',
          c ? c.colorHex : '#64748B',
          c ? c.icon : '🏷️',
          s.cents,
          currency,
          s.kind,
          utc,
          localDate,
          offset,
          s.merchant,
          s.notes,
          crypto.randomUUID()
        );
        count++;
      }
      return count;
    });

    const inserted = seedTx();
    audit(userId, 'expense', 0, 'create', { count: inserted });
    res.json({ ok: true, count: inserted });
  } catch (err) { next(err); }
});

router.post('/parse-pdf', async (req, res, next) => {
  try {
    const { base64 } = req.body || {};
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'Base64 encoded PDF payload is required.' });
    }

    const { parsePdfBuffer } = require('../lib/pdf-statement-parser');
    const pdfBuffer = Buffer.from(base64, 'base64');
    if (pdfBuffer.length === 0) {
      return res.status(400).json({ error: 'Empty PDF file received.' });
    }

    const db = getDb();
    const userCategories = db.prepare(
      `SELECT id, name, color_hex AS colorHex, icon FROM categories
       WHERE user_id = ? AND deleted_at IS NULL`
    ).all(req.user.id);

    const rows = await parsePdfBuffer(pdfBuffer, userCategories);
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('Error parsing PDF statement:', err);
    res.status(422).json({ error: 'Could not extract text from PDF statement: ' + (err.message || 'Invalid PDF format') });
  }
});

module.exports = { router, buildFilters, SELECT_EXP };
