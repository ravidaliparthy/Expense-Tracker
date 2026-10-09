'use strict';
const express = require('express');
const { getDb, audit, pushToTurso } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate, budgetSchema } = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const SELECT_BUDGET = `
  SELECT b.id, b.category_id AS categoryId, b.period,
         b.period_year AS periodYear, b.period_month AS periodMonth,
         b.amount_cents AS amountCents,
         b.warn_pct AS warnPct, b.crit_pct AS critPct, b.over_pct AS overPct,
         COALESCE(c.name, 'Global') AS label, COALESCE(c.color_hex, '#0EA5E9') AS color
  FROM budgets b LEFT JOIN categories c ON c.id = b.category_id`;

/** GET /api/budgets?period=monthly&year=2026&month=1  (omit month for yearly) */
router.get('/', (req, res, next) => {
  try {
    const period = req.query.period === 'yearly' ? 'yearly' : 'monthly';
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = period === 'monthly'
      ? Number(req.query.month) || new Date().getMonth() + 1
      : 0;

    const rows = getDb().prepare(
      `${SELECT_BUDGET}
       WHERE b.user_id = ? AND b.period = ? AND b.period_year = ? AND b.period_month = ?
       ORDER BY b.category_id IS NOT NULL DESC`
    ).all(req.user.id, period, year, month);
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * PUT /api/budgets — upsert. categoryId: number = per-category, null = GLOBAL.
 * One row per scope per period (enforced by the unique index).
 */
router.put('/', (req, res, next) => {
  try {
    const body = validate(budgetSchema, req.body);
    const db = getDb();

    if (body.categoryId) {
      const cat = db.prepare(
        `SELECT id FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
      ).get(body.categoryId, req.user.id);
      if (!cat) return res.status(400).json({ error: 'Unknown category' });
    }

    db.prepare(
      `INSERT INTO budgets (user_id, category_id, period, period_year, period_month,
                            amount_cents, warn_pct, crit_pct, over_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scope_key, period, period_year, period_month)
       DO UPDATE SET amount_cents = excluded.amount_cents,
                     warn_pct = excluded.warn_pct,
                     crit_pct = excluded.crit_pct,
                     over_pct = excluded.over_pct,
                     category_id = excluded.category_id,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    ).run(
      req.user.id, body.categoryId, body.period, body.periodYear, body.periodMonth,
      body.amountCents, body.warnPct, body.critPct, body.overPct
    );

    audit(req.user.id, 'budget', body.categoryId ?? 0, 'update', body);
    pushToTurso(
      `INSERT INTO budgets (user_id, category_id, period, period_year, period_month,
                            amount_cents, warn_pct, crit_pct, over_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scope_key, period, period_year, period_month)
       DO UPDATE SET amount_cents = excluded.amount_cents,
                     warn_pct = excluded.warn_pct,
                     crit_pct = excluded.crit_pct,
                     over_pct = excluded.over_pct,
                     category_id = excluded.category_id,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [req.user.id, body.categoryId, body.period, body.periodYear, body.periodMonth, body.amountCents, body.warnPct, body.critPct, body.overPct]
    );
    const row = db.prepare(
      `${SELECT_BUDGET}
       WHERE b.user_id = ? AND b.period = ? AND b.period_year = ? AND b.period_month = ?
         AND (b.category_id IS ?)`
    ).get(req.user.id, body.period, body.periodYear, body.periodMonth, body.categoryId);
    res.json(row);
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    getDb().prepare(`DELETE FROM budgets WHERE id = ? AND user_id = ?`)
      .run(req.params.id, req.user.id);
    pushToTurso(`DELETE FROM budgets WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
