import { ChangeDetectorRef, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FilterService } from '../../core/filter.service';
import { AuthService } from '../../core/auth.service';
import { Category, Expense, money, signedMoney } from '../../core/models';
import { FilterBarComponent } from '../dashboard/filter-bar.component';
import { ExpenseFormComponent, ExpenseFormValue } from '../dashboard/expense-form.component';

@Component({
  selector: 'app-transactions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterBarComponent, ExpenseFormComponent],
  template: `
    <div class="toolbar">
      <div>
        <h1>Transactions</h1>
        <div class="sub">{{ filter.activePresetLabel() }} · {{ total() }} total records · {{ currency() }}</div>
      </div>
      <div class="actions">
        <button class="btn-ghost" [disabled]="exportBusy()" (click)="exportCsv()">⤓ CSV</button>
        <button class="btn-ghost" [disabled]="exportBusy()" (click)="exportPdf()">⤓ PDF</button>
        <button class="btn-primary" (click)="openCreate()">+ Add transaction</button>
      </div>
    </div>

    <div class="flash {{ f.type }}" *ngIf="flash() as f" (click)="flash.set(null)">
      <span>{{ f.type === 'ok' ? '✓' : (f.type === 'warn' ? '⚠' : '✕') }}</span>
      <span>{{ f.text }}</span>
      <span style="margin-left:auto;opacity:0.6;font-size:11px">✕</span>
    </div>

    <!-- Global filter bar (presets, kind, category chips, interval) -->
    <app-filter-bar [categories]="categories()"></app-filter-bar>

    <!-- Search, Sort & Summary Stats -->
    <div class="summary-bar card">
      <div class="search-box">
        <input
          type="text"
          id="tx-search"
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
          placeholder="🔍 Search merchant, category, notes, or amount..."
        />
      </div>

      <div class="sort-controls">
        <span class="sort-lbl">Sort:</span>
        <button
          type="button"
          class="sort-btn"
          [class.active]="sortField() === 'date'"
          (click)="toggleSort('date')"
          title="Toggle date sort"
        >
          Date {{ sortField() === 'date' ? (sortDirection() === 'desc' ? '▼ Newest' : '▲ Oldest') : '↕' }}
        </button>
        <button
          type="button"
          class="sort-btn"
          [class.active]="sortField() === 'amount'"
          (click)="toggleSort('amount')"
          title="Toggle amount sort"
        >
          Amount {{ sortField() === 'amount' ? (sortDirection() === 'desc' ? '▼ High → Low' : '▲ Low → High') : '↕' }}
        </button>
      </div>

      <div class="stats-pills">
        <div class="pill">
          <span class="plbl">Expenses:</span>
          <span class="pval neg">{{ money(summaryMetrics().expense, currency()) }}</span>
        </div>
        <div class="pill">
          <span class="plbl">Income:</span>
          <span class="pval pos">{{ money(summaryMetrics().income, currency()) }}</span>
        </div>
        <div class="pill">
          <span class="plbl">Net:</span>
          <span class="pval" [class.pos]="summaryMetrics().net >= 0" [class.neg]="summaryMetrics().net < 0">
            {{ signedMoney(summaryMetrics().net, currency()) }}
          </span>
        </div>
        <div class="pill count">
          <span class="plbl">Count:</span>
          <span class="pval">{{ sortedFilteredExpenses().length }}</span>
        </div>
      </div>
    </div>

    <!-- Transactions Table Card -->
    <div class="card tx-card">
      <div class="table-header-row">
        <h3>All Transactions ({{ sortedFilteredExpenses().length }})</h3>
        <div *ngIf="searchQuery().trim()" class="search-tag">
          Filtered by search: "{{ searchQuery()" }}"
          <button type="button" class="btn-clear-search" (click)="searchQuery.set('')">✕</button>
        </div>
      </div>

      <div *ngIf="sortedFilteredExpenses().length === 0" class="empty-state">
        <p *ngIf="searchQuery().trim()">No transactions match your search "{{ searchQuery() }}".</p>
        <p *ngIf="!searchQuery().trim()">No transactions found for the selected filter range.</p>
      </div>

      <div class="tbl-wrap" *ngIf="sortedFilteredExpenses().length > 0">
        <table>
          <thead>
            <tr>
              <th class="sortable" (click)="toggleSort('date')" title="Click to sort by date">
                Date <span class="sort-icon">{{ sortField() === 'date' ? (sortDirection() === 'desc' ? '▼' : '▲') : '↕' }}</span>
              </th>
              <th>Type</th>
              <th>Category</th>
              <th>Merchant / Source</th>
              <th class="notes">Notes</th>
              <th class="amount sortable" (click)="toggleSort('amount')" title="Click to sort by amount">
                Amount <span class="sort-icon">{{ sortField() === 'amount' ? (sortDirection() === 'desc' ? '▼' : '▲') : '↕' }}</span>
              </th>
              <th style="text-align:right;width:95px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let e of sortedFilteredExpenses(); trackBy: trackById"
              [class.income]="e.kind === 'income'"
              [class.deleting]="deletingIds().has(e.id)"
            >
              <td class="mono">{{ e.localDate }}</td>
              <td>
                <span class="kind" [class.income]="e.kind === 'income'">
                  {{ e.kind === 'income' ? 'Credit' : 'Expense' }}
                </span>
              </td>
              <td>
                <span class="chip" [style.background]="hex(e.categoryColor, 0.14)" [style.color]="e.categoryColor">
                  {{ e.categoryIcon || '🏷️' }} {{ e.categorySnapshot }}
                </span>
              </td>
              <td>{{ e.merchant || '—' }}</td>
              <td class="notes-cell" [title]="e.notes || ''">{{ e.notes || '—' }}</td>
              <td class="amount" [class.plus]="e.kind === 'income'" [class.minus]="e.kind !== 'income'">
                {{ e.kind === 'income' ? '+' : '-' }}{{ money(e.amountCents, e.currency) }}
              </td>
              <td style="white-space:nowrap;text-align:right">
                <button
                  type="button"
                  class="tbl-icon-btn"
                  title="Edit transaction"
                  [id]="'edit-tx-' + e.id"
                  (click)="openEdit(e)"
                >✎</button>
                <button
                  type="button"
                  class="tbl-icon-btn danger"
                  [disabled]="deletingIds().has(e.id)"
                  title="Delete transaction"
                  [id]="'delete-tx-' + e.id"
                  (click)="onRemove(e)"
                >🗑</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit/Add Form Modal -->
    <app-expense-form
      *ngIf="formOpen()"
      [expense]="editing()"
      [categories]="categories()"
      [currency]="currency()"
      (save)="onSave($event)"
      (createCategory)="onCreateCategory($event)"
      (close)="formOpen.set(false)"
    ></app-expense-form>
  `,
  styles: [`
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .toolbar h1 { margin: 0; font-size: 22px; }
    .toolbar .sub { color: #64748B; font-size: 12px; margin-top: 2px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }

    .summary-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 16px;
    }
    .search-box { flex: 1; min-width: 220px; }
    .search-box input {
      width: 100%;
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      font-size: 13px;
    }

    .sort-controls { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .sort-lbl { color: #64748B; font-weight: 500; }
    .sort-btn {
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      color: #334155;
      border-radius: 6px;
      padding: 4px 9px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.05s ease;
    }
    .sort-btn:hover { border-color: #94A3B8; background: #E2E8F0; }
    .sort-btn.active { background: #EEF2FF; border-color: #6366F1; color: #4F46E5; font-weight: 600; }
    .sortable { cursor: pointer; user-select: none; transition: color 0.05s ease; }
    .sortable:hover { color: #4F46E5; }
    .sort-icon { font-size: 10px; margin-left: 3px; color: #6366F1; }

    .stats-pills { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .pill .plbl { color: #64748B; font-weight: 500; }
    .pill .pval { font-weight: 700; font-variant-numeric: tabular-nums; }
    .pill .pval.pos { color: #047857; }
    .pill .pval.neg { color: #DC2626; }

    .tx-card { padding: 16px; }
    .table-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .table-header-row h3 { margin: 0; font-size: 16px; }
    .search-tag {
      font-size: 12px;
      color: #4F46E5;
      background: #EEF2FF;
      padding: 3px 10px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-clear-search {
      background: transparent;
      border: none;
      color: #4F46E5;
      cursor: pointer;
      font-weight: bold;
      padding: 0;
    }

    .empty-state {
      color: #94A3B8;
      text-align: center;
      padding: 40px 0;
      font-size: 14px;
    }

    .tbl-wrap { overflow-x: auto; }
    .mono { font-variant-numeric: tabular-nums; color: #475569; white-space: nowrap; font-size: 13px; }
    .notes-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #64748B; }
    .kind { font-size: 11px; border-radius: 999px; padding: 3px 8px; background: #FEE2E2; color: #B91C1C; }
    .kind.income { background: #DCFCE7; color: #047857; }
    .amount.plus { color: #047857; }
    .amount.minus { color: #DC2626; }
    tr.income { background: #F0FDF4; }

    /* Dark mode */
    :host-context([data-theme='dark']) .pill { background: #1E293B; border-color: #334155; }
    :host-context([data-theme='dark']) .mono { color: #94A3B8; }
    :host-context([data-theme='dark']) .notes-cell { color: #94A3B8; }
    :host-context([data-theme='dark']) tr.income { background: rgba(34, 197, 94, 0.08); }
    :host-context([data-theme='dark']) .search-box input { background: #0F172A; border-color: #334155; color: #F1F5F9; }
    :host-context([data-theme='dark']) .search-tag { background: #312E81; color: #C7D2FE; }
    :host-context([data-theme='dark']) .sort-btn { background: #1E293B; border-color: #334155; color: #CBD5E1; }
    :host-context([data-theme='dark']) .sort-btn:hover { background: #334155; }
    :host-context([data-theme='dark']) .sort-btn.active { background: #312E81; border-color: #6366F1; color: #A5B4FC; }
    :host-context([data-theme='dark']) .sortable:hover { color: #A5B4FC; }
  `],
})
export class TransactionsPage {
  readonly filter = inject(FilterService);
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  readonly money = money;
  readonly signedMoney = signedMoney;
  readonly trackById = (_: number, e: Expense): number => e.id;

