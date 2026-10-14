import { ChangeDetectorRef, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FilterService } from '../../core/filter.service';
import { AuthService } from '../../core/auth.service';
import { Category, Expense, PaymentSource, TransactionTag, money, paymentSourceLabel, signedMoney } from '../../core/models';
import { FilterBarComponent } from '../dashboard/filter-bar.component';
import { ExpenseFormComponent, ExpenseFormValue } from '../dashboard/expense-form.component';
import { StatementImportModalComponent } from './statement-import-modal.component';
import { safeUuid } from '../../core/uuid';

@Component({
  selector: 'app-transactions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterBarComponent, ExpenseFormComponent, StatementImportModalComponent],
  template: `
    <div class="toolbar">
      <div>
        <h1>Transactions</h1>
        <div class="sub">{{ filter.activePresetLabel() }} · {{ total() }} total records · {{ currency() }}</div>
      </div>
      <div class="actions">
        <button class="btn-primary main-action-btn" (click)="openCreate()">＋ Add transaction</button>
        <button class="btn-ghost action-chip" (click)="openImport()" title="Import CSV or bank statement">📂 Import Statement</button>
        <button class="btn-ghost action-chip export-btn" [disabled]="exportBusy()" (click)="exportCsv()">⤓ CSV</button>
        <button class="btn-ghost action-chip export-btn" [disabled]="exportBusy()" (click)="exportPdf()">⤓ PDF</button>
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

    <!-- Bulk Actions Floating Bar -->
    <div class="bulk-bar" *ngIf="selectedIds().size > 0">
      <div class="bulk-count">
        <strong>{{ selectedIds().size }}</strong> selected
      </div>
      <div class="bulk-actions">

        <div class="bulk-group">
          <span class="bulk-lbl">Category:</span>
          <select class="bulk-select" (change)="onBulkCategoryChange($event)" [disabled]="bulkBusy()">
            <option value="">Move to category...</option>
            <option *ngFor="let c of categories()" [value]="c.id">{{ c.icon || '🏷️' }} {{ c.name }}</option>
          </select>
        </div>

        <button type="button" class="btn-bulk danger" (click)="bulkDelete()" [disabled]="bulkBusy()">
          🗑️ Delete ({{ selectedIds().size }})
        </button>

        <button type="button" class="btn-bulk ghost" (click)="clearSelection()">✕ Deselect</button>
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
              <th style="width:36px;text-align:center">
                <input
                  type="checkbox"
                  [checked]="isAllSelected()"
                  (change)="toggleSelectAll()"
                  title="Select all transactions in view"
                />
              </th>
              <th class="sortable" (click)="toggleSort('date')" title="Click to sort by date">
                Date <span class="sort-icon">{{ sortField() === 'date' ? (sortDirection() === 'desc' ? '▼' : '▲') : '↕' }}</span>
              </th>
              <th>Type</th>
              <th>Category</th>
              <th>Merchant</th>
              <th>Payment Source</th>
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
              [class.selected-row]="selectedIds().has(e.id)"
            >
              <td style="width:36px;text-align:center">
                <input
                  type="checkbox"
                  [checked]="selectedIds().has(e.id)"
                  (change)="toggleSelect(e.id)"
                />
              </td>
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
              <td><span class="source-chip">{{ paymentSourceLabel(e.source) }}</span></td>
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

    <!-- Bank Statement / CSV Import Modal -->
    <app-statement-import-modal
      *ngIf="importOpen()"
      [categories]="categories()"
      [currency]="currency()"
      (imported)="onStatementImported($event)"
      (close)="importOpen.set(false)"
    ></app-statement-import-modal>
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
    .toolbar h1 { margin: 0; font-size: 22px; letter-spacing: -0.2px; }
    .toolbar .sub { color: #64748B; font-size: 12px; margin-top: 2px; }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .main-action-btn {
      background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%) !important;
      color: #fff !important;
      font-weight: 600;
      padding: 8px 15px;
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .main-action-btn:hover {
      background: linear-gradient(135deg, #4F46E5 0%, #4338CA 100%) !important;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);
      transform: translateY(-1px);
    }
    .action-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12.5px;
      padding: 7px 11px;
      border-radius: 8px;
      white-space: nowrap;
    }
    .action-chip:hover { transform: translateY(-1px); }

    .summary-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
      padding: 14px 18px;
      border-radius: 16px;
      background: #FFFFFF;
      border: 1px solid rgba(226, 232, 240, 0.9);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.04);
    }
    :host-context([data-theme='dark']) .summary-bar {
      background: rgba(15, 23, 42, 0.8) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.4) !important;
    }
    .search-box { flex: 1; min-width: 220px; }
    .search-box input {
      width: 100%;
      padding: 9px 14px;
      border-radius: 10px;
      border: 1px solid #CBD5E1;
      font-size: 13px;
      font-family: inherit;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .search-box input:focus {
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.22);
    }

    .sort-controls { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .sort-lbl { color: #64748B; font-weight: 500; }
    .sort-btn {
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      color: #334155;
      border-radius: 8px;
      padding: 6px 11px;
      font-size: 11.5px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .sort-btn:hover { border-color: #94A3B8; background: #E2E8F0; transform: translateY(-1px); }
    .sort-btn.active {
      background: #EEF2FF; border-color: #6366F1; color: #4F46E5; font-weight: 700;
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.2);
    }
    .sortable { cursor: pointer; user-select: none; transition: color 0.15s ease; }
    .sortable:hover { color: #4F46E5; }
    .sort-icon { font-size: 10px; margin-left: 3px; color: #6366F1; }

    .stats-pills { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      padding: 7px 13px;
      border-radius: 10px;
      font-size: 12.5px;
      display: inline-flex;
      gap: 7px;
      align-items: center;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }
    .pill:hover {
      transform: translateY(-1.5px);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
      border-color: #CBD5E1;
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

    .tbl-wrap { overflow-x: auto; border-radius: 10px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    tbody tr {
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                  background-color 0.2s ease,
                  box-shadow 0.2s ease;
      cursor: pointer;
    }
    tbody td {
      padding: 11px 8px;
      border-bottom: 1px solid #F1F5F9;
      vertical-align: middle;
      transition: color 0.15s ease;
    }
    tbody tr:hover {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.05) 0%, rgba(99, 102, 241, 0.01) 100%) !important;
      transform: translateX(4px);
      box-shadow: inset 3.5px 0 0 #6366F1, 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    tbody tr:active {
      transform: scale(0.995) translateX(2px);
    }
    .mono { font-family: 'Outfit', 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; color: #475569; white-space: nowrap; font-size: 12.5px; }
    .notes-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #64748B; font-family: 'Outfit', sans-serif; }
    .kind { font-size: 11px; border-radius: 999px; padding: 3px 8px; background: #FEE2E2; color: #B91C1C; font-family: 'Outfit', sans-serif; font-weight: 600; }
    .kind.income { background: #DCFCE7; color: #047857; }
    .amount {
      font-family: 'Outfit', sans-serif;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 14px;
      transition: transform 0.18s ease, text-shadow 0.18s ease;
    }
    .amount.plus { color: #047857; }
    .amount.minus { color: #DC2626; }
    tbody tr:hover .amount {
      transform: scale(1.03);
    }
    tr.income { background: #F0FDF4; }

    /* Dark mode */
    :host-context([data-theme='dark']) .pill {
      background: rgba(30, 41, 59, 0.6);
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }
    :host-context([data-theme='dark']) .pill:hover {
      background: rgba(30, 41, 59, 0.85);
      border-color: rgba(255, 255, 255, 0.16);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    }
    :host-context([data-theme='dark']) tbody td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #CBD5E1;
    }
    :host-context([data-theme='dark']) tbody tr:hover {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.04) 65%, transparent 100%) !important;
      transform: translateX(4px);
      box-shadow: inset 3.5px 0 0 #6366F1, 0 6px 16px rgba(0, 0, 0, 0.35);
    }
    :host-context([data-theme='dark']) tbody tr.income:hover {
      box-shadow: inset 3.5px 0 0 #10B981, 0 6px 16px rgba(0, 0, 0, 0.35);
    }
    :host-context([data-theme='dark']) tbody tr:hover .amount.minus {
      text-shadow: 0 0 10px rgba(244, 63, 94, 0.35);
    }
    :host-context([data-theme='dark']) tbody tr:hover .amount.plus {
      text-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
    }
    :host-context([data-theme='dark']) .mono { color: #94A3B8; }
    :host-context([data-theme='dark']) .notes-cell { color: #94A3B8; }
    :host-context([data-theme='dark']) tr.income { background: rgba(34, 197, 94, 0.08); }
    :host-context([data-theme='dark']) .search-box input { background: #0F172A; border-color: #334155; color: #F1F5F9; }
    :host-context([data-theme='dark']) .search-tag { background: #312E81; color: #C7D2FE; }
    :host-context([data-theme='dark']) .sort-btn { background: #1E293B; border-color: #334155; color: #CBD5E1; }
    :host-context([data-theme='dark']) .sort-btn:hover { background: #334155; }
    :host-context([data-theme='dark']) .sort-btn.active { background: #312E81; border-color: #6366F1; color: #A5B4FC; }
    :host-context([data-theme='dark']) .sortable:hover { color: #A5B4FC; }
    :host-context([data-theme='dark']) .pval.pos,
    :host-context([data-theme='dark']) .amount.plus { color: #34D399 !important; }
    :host-context([data-theme='dark']) .pval.neg,
    :host-context([data-theme='dark']) .amount.minus { color: #F87171 !important; }

    /* Bulk actions bar & Tag chips */
    .bulk-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #F8FAFC;
      padding: 12px 18px;
      border-radius: 14px;
      margin-bottom: 16px;
      box-shadow: 0 14px 34px -4px rgba(0, 0, 0, 0.4), 0 0 20px rgba(99, 102, 241, 0.2);
      flex-wrap: wrap;
      gap: 12px;
      animation: slideDown .18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .bulk-count { font-size: 13px; color: #94A3B8; }
    .bulk-count strong { color: #818CF8; }
    .bulk-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .bulk-group { display: flex; align-items: center; gap: 6px; }
    .bulk-lbl { font-size: 11px; text-transform: uppercase; color: #94A3B8; font-weight: 600; }
    .btn-bulk {
      background: #334155;
      border: 1px solid #475569;
      color: #F1F5F9;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s ease;
    }
    .btn-bulk:hover:not(:disabled) {
      background: #475569; border-color: #64748B; transform: translateY(-1px);
    }
    .btn-bulk.danger {
      background: linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%);
      border-color: #B91C1C; color: #FCA5A5;
    }
    .btn-bulk.danger:hover:not(:disabled) {
      background: #DC2626; color: #FFFFFF;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35);
    }
    .btn-bulk.ghost { background: transparent; border-color: transparent; color: #94A3B8; }
    .btn-bulk.ghost:hover { color: #F1F5F9; }
    .bulk-select {
      background: #334155;
      border: 1px solid #475569;
      color: #F1F5F9;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
    }
    .tag-chip {
      font-size: 10px;
      font-weight: 600;
      border-radius: 999px;
      padding: 2px 8px;
      text-transform: capitalize;
      display: inline-block;
    }
    .tag-chip.need { background: #E0E7FF; color: #3730A3; }
    .tag-chip.want { background: #FEF3C7; color: #92400E; }
    .tag-chip.saving { background: #DCFCE7; color: #166534; }
    :host-context([data-theme='dark']) .tag-chip.need { background: rgba(99,102,241,0.2); color: #A5B4FC; }
    :host-context([data-theme='dark']) .tag-chip.want { background: rgba(245,158,11,0.2); color: #FCD34D; }
    :host-context([data-theme='dark']) .tag-chip.saving { background: rgba(34,197,94,0.2); color: #86EFAC; }
    tr.selected-row { background: rgba(99,102,241,0.06); }
    :host-context([data-theme='dark']) tr.selected-row { background: rgba(99,102,241,0.15); }
  `],
})
export class TransactionsPage {
  readonly filter = inject(FilterService);
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  readonly money = money;
  readonly signedMoney = signedMoney;
  readonly paymentSourceLabel = paymentSourceLabel;
  readonly trackById = (_: number, e: Expense): number => e.id;

