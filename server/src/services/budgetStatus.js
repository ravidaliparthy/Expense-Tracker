'use strict';
/**
 * BUDGET WARNING MATH (§4 of the architecture) — server edition.
 * All amounts are INTEGER CENTS. Thresholds evaluated in exact order so
 * 100% always wins over 90% over 80%. Mirrored in the Angular client
 * (client/src/app/core/budget-status.ts) for instant filter feedback.
 */

/** → 'ok' | 'warning' (≥80) | 'critical' (≥90) | 'exceeded' (≥100) */
function tierFor(percentUsed, b) {
  if (percentUsed >= b.overPct) return 'exceeded';
  if (percentUsed >= b.critPct) return 'critical';
  if (percentUsed >= b.warnPct) return 'warning';
  return 'ok';
}

/**
 * @param {object} opts
 * @param {Array<{amountCents:number, localDate:string, categoryId:number|null}>} opts.expenses
 * @param {Array<object>} opts.budgets  rows from `budgets` joined w/ category name
 * @param {{from:string, to:string}} opts.range  inclusive local_date window
 * @param {number[]|null} opts.activeCategoryIds current dashboard filter (null = all)
 */
function computeBudgetStatus({ expenses, budgets, range, activeCategoryIds = null }) {
  const pad = (n) => String(n).padStart(2, '0');
  const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

  const daysInPeriod = Math.round((toDay(range.to) - toDay(range.from)) / 86400000) + 1;
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.min(
    Math.max(1, Math.round((toDay(todayStr) - toDay(range.from)) / 86400000) + 1),
    daysInPeriod
  );

  // Window filter uses local_date string compare → timezone-safe.
  const inWindow = expenses.filter((e) => e.localDate >= range.from && e.localDate <= range.to);

  return budgets.map((b) => {
    let scoped;
    if (b.categoryId === null) {
      scoped = inWindow;                                     // GLOBAL = every expense
    } else {
      if (activeCategoryIds && !activeCategoryIds.includes(b.categoryId)) {
        scoped = [];                                          // hidden by dashboard filter
      } else {
        scoped = inWindow.filter((e) => e.categoryId === b.categoryId);
      }
    }

    const spent = scoped.reduce((s, e) => s + e.amountCents, 0);
    const limit = b.amountCents;
    const ratio = limit > 0 ? spent / limit : 0;
    const percentUsed = Math.round(ratio * 1000) / 10;        // 1 decimal

    const dailyBurnRate = Math.round((spent / daysElapsed) * 100) / 100;
    const projectedSpend = Math.round(dailyBurnRate * daysInPeriod);

    return {
      budgetId: b.id,
      categoryId: b.categoryId,
      label: b.label,
      limitCents: limit,
      spentCents: spent,
      remainingCents: limit - spent,
      ratio,
      percentUsed,
      tier: tierFor(percentUsed, b),                          // ← 80/90/100 gates
      dailyBurnRateCents: dailyBurnRate,
      projectedSpendCents: projectedSpend,
      daysInPeriod,
      daysLeft: daysInPeriod - daysElapsed,
      isProjectionOver: projectedSpend > limit && percentUsed < b.overPct,
    };
  });
}

module.exports = { computeBudgetStatus, tierFor };
