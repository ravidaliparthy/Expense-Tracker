'use strict';
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getDb, audit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { resolveInstant } = require('../lib/time');
const { pushToTurso } = require('../lib/turso');

const router = express.Router();
router.use(requireAuth);

const mutationSchema = z.object({
  clientUuid: z.string().uuid(),
  op: z.enum(['create', 'update', 'delete']),
  payload: z.object({
    amountCents: z.number().int().positive().optional(),
      kind: z.enum(['expense', 'income']).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    merchant: z.string().max(120).optional(),
    notes: z.string().max(10000).optional(),
    baseVersion: z.number().int().optional(),
  }).default({}),
});

const batchSchema = z.object({
  deviceId: z.string().max(64).optional(),
  mutations: z.array(mutationSchema).min(1).max(500),
});

/**
 * POST /api/sync/batch — offline resilience.
 * - `create` with a clientUuid already on the server → { status:'duplicate' } (idempotent).
 * - `update` with stale baseVersion           → { status:'conflict', server } (409 per item).
 * - Everything applies inside ONE transaction per batch, but each item reports
 *   its own result so one bad row can't poison the whole queue.
 */
router.post('/batch', (req, res, next) => {
  try {
    const body = validate(batchSchema, req.body);
    const db = getDb();
    const results = [];

    const apply = db.transaction((m) => {
      if (m.op === 'create') {
        const dup = db.prepare(`SELECT id FROM expenses WHERE user_id = ? AND client_uuid = ?`)
          .get(req.user.id, m.clientUuid);
        if (dup) return { clientUuid: m.clientUuid, status: 'duplicate', id: dup.id };

        const today = new Date().toISOString().slice(0, 10);
        const usedToday = db.prepare(
          `SELECT COUNT(*) AS n FROM expenses
           WHERE user_id = ? AND deleted_at IS NULL AND created_at >= ?`
        ).get(req.user.id, `${today}T00:00:00.000Z`).n;
        if (usedToday >= (Number(process.env.DAILY_TX_LIMIT) || 2000)) {
          return { clientUuid: m.clientUuid, status: 'error', error: 'Daily transaction limit reached' };
        }

        const p = m.payload;
        if (!p.amountCents || !p.occurredAt) {
          return { clientUuid: m.clientUuid, status: 'error', error: 'create requires amountCents + occurredAt' };
        }
        let cat = null;
        if (p.categoryId) {
          cat = db.prepare(`SELECT id, name, color_hex AS colorHex, icon FROM categories
                            WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
                 .get(p.categoryId, req.user.id);
          if (!cat) return { clientUuid: m.clientUuid, status: 'error', error: 'Unknown category' };
        }
        const inst = resolveInstant(p.occurredAt, req.user.timezone);
        const info = db.prepare(
          `INSERT INTO expenses (user_id, category_id, category_name_snapshot, category_color_snapshot,
             category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes,
             merchant, notes, client_uuid)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(req.user.id, cat ? cat.id : null, cat ? cat.name : 'Uncategorized',
              cat ? cat.colorHex : '#94A3B8', cat ? cat.icon : null, p.amountCents, req.user.baseCurrency,
              p.kind || 'expense',
              inst.occurredAtUtc, inst.localDate, inst.tzOffsetMinutes,
              p.merchant ?? null, p.notes ?? null, m.clientUuid);
        return { clientUuid: m.clientUuid, status: 'created', id: info.lastInsertRowid };
      }

      if (m.op === 'update') {
        const existing = db.prepare(
          `SELECT id, sync_version AS v FROM expenses WHERE user_id = ? AND client_uuid = ? AND deleted_at IS NULL`
        ).get(req.user.id, m.clientUuid);
        if (!existing) return { clientUuid: m.clientUuid, status: 'error', error: 'Not found' };
        if (m.payload.baseVersion !== undefined && m.payload.baseVersion !== existing.v) {
          return { clientUuid: m.clientUuid, status: 'conflict', serverVersion: existing.v };
        }
        const sets = []; const args = [];
        if (m.payload.amountCents !== undefined) { sets.push('amount_cents = ?'); args.push(m.payload.amountCents); }
        if (m.payload.kind !== undefined)        { sets.push('kind = ?');         args.push(m.payload.kind); }
        if (m.payload.merchant !== undefined)     { sets.push('merchant = ?');     args.push(m.payload.merchant); }
        if (m.payload.notes !== undefined)        { sets.push('notes = ?');        args.push(m.payload.notes); }
        if (m.payload.categoryId !== undefined) {
          let cat = null;
          if (m.payload.categoryId) {
            cat = db.prepare(`SELECT id, name, color_hex AS colorHex, icon FROM categories
                              WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
                    .get(m.payload.categoryId, req.user.id);
            if (!cat) return { clientUuid: m.clientUuid, status: 'error', error: 'Unknown category' };
          }
          sets.push('category_id = ?', 'category_name_snapshot = ?', 'category_color_snapshot = ?', 'category_icon_snapshot = ?');
          args.push(cat ? cat.id : null, cat ? cat.name : 'Uncategorized', cat ? cat.colorHex : '#94A3B8', cat ? cat.icon : null);
        }
        if (m.payload.occurredAt !== undefined) {
          const inst = resolveInstant(m.payload.occurredAt, req.user.timezone);
          sets.push('occurred_at_utc = ?', 'local_date = ?', 'tz_offset_minutes = ?');
          args.push(inst.occurredAtUtc, inst.localDate, inst.tzOffsetMinutes);
        }
        if (sets.length) {
          sets.push('sync_version = sync_version + 1', `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
          db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...args, existing.id);
        }
        return { clientUuid: m.clientUuid, status: 'updated', id: existing.id };
      }

      // op === 'delete' → soft delete
      db.prepare(
        `UPDATE expenses SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE user_id = ? AND client_uuid = ? AND deleted_at IS NULL`
      ).run(req.user.id, m.clientUuid);
      return { clientUuid: m.clientUuid, status: 'deleted' };
    });

    for (const m of body.mutations) {
      try {
        const resItem = apply(m);
        results.push(resItem);

        if (resItem.status === 'created' || resItem.status === 'updated') {
          const row = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(resItem.id);
          if (row) {
            pushToTurso(
              `INSERT OR REPLACE INTO expenses (id, user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot, amount_cents, currency, kind, occurred_at_utc, local_date, tz_offset_minutes, merchant, notes, receipt_url, client_uuid, sync_version, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id, row.user_id, row.category_id, row.category_name_snapshot, row.category_color_snapshot,
                row.category_icon_snapshot, row.amount_cents, row.currency, row.kind, row.occurred_at_utc,
                row.local_date, row.tz_offset_minutes, row.merchant, row.notes, row.receipt_url,
                row.client_uuid, row.sync_version, row.created_at, row.updated_at, row.deleted_at
              ]
            );
          }
        } else if (resItem.status === 'deleted') {
          const row = db.prepare(`SELECT * FROM expenses WHERE user_id = ? AND client_uuid = ?`).get(req.user.id, m.clientUuid);
          if (row) {
            pushToTurso(
              `UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?`,
              [row.deleted_at, row.updated_at, row.id]
            );
          }
        }
      } catch (e) {
        results.push({ clientUuid: m.clientUuid, status: 'error', error: e.message });
      }
    }
    audit(req.user.id, 'expense', 0, 'update', { syncBatch: results.length });

    const hasConflict = results.some((r) => r.status === 'conflict');
    res.status(hasConflict ? 207 : 200).json({ results });
  } catch (err) { next(err); }
});

module.exports = router;