  readonly expenses = signal<Expense[]>([]);
  readonly total = signal(0);
  readonly categories = signal<Category[]>([]);
  readonly flash = signal<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  readonly exportBusy = signal(false);
  readonly formOpen = signal(false);
  readonly editing = signal<Expense | null>(null);
  readonly deletingIds = signal<Set<number>>(new Set());
  readonly selectedIds = signal<Set<number>>(new Set());
  readonly importOpen = signal(false);
  readonly bulkBusy = signal(false);
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
    // Instant Cache Pre-Hydration: render in 0ms on startup without waiting for network
    try {
      const cachedExps = localStorage.getItem('et.cachedExpenses');
      if (cachedExps) {
        const parsed = JSON.parse(cachedExps);
        if (parsed?.items?.length) {
          this.expenses.set(parsed.items);
          this.total.set(parsed.total || parsed.items.length);
        }
      }
      const cachedCats = localStorage.getItem('et.categories');
      if (cachedCats) {
        const parsedCats = JSON.parse(cachedCats);
        if (parsedCats?.length) this.categories.set(parsedCats);
      }
    } catch {}

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
        const res = await this.api.createExpense({ ...v, clientUuid: safeUuid() });
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

  openImport(): void {
    this.importOpen.set(true);
  }

  onStatementImported(count: number): void {
    this.importOpen.set(false);
    this.flash.set({ type: 'ok', text: `Imported ${count} statement transaction${count === 1 ? '' : 's'}` });
    this.load();
  }

