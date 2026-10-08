import { Component, HostListener, Input, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FilterService, Preset } from '../../core/filter.service';
import { Category, KindFilter } from '../../core/models';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
  <div class="filters card" data-tour="filter-bar">
    <div class="filters-top">
      <div class="group">
        <button class="tab" [class.on]="filter.preset() === 'today'" (click)="setPreset('today')" title="Show transactions for today only">Today</button>
        <button class="tab" [class.on]="filter.preset() === 'thisWeek'" (click)="setPreset('thisWeek')">This week</button>
        <button class="tab" [class.on]="filter.preset() === 'last7Days'" (click)="setPreset('last7Days')">7 days</button>
        <button class="tab" [class.on]="filter.preset() === 'last30Days'" (click)="setPreset('last30Days')">30 days</button>
        <button class="tab" [class.on]="filter.preset() === 'thisMonth'" (click)="setPreset('thisMonth')">This month</button>
        <button class="tab" [class.on]="filter.preset() === 'lastMonth'" (click)="setPreset('lastMonth')">Last month</button>

        <!-- Expandable 10-Year Period Selector -->
        <div class="year-menu-wrap" (click)="$event.stopPropagation()">
          <button
            type="button"
            id="filter-yearSelect"
            class="tab year-tab"
            [class.on]="filter.preset() === 'thisYear' || filter.preset() === 'year'"
            (click)="toggleYearMenu()"
            title="Select calendar year (10-year period)"
          >
            <span>{{ yearDisplay() }}</span>
            <span class="tab-arrow" [class.open]="yearMenuOpen()">▾</span>
          </button>

          <div class="year-dropdown" *ngIf="yearMenuOpen()" role="listbox">
            <div class="year-dropdown-header">10-Year Period</div>
            <div class="year-list">
              <button
                type="button"
                *ngFor="let y of tenYearList"
                class="year-item"
                [class.active]="(filter.preset() === 'thisYear' || filter.preset() === 'year') && filter.selectedYear() === y"
                (click)="selectYear(y)"
              >
                <span class="year-num">{{ y }}</span>
                <span class="year-badge" *ngIf="y === currentYear">Current</span>
                <span class="year-check" *ngIf="(filter.preset() === 'thisYear' || filter.preset() === 'year') && filter.selectedYear() === y">✓</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 10-Year Period Preset -->
        <button
          class="tab"
          [class.on]="filter.preset() === 'tenYears'"
          (click)="setPreset('tenYears')"
          title="View 10-year historical & future financial period"
        >
          10 Years
        </button>

        <button class="tab" [class.on]="filter.preset() === 'custom'" (click)="toggleCustom()">Custom…</button>
      </div>

      <ng-container *ngIf="showCustom">
        <div class="group">
          <input id="filter-customFrom" name="customFrom" type="date" [(ngModel)]="customFrom" (change)="applyCustom()" />
          <span class="sep">→</span>
          <input id="filter-customTo" name="customTo" type="date" [(ngModel)]="customTo" (change)="applyCustom()" />
        </div>
      </ng-container>

      <div class="group">
        <button class="tab" *ngFor="let k of kinds" [class.on]="filter.kind() === k.value" (click)="filter.setKind(k.value)">{{ k.label }}</button>
      </div>

      <div class="group">
        <span class="gb-label" title="Controls how trend charts and breakdowns group data">Chart view:</span>
        <div class="groupby-wrap">
          <select
            id="filter-groupBy"
            name="groupBy"
            class="groupby-select"
            [ngModel]="filter.groupBy()"
            (ngModelChange)="selectGroupBy($event)"
            title="Change chart view (Daily, Weekly, Monthly, Yearly)"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </div>
        <span class="range">{{ filter.activePresetLabel() }}</span>
      </div>
    </div>

    <!-- Horizontal Categories Row -->
    <div class="categories-bar" *ngIf="categories && categories.length">
      <div class="categories-inner">
        <button class="cat" *ngFor="let c of categories" [class.on]="filter.categoryIds().includes(c.id)" [style.background]="filter.categoryIds().includes(c.id) ? c.colorHex : '#fff'" [style.color]="filter.categoryIds().includes(c.id) ? '#fff' : '#334155'" [style.borderColor]="c.colorHex" (click)="filter.toggleCategory(c.id)">{{ c.icon || '🏷️' }} {{ c.name }}</button>
        <button class="cat clear" *ngIf="filter.categoryIds().length" (click)="filter.setCategoryIds([])">✕ Clear</button>
      </div>
    </div>
  </div>`,
  styles: [`
    .filters{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    .filters-top{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .group{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .categories-bar{display:flex;align-items:center;width:100%;border-top:1px dashed #E2E8F0;padding-top:10px}
    .categories-inner{display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center;width:100%}
    .tab,.cat{
      font-size:12px;padding:6px 11px;border-radius:999px;border:1px solid #CBD5E1;
      background:#fff;color:#334155;cursor:pointer;user-select:none;
      transition:background-color 0.05s ease, border-color 0.05s ease, color 0.05s ease, transform 0.05s ease;
    }
    .tab:hover,.cat:hover{border-color:#94A3B8;background:#F8FAFC}
    .tab:active,.cat:active{transform:scale(0.97)}
    .tab.on{background-color:#6366F1;border-color:#6366F1;color:#fff}
    .year-menu-wrap{position:relative;display:inline-flex;align-items:center}
    .year-tab{display:inline-flex;align-items:center;gap:5px;cursor:pointer}
    .tab-arrow{font-size:10px;line-height:1;transition:transform 0.15s ease}
    .tab-arrow.open{transform:rotate(180deg)}
    .year-dropdown{
      position:absolute;top:calc(100% + 6px);left:0;z-index:100;
      min-width:148px;background:#ffffff;border-radius:12px;
      border:1px solid #E2E8F0;
      box-shadow:0 12px 28px -4px rgba(15,23,42,0.18),0 4px 10px rgba(15,23,42,0.06);
      padding:6px;animation:menuPop 0.12s ease-out;
    }
    .year-dropdown-header{
      font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
      color:#94A3B8;padding:6px 8px 6px;border-bottom:1px solid #F1F5F9;margin-bottom:4px;
    }
    .year-list{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
    .year-list::-webkit-scrollbar{width:5px}
    .year-list::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}
    .year-item{
      display:flex;align-items:center;justify-content:space-between;gap:8px;
      width:100%;padding:6px 10px;border-radius:8px;border:none;background:transparent;
      color:#1E293B;font-size:12px;font-weight:500;cursor:pointer;text-align:left;
      transition:background 0.1s ease,color 0.1s ease;
    }
    .year-item:hover{background:#F1F5F9;color:#0F172A}
    .year-item.active{background:#EEF2FF;color:#4F46E5;font-weight:600}
    .year-badge{
      font-size:9px;font-weight:600;padding:2px 6px;border-radius:999px;
      background:#E0E7FF;color:#4338CA;text-transform:uppercase;letter-spacing:0.02em;
    }
    .year-check{font-size:12px;color:#4F46E5;font-weight:bold;margin-left:auto}
    @keyframes menuPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    .cat.on{font-weight:600}
    .cat.clear{border-style:dashed}
    .sep{color:#94A3B8}
    input[type=date]{width:150px;padding:6px 8px;font-size:12px;transition:border-color 0.05s ease}
    .range{font-size:11px;color:#64748B;font-variant-numeric:tabular-nums}
    .gb-label{font-size:11px;color:#64748B;font-weight:600;margin-right:2px}
    .groupby-wrap{position:relative;display:inline-flex;align-items:center}
    .groupby-select{
      appearance:none;-webkit-appearance:none;-moz-appearance:none;
      display:inline-flex;align-items:center;font-size:12px;font-weight:500;
      padding:6px 26px 6px 11px;border-radius:8px;border:1px solid #CBD5E1;
      background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%2364748B' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E") no-repeat right 9px center;
      color:#1E293B;cursor:pointer;line-height:1.4;
      transition:border-color 0.1s ease,box-shadow 0.1s ease,background-color 0.1s ease;
    }
    .groupby-select:hover{border-color:#94A3B8;background-color:#F8FAFC}
    .groupby-select:focus{outline:none;border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,0.18)}
    .groupby-select option{font-size:12px;padding:6px 10px;background:#fff;color:#1E293B}
  `]
})
export class FilterBarComponent implements OnInit {
  private api = inject(ApiService);
  @Input() categories: Category[] = [];
  readonly filter = inject(FilterService);
  readonly kinds: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'expense', label: 'Expenses' },
    { value: 'income', label: 'Income' },
  ];
  get currentYear(): number {
    return new Date().getFullYear();
  }
  // Exactly 10-year period horizon: always dynamically rolls forward with each new calendar year
  get tenYearList(): number[] {
    const cur = this.currentYear;
    return Array.from({ length: 10 }, (_, i) => (cur + 1) - i);
  }

  readonly yearMenuOpen = signal(false);
  readonly groupByOpen = signal(false);
  showCustom = false;
  customFrom = '';
  customTo = '';

  constructor() {
    effect(() => {
      const r = this.filter.range();
      this.customFrom = r.from;
      this.customTo = r.to;
      if (this.filter.preset() === 'custom') {
        this.showCustom = true;
      }
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.categories || this.categories.length === 0) {
      try {
        const cats = await firstValueFrom(this.api.getCategories());
        if (cats && cats.length) {
          this.categories = cats;
        }
      } catch {}
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.yearMenuOpen.set(false);
    this.groupByOpen.set(false);
  }

  toggleYearMenu(): void {
    this.yearMenuOpen.set(!this.yearMenuOpen());
  }

  yearDisplay(): string {
    const isYearPreset = this.filter.preset() === 'thisYear' || this.filter.preset() === 'year';
    return isYearPreset ? String(this.filter.selectedYear()) : `${this.currentYear}`;
  }

  selectYear(y: number): void {
    this.showCustom = false;
    this.filter.setYear(y);
    this.yearMenuOpen.set(false);
  }

  selectGroupBy(g: 'day' | 'week' | 'month' | 'year'): void {
    this.filter.setGroupBy(g);
  }

  setPreset(p: Preset): void {
    this.showCustom = (p === 'custom');
    this.filter.setPreset(p);
  }

  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (this.showCustom) {
      this.filter.setCustomRange(this.customFrom, this.customTo);
    }
  }

  applyCustom(): void {
    if (this.customFrom && this.customTo && this.customFrom <= this.customTo) {
      this.filter.setCustomRange(this.customFrom, this.customTo);
    }
  }
}