  readonly expenses = signal<Expense[]>([]);
  readonly total = signal(0);
  readonly categories = signal<Category[]>([]);
  readonly flash = signal<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  readonly exportBusy = signal(false);
  readonly formOpen = signal(false);
  readonly editing = signal<Expense | null>(null);
  readonly deletingIds = signal<Set<number>>(new Set());
  readonly searchQuery = signal('');

  // Sorting
  readonly sortField = signal<'date' | 'amount'>('date');
  readonly sortDirection = signal<'desc' | 'asc'>('desc');

  readonly currency = computed(() => this.auth.user()?.baseCurrency || 'USD');

  readonly filteredExpenses = computed(() => {
    const list = this.expenses();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const matchMerchant = (e.merchant || '').toLowerCase().includes(q);
      const matchCat = (e.categorySnapshot || '').toLowerCase().includes(q);
      const matchNotes = (e.notes || '').toLowerCase().includes(q);
      const matchDate = (e.localDate || '').includes(q);
      const matchAmt = (e.amountCents / 100).toString().includes(q);
      return matchMerchant || matchCat || matchNotes || matchDate || matchAmt;
    });
  });

  /** Sorted and filtered transactions */
  readonly sortedFilteredExpenses = computed(() => {
    const list = [...this.filteredExpenses()];
    const field = this.sortField();
    const dir = this.sortDirection();
    return list.sort((a, b) => {
      if (field === 'date') {
        const cmp = a.localDate.localeCompare(b.localDate);
        return dir === 'desc' ? -cmp : cmp;
      } else {
        const cmp = a.amountCents - b.amountCents;
        return dir === 'desc' ? -cmp : cmp;
      }
    });
  });

  readonly summaryMetrics = computed(() => {
    const list = this.filteredExpenses();
    let expense = 0;
    let income = 0;
    for (const e of list) {
      if (e.kind === 'income') income += e.amountCents;
      else expense += e.amountCents;
    }
    return { expense, income, net: income - expense };
  });

  constructor() {
    effect(
      () => {
        const f = this.filter.filters();
        void this.load(f);
      },
      { allowSignalWrites: true }
    );
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  toggleSort(field: 'date' | 'amount'): void {
    if (this.sortField() === field) {
      this.sortDirection.update((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('desc');
    }
  }

  async load(f = this.filter.filters()): Promise<void> {
    try {
      if (this.categories().length === 0) {
        try {
          const cats = await firstValueFrom(this.api.getCategories());
          if (cats && cats.length) this.categories.set(cats);
        } catch {}
      }

      const res = await firstValueFrom(this.api.getExpenses(f));
      this.expenses.set(res.items || []);
      this.total.set(res.total || 0);
      this.cdr.detectChanges();
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to load transactions' });
    }
  }

  hex(color: string, alpha: number): string {
    const c = color && color.startsWith('#') ? color : '#64748B';
    const r = parseInt(c.slice(1, 3), 16) || 100;
    const g = parseInt(c.slice(3, 5), 16) || 116;
    const b = parseInt(c.slice(5, 7), 16) || 139;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
    this.cdr.detectChanges();
  }

  openEdit(e: Expense): void {
    this.editing.set({ ...e });
    this.formOpen.set(true);
    this.cdr.detectChanges();
  }

  async onSave(v: ExpenseFormValue): Promise<void> {
    const editing = this.editing();
    try {
      if (editing) {
        await firstValueFrom(this.api.updateExpense(editing.id, { ...v, baseVersion: editing.syncVersion }));
        this.flash.set({ type: 'ok', text: 'Transaction updated successfully.' });
      } else {
        const res = await this.api.createExpense({ ...v, clientUuid: crypto.randomUUID() });
        this.flash.set(
          res === 'queued'
            ? { type: 'warn', text: 'Offline — saved locally, will sync when back online' }
            : { type: 'ok', text: v.kind === 'income' ? 'Income credited' : 'Expense added' }
        );
      }
      this.formOpen.set(false);
      this.editing.set(null);
      this.cdr.detectChanges();
      setTimeout(() => {
        if (this.flash()?.type === 'ok') this.flash.set(null);
      }, 3500);
      await this.load();
      this.cdr.detectChanges();
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { error?: string } };
      this.flash.set({
        type: 'err',
        text: e.status === 409 ? 'Conflict: changed elsewhere. Reload and retry.' : e.error?.error || 'Save failed',
      });
      this.cdr.detectChanges();
    }
  }

  async onRemove(e: Expense): Promise<void> {
    const deleteReq = firstValueFrom(this.api.deleteExpense(e.id));
    this.deletingIds.update((s) => new Set(s).add(e.id));
    this.cdr.detectChanges();

    const prevExpenses = this.expenses();
    const prevTotal = this.total();

    setTimeout(() => {
      this.expenses.set(this.expenses().filter((x) => x.id !== e.id));
      this.total.set(Math.max(0, this.total() - 1));
      this.deletingIds.update((s) => {
        const next = new Set(s);
        next.delete(e.id);
        return next;
      });
      this.cdr.detectChanges();
    }, 240);

    try {
      await deleteReq;
      this.flash.set({ type: 'ok', text: `“${e.categorySnapshot}” (${money(e.amountCents, this.currency())}) deleted` });
      this.cdr.detectChanges();
      setTimeout(() => {
        if (this.flash()?.type === 'ok') this.flash.set(null);
      }, 3500);
      await this.load();
      this.cdr.detectChanges();
    } catch (err: unknown) {
      this.expenses.set(prevExpenses);
      this.total.set(prevTotal);
      this.deletingIds.update((s) => {
        const next = new Set(s);
        next.delete(e.id);
        return next;
      });
      this.cdr.detectChanges();
      const error = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: error.error?.error || 'Failed to delete transaction' });
      this.cdr.detectChanges();
    }
  }

  onCreateCategory(cat: Category): void {
    const exists = this.categories().some((c) => c.id === cat.id);
    if (!exists) {
      this.categories.set([...this.categories(), cat]);
    }
    this.flash.set({ type: 'ok', text: `${cat.icon || '🏷️'} ${cat.name} created` });
  }

  async exportCsv(): Promise<void> {
    this.exportBusy.set(true);
    try {
      await this.api.exportCsv(this.filter.filters());
    } catch {
      this.flash.set({ type: 'err', text: 'CSV export failed' });
    } finally {
      this.exportBusy.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    this.exportBusy.set(true);
    try {
      await this.api.exportPdf(this.filter.filters());
    } catch {
      this.flash.set({ type: 'err', text: 'PDF export failed' });
    } finally {
      this.exportBusy.set(false);
    }
  }
}
