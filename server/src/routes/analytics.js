'use strict';
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeBudgetStatus } = require('../services/budgetStatus');
const { monthRange, yearRange } = require('../lib/time');

const router = express.Router();
router.use(requireAuth);

/** Loads expenses + budgets for a local_date window (shared by all analytics). */
function loadWindow(userId, from, to, categoryIds, kind) {
  const db = getDb();
  const where = ['user_id = ?', 'deleted_at IS NULL', 'local_date >= ?', 'local_date <= ?'];
  const params = [userId, from, to];
  if (kind && kind !== 'all') { where.push('kind = ?'); params.push(kind); }
  if (categoryIds && categoryIds.length) {
    where.push(`category_id IN (${categoryIds.map(() => '?').join(',')})`);
    params.push(...categoryIds);
  }
  const expenses = db
    .prepare(
      `SELECT id, category_id AS categoryId, category_name_snapshot AS categorySnapshot,
              category_icon_snapshot AS categoryIcon, amount_cents AS amountCents,
              kind, local_date AS localDate, merchant, notes
       FROM expenses WHERE ${where.join(' AND ')} ORDER BY local_date ASC`
    )
    .all(...params);

  const budgets = db.prepare(
    `SELECT b.id, b.category_id AS categoryId, b.period, b.period_year AS periodYear,
            b.period_month AS periodMonth, b.amount_cents AS amountCents,
            b.warn_pct AS warnPct, b.crit_pct AS critPct, b.over_pct AS overPct,
            COALESCE(c.name, 'Global') AS label
     FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ?`
  ).all(userId);

  return { expenses, budgets };
}

function parseRange(req) {
  if (req.query.from && req.query.to) return { from: req.query.from, to: req.query.to };
  const year = Number(req.query.year) || new Date().getFullYear();
  if (req.query.period === 'yearly') return yearRange(year);
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  return monthRange(year, month);
}

function parseCategoryIds(req) {
  if (!req.query.categoryIds) return [];
  return String(req.query.categoryIds).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

function parseKind(req, fallback) {
  const k = req.query.kind;
  return ['expense', 'income', 'all'].includes(k) ? k : fallback;
}

/** GET /api/analytics/summary — expense/income/net KPIs for the filter window. */
router.get('/summary', (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const kind = parseKind(req, 'all');
    const { expenses } = loadWindow(req.user.id, from, to, parseCategoryIds(req), kind);

    const expenseRows = expenses.filter((e) => e.kind !== 'income');
    const incomeRows = expenses.filter((e) => e.kind === 'income');
    const expenseCents = expenseRows.reduce((s, e) => s + e.amountCents, 0);
    const incomeCents = incomeRows.reduce((s, e) => s + e.amountCents, 0);
    const netCents = incomeCents - expenseCents;
    const savingsRate = incomeCents > 0 ? Math.round((netCents / incomeCents) * 1000) / 10 : 0;
    const avgExpenseCents = expenseRows.length ? Math.round(expenseCents / expenseRows.length) : 0;

    const byCategory = new Map();
    for (const e of expenseRows) {
      const key = e.categoryId ?? 0;
      const cur = byCategory.get(key) ?? {
        categoryId: e.categoryId, name: e.categorySnapshot,
        icon: e.categoryIcon || null, totalCents: 0, count: 0,
      };
      cur.totalCents += e.amountCents;
      cur.count += 1;
      byCategory.set(key, cur);
    }
    const topCategories = [...byCategory.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 8);

    res.json({
      range: { from, to },
      expenseCents, incomeCents, netCents, savingsRate,
      count: expenses.length,
      expenseCount: expenseRows.length,
      incomeCount: incomeRows.length,
      avgExpenseCents,
      topCategories,
    });
  } catch (err) { next(err); }
});