  toggleSelect(id: number): void {
    this.selectedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleSelectAll(): void {
    const list = this.sortedFilteredExpenses();
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(list.map((e) => e.id)));
    }
  }

  isAllSelected(): boolean {
    const list = this.sortedFilteredExpenses();
    if (list.length === 0) return false;
    const sel = this.selectedIds();
    return list.every((e) => sel.has(e.id));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async bulkDelete(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} selected transaction${ids.length === 1 ? '' : 's'}?`)) return;

    this.bulkBusy.set(true);
    try {
      await firstValueFrom(this.api.bulkDeleteExpenses(ids));
      this.flash.set({ type: 'ok', text: `Deleted ${ids.length} transactions successfully.` });
      this.selectedIds.set(new Set());
      await this.load();
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to delete selected transactions.' });
    } finally {
      this.bulkBusy.set(false);
    }
  }

  async bulkSetTag(tag: TransactionTag): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkBusy.set(true);
    try {
      await firstValueFrom(this.api.bulkUpdateExpenses(ids, { tag }));
      this.flash.set({ type: 'ok', text: `Updated ${ids.length} transaction${ids.length === 1 ? '' : 's'} tag to "${tag}".` });
      this.selectedIds.set(new Set());
      await this.load();
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to update transaction tags.' });
    } finally {
      this.bulkBusy.set(false);
    }
  }

  async onBulkCategoryChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const catId = Number(select.value);
    if (!catId) return;

    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkBusy.set(true);
    try {
      await firstValueFrom(this.api.bulkUpdateExpenses(ids, { categoryId: catId }));
      this.flash.set({ type: 'ok', text: `Moved ${ids.length} transaction${ids.length === 1 ? '' : 's'} to selected category.` });
      this.selectedIds.set(new Set());
      select.value = '';
      await this.load();
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to update category.' });
    } finally {
      this.bulkBusy.set(false);
    }
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
