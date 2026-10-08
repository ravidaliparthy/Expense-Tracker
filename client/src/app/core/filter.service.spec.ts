import { monthRange, yearRange } from './filter.service';

describe('FilterService helpers', () => {
  it('correctly calculates monthRange for February in leap year', () => {
    const range = monthRange(2024, 2);
    expect(range.from).toBe('2024-02-01');
    expect(range.to).toBe('2024-02-29');
  });

  it('correctly calculates monthRange for February in non-leap year', () => {
    const range = monthRange(2025, 2);
    expect(range.from).toBe('2025-02-01');
    expect(range.to).toBe('2025-02-28');
  });

  it('correctly calculates yearRange', () => {
    const range = yearRange(2026);
    expect(range.from).toBe('2026-01-01');
    expect(range.to).toBe('2026-12-31');
  });
});
