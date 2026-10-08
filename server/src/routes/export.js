'use strict';
const express = require('express');
const { Readable } = require('stream');
const { format: csvFormat } = require('fast-csv');
const PDFDocument = require('pdfkit');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { expenseQuerySchema, validate } = require('../lib/validate');
const { buildFilters, SELECT_EXP } = require('./expenses');
const { computeBudgetStatus } = require('../services/budgetStatus');
const { monthRange, yearRange } = require('../lib/time');
const { formatCents } = require('../lib/money');

const router = express.Router();
router.use(requireAuth);

function resolveRange(req) {
  if (req.query.from && req.query.to) return { from: req.query.from, to: req.query.to };
  const year = Number(req.query.year) || new Date().getFullYear();
  if (req.query.period === 'yearly') return yearRange(year);
  return monthRange(year, Number(req.query.month) || new Date().getMonth() + 1);
}

const COLUMNS = [
  'id', 'localDate', 'occurredAtUtc', 'kind', 'categoryIcon', 'category', 'merchant',
  'signedAmount', 'amount', 'currency', 'notes',
];

/** GET /api/export/csv — streams the EXACT filtered rows currently in the dashboard. */
router.get('/csv', (req, res, next) => {
  try {
    const q = validate(expenseQuerySchema, req.query);
    const { clause, params } = buildFilters(q, req.user.id);
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${stamp}.csv"`);

    const rows = getDb()
      .prepare(`${SELECT_EXP} WHERE ${clause} ORDER BY e.local_date DESC, e.id DESC`)
      .iterate(...params);

    const source = Readable.from(
      (function* map() {
        for (const r of rows) {
          yield {
            id: r.id, localDate: r.localDate, occurredAtUtc: r.occurredAtUtc,
            kind: r.kind, categoryIcon: r.categoryIcon || '',
            category: r.categorySnapshot, merchant: r.merchant ?? '',
            signedAmount: `${r.kind === 'income' ? '+' : '-'}${(r.amountCents / 100).toFixed(2)}`,
            amount: (r.amountCents / 100).toFixed(2), currency: r.currency,
            notes: (r.notes ?? '').replace(/\r?\n/g, ' '),
          };
        }
      })()
    );

    source.pipe(csvFormat({ headers: true })).pipe(res);
  } catch (err) { next(err); }
});

