/**
 * BUDGET WARNING MATH (§4) — Angular/TS edition, mirrors the server exactly.
 * Amounts are integer cents. Thresholds evaluated in EXACT ORDER so
 * 100% always wins over 90% over 80%.
 */
import { Budget } from './models';

export type BudgetTier = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface ExpenseLite {
  amountCents: number;
  localDate: string;
  categoryId: number | null;
}

export interface BudgetStatus {
  budgetId: number | null;
  categoryId: number | null;
  label: string;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  ratio: number;
  percentUsed: number;
  tier: BudgetTier;
  dailyBurnRateCents: number;
  projectedSpendCents: number;
  daysInPeriod: number;
  daysLeft: number;
  isProjectionOver: boolean;
}

/** → 'ok' | 'warning' (≥80) | 'critical' (≥90) | 'exceeded' (≥100) */
export function tierFor(percentUsed: number, b: Budget): BudgetTier {
  if (percentUsed >= b.overPct) return 'exceeded';
  if (percentUsed >= b.critPct) return 'critical';
  if (percentUsed >= b.warnPct) return 'warning';
  return 'ok';
}

export function computeBudgetStatus(opts: {
  expenses: ExpenseLite[];
  budgets: Budget[];
  range: { from: string; to: string };
  activeCategoryIds: number[] | null;
}): BudgetStatus[] {
  const { expenses, budgets, range, activeCategoryIds } = opts;

  const toDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const daysInPeriod = Math.round((toDay(range.to) - toDay(range.from)) / 86_400_000) + 1;
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.min(
    Math.max(1, Math.round((toDay(todayStr) - toDay(range.from)) / 86_400_000) + 1),
    daysInPeriod
  );

  // local_date string compare → immune to timezone/DST shifts
  const inWindow = expenses.filter((e) => e.localDate >= range.from && e.localDate <= range.to);

  return budgets.map((b) => {
    let scoped: ExpenseLite[];
    if (b.categoryId === null) {
      scoped = inWindow;                                        // GLOBAL = every expense
    } else if (activeCategoryIds && !activeCategoryIds.includes(b.categoryId)) {
      scoped = [];                                              // hidden by dashboard filter
    } else {
      scoped = inWindow.filter((e) => e.categoryId === b.categoryId);
    }

    const spent = scoped.reduce((sum, e) => sum + e.amountCents, 0);
    const limit = b.amountCents;
    const ratio = limit > 0 ? spent / limit : 0;
    const percentUsed = Math.round(ratio * 1000) / 10;          // 1 decimal

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
      tier: tierFor(percentUsed, b),                            // ← 80/90/100 gates
      dailyBurnRateCents: dailyBurnRate,
      projectedSpendCents: projectedSpend,
      daysInPeriod,
      daysLeft: daysInPeriod - daysElapsed,
      isProjectionOver: projectedSpend > limit && percentUsed < b.overPct,
    };
  });
}