/** GET /api/analytics/trends?groupBy=day|week|month|year — expense/income/net series. */
router.get('/trends', (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const groupBy = ['day', 'week', 'month', 'year'].includes(req.query.groupBy)
      ? req.query.groupBy : 'day';
    const kind = parseKind(req, 'all');
    const { expenses } = loadWindow(req.user.id, from, to, parseCategoryIds(req), kind);

    const bucketOf = {
      day:  (d) => d,
      week: (d) => {
        const t = new Date(d + 'T00:00:00Z');
        const day = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - day + 3);
        const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
        const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
        return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
      },
      month: (d) => d.slice(0, 7),
      year:  (d) => d.slice(0, 4),
    }[groupBy];

    const buckets = new Map();
    for (const e of expenses) {
      const key = bucketOf(e.localDate);
      const cur = buckets.get(key) ?? { expenseCents: 0, incomeCents: 0 };
      if (e.kind === 'income') cur.incomeCents += e.amountCents;
      else cur.expenseCents += e.amountCents;
      buckets.set(key, cur);
    }
    const series = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        bucket,
        expenseCents: v.expenseCents,
        incomeCents: v.incomeCents,
        netCents: v.incomeCents - v.expenseCents,
        totalCents: v.expenseCents,
      }));

    res.json({ range: { from, to }, groupBy, series });
  } catch (err) { next(err); }
});

