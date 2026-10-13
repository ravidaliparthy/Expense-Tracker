'use strict';
const express = require('express');
const crypto = require('crypto');
const { getDb, audit } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate, recurringBillSchema } = require('../lib/validate');
const { resolveInstant } = require('../lib/time');

const router = express.Router();
router.use(requireAuth);

const SELECT_REC = `
  SELECT r.id, r.user_id AS userId, r.category_id AS categoryId,
         r.title, r.amount_cents AS amountCents, r.frequency,
         r.due_day AS dueDay, r.notes, r.is_active AS isActive,
         r.last_paid_at AS lastPaidAt, r.created_at AS createdAt,
         r.updated_at AS updatedAt,
         c.name AS categoryName, c.color_hex AS categoryColor, c.icon AS categoryIcon
  FROM recurring_bills r
  LEFT JOIN categories c ON c.id = r.category_id`;

/** GET /api/recurring */
router.get('/', (req, res, next) => {
  try {
    const rows = getDb().prepare(
      `${SELECT_REC}
       WHERE r.user_id = ? AND r.deleted_at IS NULL
       ORDER BY r.due_day ASC, r.id ASC`
    ).all(req.user.id);
    res.json(rows.map((r) => ({ ...r, isActive: !!r.isActive })));
  } catch (err) { next(err); }
});

/** POST /api/recurring */
router.post('/', (req, res, next) => {
  try {
    const body = validate(recurringBillSchema, req.body);
    const db = getDb();
    let catId = null;
    if (body.categoryId) {
      const cat = db.prepare(
        `SELECT id FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
      ).get(body.categoryId, req.user.id);
      if (cat) catId = cat.id;
    }

    const info = db.prepare(
      `INSERT INTO recurring_bills (user_id, category_id, title, amount_cents, frequency, due_day, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, catId, body.title.trim(), body.amountCents, body.frequency, body.dueDay, body.notes || null);

    audit(req.user.id, 'expense', info.lastInsertRowid, 'create', { recurring: body });
    const created = db.prepare(`${SELECT_REC} WHERE r.id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ ...created, isActive: !!created.isActive });
  } catch (err) { next(err); }
});

/** PATCH /api/recurring/:id */
router.patch('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      `SELECT * FROM recurring_bills WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    ).get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Recurring bill not found' });

    const sets = [];
    const args = [];
    if (req.body.title !== undefined) { sets.push('title = ?'); args.push(req.body.title.trim()); }
    if (req.body.amountCents !== undefined) { sets.push('amount_cents = ?'); args.push(Math.round(req.body.amountCents)); }
    if (req.body.frequency !== undefined) { sets.push('frequency = ?'); args.push(req.body.frequency); }
    if (req.body.dueDay !== undefined) { sets.push('due_day = ?'); args.push(Number(req.body.dueDay)); }
    if (req.body.notes !== undefined) { sets.push('notes = ?'); args.push(req.body.notes || null); }
    if (req.body.isActive !== undefined) { sets.push('is_active = ?'); args.push(req.body.isActive ? 1 : 0); }
    if (req.body.categoryId !== undefined) {
      sets.push('category_id = ?');
      args.push(req.body.categoryId || null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    db.prepare(`UPDATE recurring_bills SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, existing.id, req.user.id);
    audit(req.user.id, 'expense', existing.id, 'update', { recurring: req.body });
    const updated = db.prepare(`${SELECT_REC} WHERE r.id = ?`).get(existing.id);
    res.json({ ...updated, isActive: !!updated.isActive });
  } catch (err) { next(err); }
});

/** DELETE /api/recurring/:id (soft delete) */
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      `SELECT id FROM recurring_bills WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    ).get(req.params.id, req.user.id);
    if (!existing) return res.status(204).end();

    const now = new Date().toISOString();
    db.prepare(`UPDATE recurring_bills SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(now, now, existing.id, req.user.id);
    audit(req.user.id, 'expense', existing.id, 'soft_delete', { recurring: true });
    res.status(204).end();
  } catch (err) { next(err); }
});

/** POST /api/recurring/:id/pay — 1-click log payment as expense transaction */
router.post('/:id/pay', (req, res, next) => {
  try {
    const db = getDb();
    const bill = db.prepare(
      `${SELECT_REC} WHERE r.id = ? AND r.user_id = ? AND r.deleted_at IS NULL`
    ).get(req.params.id, req.user.id);
    if (!bill) return res.status(404).json({ error: 'Recurring bill not found' });

    const now = new Date();
    const isoNow = now.toISOString();
    const inst = resolveInstant(isoNow, req.user.timezone);

    // Update last_paid_at
    db.prepare(`UPDATE recurring_bills SET last_paid_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(isoNow, isoNow, bill.id, req.user.id);

    // Insert expense transaction
    const exp = db.prepare(
      `INSERT INTO expenses
         (user_id, category_id, category_name_snapshot, category_color_snapshot, category_icon_snapshot,
          amount_cents, currency, kind, tag, occurred_at_utc, local_date, tz_offset_minutes,
          merchant, notes, client_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', 'need', ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id,
      bill.categoryId || null,
      bill.categoryName || 'Bills & Utilities',
      bill.categoryColor || '#F59E0B',
      bill.categoryIcon || '📅',
      bill.amountCents,
      req.user.baseCurrency || 'USD',
      inst.occurredAtUtc,
      inst.localDate,
      inst.tzOffsetMinutes,
      bill.title,
      `Recurring bill payment for ${bill.title} (${bill.frequency})`,
      crypto.randomUUID()
    );

    audit(req.user.id, 'expense', exp.lastInsertRowid, 'create', { billId: bill.id });
    res.json({ ok: true, expenseId: exp.lastInsertRowid, billId: bill.id });
  } catch (err) { next(err); }
});

module.exports = router;
