import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Filters, KindFilter } from './models';

const pad = (n: number) => String(n).padStart(2, '0');
export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}
export function yearRange(year: number): { from: string; to: string } { return { from: `${year}-01-01`, to: `${year}-12-31` }; }
export function thisMonth(): { from: string; to: string } { const now = new Date(); return monthRange(now.getFullYear(), now.getMonth() + 1); }
export type Preset = 'today' | 'thisWeek' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'year' | 'tenYears' | 'custom';
const isoLocal = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly _preset = signal<Preset>('thisMonth'); readonly preset = this._preset.asReadonly();
  private readonly _range = signal<{ from: string; to: string }>(thisMonth()); readonly range = this._range.asReadonly();
  private readonly _selectedYear = signal<number>(new Date().getFullYear()); readonly selectedYear = this._selectedYear.asReadonly();
  private readonly _categoryIds = signal<number[]>([]); readonly categoryIds = this._categoryIds.asReadonly();
  private readonly _groupBy = signal<'day' | 'week' | 'month' | 'year'>('day'); readonly groupBy = this._groupBy.asReadonly();
  private readonly _kind = signal<KindFilter>('all'); readonly kind = this._kind.asReadonly();

  readonly filters = computed<Filters>(() => ({
    from: this._range().from, to: this._range().to, categoryIds: this._categoryIds(),
    period: (this._preset() === 'thisYear' || this._preset() === 'year' || this._preset() === 'tenYears') ? 'yearly' : 'monthly',
    groupBy: this._groupBy(), kind: this._kind(),
  }));
  readonly activePresetLabel = computed(() => {
    if (this._preset() === 'tenYears') return `${this._range().from} → ${this._range().to} (10-Yr Horizon)`;
    return `${this._range().from} → ${this._range().to}`;
  });

  constructor(private router: Router) { this.restoreFromUrl(); }

  setPreset(preset: Preset, custom?: { from: string; to: string }, targetYear?: number): void {
    const now = new Date();
    const curYear = now.getFullYear();
    let range = thisMonth();
    if (preset === 'today') {
      range = { from: isoLocal(now), to: isoLocal(now) };
      this._groupBy.set('day');
    }
    else if (preset === 'lastMonth') {
      const d = new Date(curYear, now.getMonth() - 1, 1);
      range = monthRange(d.getFullYear(), d.getMonth() + 1);
    }
    else if (preset === 'thisYear') {
      this._selectedYear.set(curYear);
      range = yearRange(curYear);
      this._groupBy.set('month');
    }
    else if (preset === 'year') {
      const y = targetYear ?? this._selectedYear();
      this._selectedYear.set(y);
      range = yearRange(y);
      this._groupBy.set('month');
    }
    else if (preset === 'tenYears') {
      const startYear = curYear - 9;
      range = { from: `${startYear}-01-01`, to: `${curYear}-12-31` };
      this._groupBy.set('year');
    }
    else if (preset === 'thisWeek') {
      const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      range = { from: isoLocal(monday), to: isoLocal(now) }; this._groupBy.set('day');
    }
    else if (preset === 'last7Days') {
      const from = new Date(now); from.setDate(now.getDate() - 6);
      range = { from: isoLocal(from), to: isoLocal(now) }; this._groupBy.set('day');
    }
    else if (preset === 'last30Days') {
      const from = new Date(now); from.setDate(now.getDate() - 29);
      range = { from: isoLocal(from), to: isoLocal(now) }; this._groupBy.set('day');
    }
    else if (preset === 'custom' && custom) range = custom;

    this._preset.set(preset);
    this._range.set(range);
    this.syncUrl();
  }

  setYear(year: number): void {
    this.setPreset('year', undefined, year);
  }

  setCustomRange(from: string, to: string): void { this._preset.set('custom'); this._range.set({ from, to }); this.syncUrl(); }
  setCategoryIds(ids: number[]): void { this._categoryIds.set(ids); this.syncUrl(); }
  toggleCategory(id: number): void { const cur = this._categoryIds(); this.setCategoryIds(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); }
  setGroupBy(g: 'day' | 'week' | 'month' | 'year'): void { this._groupBy.set(g); this.syncUrl(); }
  setKind(k: KindFilter): void { this._kind.set(k); this.syncUrl(); }
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncUrl(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      const f = this.filters();
      void this.router.navigate([], {
        queryParams: {
          from: f.from,
          to: f.to,
          cat: f.categoryIds.join(',') || null,
          gb: f.groupBy,
          kind: f.kind === 'all' ? null : f.kind,
          p: this._preset() !== 'thisMonth' ? this._preset() : null,
          yr: (this._preset() === 'year' || this._preset() === 'thisYear') ? this._selectedYear() : null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }, 40);
  }
  private restoreFromUrl(): void {
    const qp = this.router.routerState.snapshot.root.queryParams;
    if (qp['from'] && qp['to']) { this._preset.set('custom'); this._range.set({ from: String(qp['from']), to: String(qp['to']) }); }
    if (qp['cat']) this._categoryIds.set(String(qp['cat']).split(',').map(Number).filter(Boolean));
    if (qp['gb']) this._groupBy.set(qp['gb'] as 'day');
    if (qp['kind'] === 'expense' || qp['kind'] === 'income') this._kind.set(qp['kind']);
    if (qp['yr']) this._selectedYear.set(Number(qp['yr']));
    if (qp['p'] === 'tenYears') this.setPreset('tenYears');
    else if (qp['p'] === 'year' && qp['yr']) this.setYear(Number(qp['yr']));
  }
}