/** GET /api/analytics/budget-status — budgets count EXPENSES only (income never trips alerts). */
router.get('/budget-status', (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const { expenses, budgets } = loadWindow(req.user.id, from, to, null, 'expense');
    const activeCategoryIds = parseCategoryIds(req);
    const statuses = computeBudgetStatus({
      expenses,
      budgets,
      range: { from, to },
      activeCategoryIds: activeCategoryIds.length ? activeCategoryIds : null,
    });
    res.json({ range: { from, to }, statuses });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* GET /analytics/insights — deep dive: period-over-period, streaks,    */
/* weekday patterns, recurring merchants, category shares. Cached 5s    */
/* so a busy dashboard doesn't recompute the same window repeatedly.    */
/* ------------------------------------------------------------------ */
const insightsCache = new Map();
const INSIGHT_TTL_MS = 5000;

router.get('/insights', (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const catIds = parseCategoryIds(req);
    const kind = parseKind(req, 'all');
    const cacheKey = `${req.user.id}|${from}|${to}|${catIds.join(',')}|${kind}`;
    const hit = insightsCache.get(cacheKey);
    if (hit && hit.exp > Date.now()) return res.json(hit.data);

    const db = getDb();
    const { expenses } = loadWindow(req.user.id, from, to, catIds, kind);

    // Previous period of equal length (period-over-period comparison).
    const d0 = Date.parse(from + 'T00:00:00Z');
    const d1 = Date.parse(to + 'T00:00:00Z');
    const spanDays = Math.round((d1 - d0) / 86400000) + 1;
    const pTo = new Date(d0 - 86400000).toISOString().slice(0, 10);
    const pFrom = new Date(d0 - spanDays * 86400000).toISOString().slice(0, 10);
    const prev = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents END), 0) AS incomeCents,
              COALESCE(SUM(CASE WHEN kind <> 'income' THEN amount_cents END), 0) AS expenseCents
       FROM expenses WHERE user_id = ? AND deleted_at IS NULL
         AND local_date >= ? AND local_date <= ?`
    ).get(req.user.id, pFrom, pTo);

    const expenseCents = expenses.filter((e) => e.kind !== 'income').reduce((s, e) => s + e.amountCents, 0);
    const incomeCents = expenses.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amountCents, 0);
    const netCents = incomeCents - expenseCents;
    const prevExpense = prev.expenseCents || 0;
    const prevIncome = prev.incomeCents || 0;
    const prevNet = prevIncome - prevExpense;
    const deltaPct = (cur, prv) => (prv > 0 ? Math.round(((cur - prv) / prv) * 1000) / 10 : (cur > 0 ? 100 : 0));

    // No-spend days, longest streak, biggest debit, recurring merchants.
    const spendDays = new Set();
    let biggest = null;
    const merchants = new Map();
    const weekdayDistribution = [0, 0, 0, 0, 0, 0, 0]; // Mon → Sun
    for (const e of expenses) {
      if (e.kind === 'income') continue;
      spendDays.add(e.localDate);
      if (!biggest || e.amountCents > biggest.amountCents) {
        biggest = {
          amountCents: e.amountCents, merchant: e.merchant || e.categorySnapshot,
          localDate: e.localDate, icon: e.categoryIcon || '🏷️',
        };
      }
      if (e.merchant) {
        const m = merchants.get(e.merchant) || { merchant: e.merchant, totalCents: 0, count: 0 };
        m.totalCents += e.amountCents; m.count += 1;
        merchants.set(e.merchant, m);
      }
      const dow = new Date(e.localDate + 'T00:00:00Z').getUTCDay();
      weekdayDistribution[(dow + 6) % 7] += e.amountCents;
    }
    let longestStreak = 0; let run = 0;
    const maxDaysToScan = Math.min(spanDays, 366);
    for (let i = 0; i < maxDaysToScan; i++) {
      const iso = new Date(d0 + i * 86400000).toISOString().slice(0, 10);
      if (spendDays.has(iso)) { run += 1; longestStreak = Math.max(longestStreak, run); } else run = 0;
    }

    const topMerchant = [...merchants.values()].sort((a, b) => b.totalCents - a.totalCents)[0] || null;
    const recurring = [...merchants.values()].filter((m) => m.count >= 2)
      .sort((a, b) => b.totalCents - a.totalCents).slice(0, 5);

    // Weekday vs weekend spending.
    let weekdayCents = 0; let weekendCents = 0;
    const weekdayDates = new Set(); const weekendDates = new Set();
    for (const e of expenses) {
      if (e.kind === 'income') continue;
      const dow = new Date(e.localDate + 'T00:00:00Z').getUTCDay();
      if (dow === 0 || dow === 6) { weekendCents += e.amountCents; weekendDates.add(e.localDate); }
      else { weekdayCents += e.amountCents; weekdayDates.add(e.localDate); }
    }

    // Category shares (expenses only, with emoji + color for the donut chart).
    const byCat = new Map();
    for (const e of expenses) {
      if (e.kind === 'income') continue;
      const key = e.categoryId ?? 0;
      const c = byCat.get(key) || {
        name: e.categorySnapshot, icon: e.categoryIcon || '🏷️',
        color: e.categoryColor || '#6366F1', totalCents: 0, count: 0,
      };
      c.totalCents += e.amountCents; c.count += 1;
      byCat.set(key, c);
    }
    const categoryShares = [...byCat.values()].sort((a, b) => b.totalCents - a.totalCents)
      .map((c) => ({ ...c, pct: expenseCents ? Math.round((c.totalCents / expenseCents) * 1000) / 10 : 0 }));

    const data = {
      range: { from, to }, prevRange: { from: pFrom, to: pTo },
      comparison: {
        expenseCents, prevExpenseCents: prevExpense, expenseDeltaPct: deltaPct(expenseCents, prevExpense),
        incomeCents, prevIncomeCents: prevIncome, incomeDeltaPct: deltaPct(incomeCents, prevIncome),
        netCents, prevNetCents: prevNet,
        netDeltaPct: prevNet !== 0
          ? Math.round(((netCents - prevNet) / Math.abs(prevNet)) * 1000) / 10
          : (netCents > 0 ? 100 : 0),
      },
      days: {
        total: spanDays, withSpend: spendDays.size,
        noSpendDays: Math.max(0, spanDays - spendDays.size),
        longestNoSpendStreak: longestStreak,
      },
      dailyAverageCents: spanDays > 0 ? Math.round(expenseCents / spanDays) : 0,
      biggestExpense: biggest,
      topMerchant, recurring,
      weekdayVsWeekend: {
        weekdayCents, weekendCents,
        weekdayAvg: weekdayDates.size ? Math.round(weekdayCents / weekdayDates.size) : 0,
        weekendAvg: weekendDates.size ? Math.round(weekendCents / weekendDates.size) : 0,
      },
      weekdayDistribution,
      categoryShares,
    };

    insightsCache.set(cacheKey, { data, exp: Date.now() + INSIGHT_TTL_MS });
    if (insightsCache.size > 500) insightsCache.delete(insightsCache.keys().next().value);
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;