function formatPdfMoney(cents, currency = 'USD') {
  const numStr = (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = cents < 0 ? '-' : '';
  return `${sign}${currency} ${numStr}`;
}

function cleanPdfText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** GET /api/export/pdf — visual report: KPIs, budget bars, table. */
router.get('/pdf', (req, res, next) => {
  try {
    const q = validate(expenseQuerySchema, req.query);
    const { clause, params } = buildFilters(q, req.user.id);
    const { from, to } = resolveRange(req);
    const userCurrency = req.user.baseCurrency || 'USD';
    const db = getDb();

    const rows = db
      .prepare(`${SELECT_EXP} WHERE ${clause} ORDER BY e.local_date DESC, e.id DESC`)
      .all(...params);
    const expenseCents = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amountCents, 0);
    const incomeCents = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amountCents, 0);
    const netCents = incomeCents - expenseCents;

    const budgets = db.prepare(
      `SELECT b.id, b.category_id AS categoryId, b.amount_cents AS amountCents,
              b.warn_pct AS warnPct, b.crit_pct AS critPct, b.over_pct AS overPct,
              COALESCE(c.name, 'Global') AS label
       FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? AND b.period = 'monthly'
         AND b.period_year = ? AND b.period_month = ?`
    ).all(req.user.id, Number(req.query.year) || new Date().getFullYear(),
          Number(req.query.month) || new Date().getMonth() + 1);

    const allExpenses = db.prepare(
      `SELECT category_id AS categoryId, amount_cents AS amountCents, local_date AS localDate
       FROM expenses WHERE user_id = ? AND kind = 'expense' AND deleted_at IS NULL`
    ).all(req.user.id);
    const statuses = computeBudgetStatus({ expenses: allExpenses, budgets, range: { from, to } });

    const TIER_COLORS = { ok: '#22C55E', warning: '#F59E0B', critical: '#F97316', exceeded: '#EF4444' };
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-report-${stamp}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    doc.fontSize(20).fillColor('#0F172A').text('Expense Report');
    doc.fontSize(9).fillColor('#64748B')
      .text(`${from}  ->  ${to}   |   Generated: ${new Date().toLocaleDateString()}   |   ${rows.length} transactions   |   Currency: ${userCurrency}`);
    doc.moveDown(1.2);

    const kpis = [
      ['Income', formatPdfMoney(incomeCents, userCurrency)],
      ['Expenses', formatPdfMoney(expenseCents, userCurrency)],
      ['Net Cashflow', formatPdfMoney(netCents, userCurrency)],
    ];
    let kpiX = 40;
    const kpiY = doc.y;
    for (const [label, value] of kpis) {
      doc.roundedRect(kpiX, kpiY, 220, 50, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#64748B').fontSize(8).text(label.toUpperCase(), kpiX + 14, kpiY + 10, { width: 190 });
      doc.fillColor('#0F172A').fontSize(14).text(value, kpiX + 14, kpiY + 24, { width: 190 });
      kpiX += 235;
    }
    doc.y = kpiY + 65;

    if (statuses.length) {
      doc.fontSize(12).fillColor('#0F172A').text('Budget Status');
      doc.moveDown(0.4);
      for (const s of statuses) {
        const y = doc.y;
        const cleanLabel = cleanPdfText(s.label) || 'Budget';
        doc.fontSize(9).fillColor('#334155').text(cleanLabel, 40, y, { width: 140 });
        doc.roundedRect(190, y + 2, 320, 10, 3).fill('#E2E8F0');
        const pct = Math.min(1, s.ratio);
        if (pct > 0) doc.roundedRect(190, y + 2, Math.max(4, 320 * pct), 10, 3).fill(TIER_COLORS[s.tier] || '#22C55E');
        doc.fontSize(8).fillColor('#334155')
          .text(`${s.percentUsed}% of ${formatPdfMoney(s.limitCents, userCurrency)} (${formatPdfMoney(s.spentCents, userCurrency)} spent)`,
                525, y, { width: 250 });
        doc.y = y + 18;
      }
      doc.moveDown(0.6);
    }

    doc.fontSize(12).fillColor('#0F172A').text('Transactions');
    doc.moveDown(0.4);
    const cols = [
      { key: 'localDate', label: 'DATE', w: 80 },
      { key: 'kind', label: 'TYPE', w: 60 },
      { key: 'categorySnapshot', label: 'CATEGORY', w: 140 },
      { key: 'merchant', label: 'MERCHANT', w: 160 },
      { key: 'amount', label: 'AMOUNT', w: 110 },
      { key: 'notes', label: 'NOTES', w: 200 },
    ];
    const drawHeader = () => {
      let cx = 40;
      const hY = doc.y;
      doc.fontSize(8).fillColor('#64748B');
      for (const c of cols) { doc.text(c.label, cx, hY, { width: c.w }); cx += c.w + 6; }
      doc.moveTo(40, hY + 12).lineTo(780, hY + 12).strokeColor('#CBD5E1').stroke();
      doc.y = hY + 18;
    };
    drawHeader();

    for (const r of rows) {
      if (doc.y > 520) { doc.addPage(); drawHeader(); }
      const y = doc.y;
      const cleanCat = cleanPdfText(r.categorySnapshot) || 'Uncategorized';
      const cleanMerch = cleanPdfText(r.merchant) || '-';
      const cleanNotes = cleanPdfText(r.notes) || '-';
      const line = {
        localDate: r.localDate,
        kind: r.kind === 'income' ? 'Credit' : 'Expense',
        categorySnapshot: cleanCat,
        merchant: cleanMerch,
        amount: `${r.kind === 'income' ? '+' : '-'}${formatPdfMoney(r.amountCents, r.currency || userCurrency)}`,
        notes: cleanNotes.slice(0, 60),
      };
      let cx = 40;
      doc.fontSize(8).fillColor('#1E293B');
      for (const c of cols) {
        doc.text(String(line[c.key]), cx, y, { width: c.w, ellipsis: true });
        cx += c.w + 6;
      }
      doc.y = y + 15;
    }

    doc.fontSize(7).fillColor('#94A3B8')
      .text('Generated by Expense Tracker — grouped by user local calendar dates.',
            40, 565, { width: 600 });
    doc.end();
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.COLUMNS = COLUMNS;
module.exports.resolveRange = resolveRange;

