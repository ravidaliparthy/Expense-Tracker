import { computeBudgetStatus, tierFor, BudgetTier } from './budget-status';
import { Budget } from './models';

describe('BudgetStatus Math', () => {
  const dummyBudget: Budget = {
    id: 1,
    categoryId: 1,
    period: 'monthly',
    periodYear: 2026,
    periodMonth: 10,
    amountCents: 10000, // $100.00
    warnPct: 80,
    critPct: 90,
    overPct: 100,
    label: 'Groceries',
    color: '#3B82F6',
  };

  it('determines tiers correctly based on percentUsed', () => {
    expect(tierFor(50, dummyBudget)).toBe('ok');
    expect(tierFor(80, dummyBudget)).toBe('warning');
    expect(tierFor(89.9, dummyBudget)).toBe('warning');
    expect(tierFor(90, dummyBudget)).toBe('critical');
    expect(tierFor(99.9, dummyBudget)).toBe('critical');
    expect(tierFor(100, dummyBudget)).toBe('exceeded');
    expect(tierFor(125, dummyBudget)).toBe('exceeded');
  });

  it('computes budget status and spend correctly', () => {
    const expenses = [
      { amountCents: 2500, localDate: '2026-10-02', categoryId: 1 },
      { amountCents: 6000, localDate: '2026-10-05', categoryId: 1 },
    ];
    const range = { from: '2026-10-01', to: '2026-10-31' };
    const statuses = computeBudgetStatus({
      expenses,
      budgets: [dummyBudget],
      range,
      activeCategoryIds: null,
    });

    expect(statuses.length).toBe(1);
    expect(statuses[0].spentCents).toBe(8500);
    expect(statuses[0].remainingCents).toBe(1500);
    expect(statuses[0].percentUsed).toBe(85);
    expect(statuses[0].tier).toBe('warning');
  });
});
