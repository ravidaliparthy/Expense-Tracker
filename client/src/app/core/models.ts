export type TransactionKind = 'expense' | 'income';
export type KindFilter = 'all' | TransactionKind;

export interface User {
  id: number;
  email: string;
  displayName: string;
  baseCurrency: string;
  timezone: string;
  isFirstLogin: boolean;
}

export interface Category {
  id: number;
  name: string;
  colorHex: string;
  icon?: string | null;
  isSystem: boolean;
  isArchived: boolean;
}

export interface Expense {
  id: number;
  categoryId: number | null;
  categorySnapshot: string;
  categoryColor: string;
  categoryIcon?: string | null;
  amountCents: number;
  currency: string;
  kind: TransactionKind;
  occurredAtUtc: string;
  localDate: string;
  merchant: string | null;
  notes: string | null;
  clientUuid: string;
  syncVersion: number;
}

export interface Budget {
  id: number;
  categoryId: number | null;
  period: 'monthly' | 'yearly';
  periodYear: number;
  periodMonth: number;
  amountCents: number;
  warnPct: number;
  critPct: number;
  overPct: number;
  label: string;
  color: string;
}

export interface ExpensePage { items: Expense[]; total: number; page: number; pageSize: number; }

/** Deep analytics payload from GET /api/analytics/insights. */
export interface Insights {
  range: { from: string; to: string };
  prevRange: { from: string; to: string };
  comparison: {
    expenseCents: number; prevExpenseCents: number; expenseDeltaPct: number;
    incomeCents: number; prevIncomeCents: number; incomeDeltaPct: number;
    netCents: number; prevNetCents: number; netDeltaPct: number;
  };
  days: { total: number; withSpend: number; noSpendDays: number; longestNoSpendStreak: number };
  dailyAverageCents: number;
  biggestExpense: { amountCents: number; merchant: string; localDate: string; icon: string } | null;
  topMerchant: { merchant: string; totalCents: number; count: number } | null;
  recurring: { merchant: string; totalCents: number; count: number }[];
  weekdayVsWeekend: { weekdayCents: number; weekendCents: number; weekdayAvg: number; weekendAvg: number };
  weekdayDistribution: number[];               // Mon → Sun
  categoryShares: { name: string; icon: string; color: string; totalCents: number; count: number; pct: number }[];
}

export interface Filters {
  from: string;
  to: string;
  categoryIds: number[];
  period: 'monthly' | 'yearly';
  groupBy: 'day' | 'week' | 'month' | 'year';
  kind: KindFilter;
}

export const TIER_COLORS: Record<string, string> = {
  ok: '#22C55E', warning: '#F59E0B', critical: '#F97316', exceeded: '#EF4444',
};

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'SGD', 'AED'];

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function signedMoney(cents: number, currency = 'USD'): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return sign + money(Math.abs(cents), currency);
}
