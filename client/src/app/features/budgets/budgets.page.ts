import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Budget, Category, TIER_COLORS, money } from '../../core/models';
import { BudgetStatus } from '../../core/budget-status';

/** Budget manager: global + per-category limits with 80/90/100% thresholds, edit and delete support. */
@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Budgets</h1>
    <p class="lede">
      Set monthly ceilings per category or one global cap. Gauges turn
      <span style="color:#F59E0B;font-weight:600">amber at 80%</span>,
      <span style="color:#F97316;font-weight:600">orange at 90%</span> and
      <span style="color:#EF4444;font-weight:600">red at 100%</span>.
    </p>

    <div class="flash {{ f.type }}" *ngIf="flash() as f" (click)="flash.set(null)">
      <span>{{ f.type === 'ok' ? '✓' : (f.type === 'warn' ? '⚠' : '✕') }}</span>
      <span>{{ f.text }}</span>
      <span style="margin-left:auto;opacity:0.6;font-size:11px">✕</span>
    </div>

    <div class="layout">
      <div class="card">
        <h3>This month — live status</h3>
        <div *ngFor="let s of statuses()" class="gauge"
             [class.editing]="isBudgetEditing(s)"
             [class.deleting]="isBudgetDeleting(s)">
          <div class="row">
            <strong class="gauge-label">{{ s.label }}</strong>
            <div class="gauge-right">
              <span class="gauge-amounts">{{ money(s.spentCents, currency()) }} / {{ money(s.limitCents, currency()) }}</span>
              <div class="gauge-actions">
                <button type="button" class="tbl-icon-btn"
                        [class.active]="isBudgetEditing(s)"
                        [id]="'edit-budget-' + (getBudgetId(s) ?? 'item')"
                        [title]="isBudgetEditing(s) ? 'Cancel edit' : 'Edit budget'"
                        (click)="editBudget(s)">✎</button>
                <button type="button" class="tbl-icon-btn danger"
                        [disabled]="isBudgetDeleting(s)"
                        [id]="'delete-budget-' + (getBudgetId(s) ?? 'item')"
                        title="Delete budget"
                        (click)="deleteBudget(s)">🗑</button>
              </div>
            </div>
          </div>
          <div class="track">
            <div class="fill" [style.width.%]="Math.min(s.percentUsed, 100)"
                 [style.background]="TIER_COLORS[s.tier]"></div>
          </div>
          <div class="gauge-footer">
            <div class="warn-msg" [style.color]="TIER_COLORS[s.tier]">
              {{ s.percentUsed }}% used · {{ money(s.remainingCents, currency()) }} left
            </div>
            <span *ngIf="isBudgetEditing(s)" class="editing-tag">Editing in form</span>
          </div>
        </div>
        <p *ngIf="statuses().length === 0" style="color:#94A3B8">
          No budgets yet — create one on the right.
        </p>
      </div>

      <div class="card">
        <div class="form-title-row">
          <h3>{{ editingBudgetId() !== null ? 'Update budget' : 'Set / update a budget' }}</h3>
          <button *ngIf="editingBudgetId() !== null" type="button" class="btn-cancel-link" (click)="cancelEdit()">✕ Cancel</button>
        </div>
        <label for="budget-category">Scope</label>
        <div class="c-select" (click)="$event.stopPropagation()">
          <select id="budget-category" name="categoryId" [(ngModel)]="categoryId" class="sr-hidden">
            <option [ngValue]="null">Global (all expenses)</option>
            <option *ngFor="let c of cats()" [ngValue]="c.id">{{ c.icon || '🏷️' }} {{ c.name }}</option>
          </select>
          <button type="button" class="c-select-trigger" [class.open]="scopeOpen()" (click)="scopeOpen.set(!scopeOpen())">
            <span class="c-select-val">
              <span class="c-item-dot" *ngIf="selectedCat()?.colorHex" [style.background]="selectedCat()!.colorHex"></span>
              <span class="c-item-icon">{{ selectedCat()?.icon || '🌐' }}</span>
              <span class="c-item-label">{{ selectedCat()?.name || 'Global (all expenses)' }}</span>
            </span>
            <span class="c-select-arrow">▼</span>
          </button>
          <ul class="c-select-menu" *ngIf="scopeOpen()">
            <li class="c-select-item" [class.selected]="categoryId === null" (click)="selectScope(null)">
              <span class="c-item-icon">🌐</span>
              <span class="c-item-label">Global (all expenses)</span>
              <span class="c-item-check" *ngIf="categoryId === null">✓</span>
            </li>
            <li class="c-select-item" *ngFor="let c of cats()" [class.selected]="categoryId === c.id" (click)="selectScope(c.id)">
              <span class="c-item-dot" [style.background]="c.colorHex"></span>
              <span class="c-item-icon">{{ c.icon || '🏷️' }}</span>
              <span class="c-item-label">{{ c.name }}</span>
              <span class="c-item-check" *ngIf="categoryId === c.id">✓</span>
            </li>
          </ul>
        </div>

        <label for="budget-amount">Amount limit ({{ currency() }})</label>
        <input id="budget-amount" name="amount" type="number" min="0" step="1" [(ngModel)]="amount" placeholder="500" />

        <div class="thresholds">
          <label for="budget-warnPct">Warn %</label><input id="budget-warnPct" name="warnPct" type="number" [(ngModel)]="warnPct" min="1" max="100" />
          <label for="budget-critPct">Critical %</label><input id="budget-critPct" name="critPct" type="number" [(ngModel)]="critPct" min="1" max="100" />
          <label for="budget-overPct">Over %</label><input id="budget-overPct" name="overPct" type="number" [(ngModel)]="overPct" min="1" max="200" />
        </div>

        <div class="modal-actions" style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button *ngIf="editingBudgetId() !== null" type="button" class="btn-ghost" (click)="cancelEdit()">Cancel</button>
          <button class="btn-primary" [disabled]="!amount" (click)="save()">
            {{ editingBudgetId() !== null ? 'Update budget' : 'Save budget' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lede { color:#64748B; margin-top:0; max-width:640px; }
    .layout { display:grid; grid-template-columns: 1.4fr 1fr; gap:16px; }
    @media (max-width: 900px) { .layout { grid-template-columns:1fr; } }
    .thresholds { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; }
    .thresholds label { grid-column: span 1; }

    .gauge {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .gauge:hover {
      background: #F8FAFC;
      border-color: #E2E8F0;
    }
    .gauge.editing {
      background: rgba(99, 102, 241, 0.05);
      border-color: #6366F1;
      box-shadow: 0 0 0 1px #6366F1;
    }
    .gauge.deleting {
      animation: gaugeDeleteOut 0.26s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      pointer-events: none;
    }
    @keyframes gaugeDeleteOut {
      0% {
        opacity: 1;
        transform: translateX(0);
        max-height: 120px;
        margin-bottom: 14px;
        padding-top: 10px;
        padding-bottom: 10px;
      }
      30% {
        opacity: 0.7;
        transform: translateX(-10px);
        background-color: #FEF2F2;
      }
      100% {
        opacity: 0;
        transform: translateX(-24px);
        max-height: 0;
        margin-bottom: 0;
        padding-top: 0;
        padding-bottom: 0;
        border-color: transparent;
      }
    }

    .gauge .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      margin-bottom: 6px;
      gap: 8px;
    }
    .gauge-label {
      font-size: 14px;
      font-weight: 600;
      color: #0F172A;
    }
    .gauge-right {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }
    .gauge-amounts {
      font-size: 13px;
      color: #475569;
      font-variant-numeric: tabular-nums;
    }
    .gauge-actions {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .gauge .track { height: 10px; background: #E2E8F0; border-radius: 999px; overflow: hidden; }
    .gauge .fill { height: 100%; border-radius: 999px; transition: width .4s ease; }
    .gauge-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 5px;
    }
    .gauge .warn-msg { font-size: 12px; font-weight: 600; }
    .editing-tag {
      font-size: 11px;
      font-weight: 600;
      color: #4F46E5;
      background: #EEF2FF;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .form-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .form-title-row h3 { margin: 0; }
    .btn-cancel-link {
      background: transparent;
      border: none;
      color: #64748B;
      font-size: 12px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.05s ease, color 0.05s ease;
    }
    .btn-cancel-link:hover {
      color: #0F172A;
      background: #F1F5F9;
    }

    /* Dark mode overrides */
    :host-context([data-theme='dark']) .gauge:hover {
      background: #1E293B;
      border-color: #334151;
    }
    :host-context([data-theme='dark']) .gauge.editing {
      background: rgba(99, 102, 241, 0.12);
      border-color: #6366F1;
    }
    :host-context([data-theme='dark']) .gauge-label {
      color: #F1F5F9;
    }
    :host-context([data-theme='dark']) .gauge-amounts {
      color: #94A3B8;
    }
    :host-context([data-theme='dark']) .editing-tag {
      background: #312E81;
      color: #A5B4FC;
    }
    :host-context([data-theme='dark']) .btn-cancel-link {
      color: #94A3B8;
    }
    :host-context([data-theme='dark']) .btn-cancel-link:hover {
      color: #F1F5F9;
      background: #334151;
    }
  `],
})
export class BudgetsPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly TIER_COLORS = TIER_COLORS;
  readonly Math = Math;
  readonly money = money;
  readonly statuses = signal<BudgetStatus[]>([]);
  readonly budgets = signal<Budget[]>([]);
  readonly cats = signal<Category[]>([]);
  readonly flash = signal<{ type: string; text: string } | null>(null);
  readonly scopeOpen = signal(false);
  readonly editingBudgetId = signal<number | null>(null);
  readonly deletingBudgetIds = signal<Set<number>>(new Set());
  readonly currency = computed(() => this.auth.user()?.baseCurrency || 'USD');

  categoryId: number | null = null;
  amount: number | null = null;
  warnPct = 80; critPct = 90; overPct = 100;

  @HostListener('document:click')
  onDocumentClick(): void {
    this.scopeOpen.set(false);
  }

  selectedCat(): Category | null {
    if (this.categoryId === null) return null;
    return this.cats().find((c) => c.id === this.categoryId) || null;
  }

  selectScope(id: number | null): void {
    this.categoryId = id;
    this.scopeOpen.set(false);
    const existing = this.budgets().find((b) => b.categoryId === id);
    if (existing) {
      this.amount = existing.amountCents / 100;
      this.loadThresholds(existing);
      this.editingBudgetId.set(existing.id);
    } else {
      this.editingBudgetId.set(null);
      this.amount = null;
      this.warnPct = 80;
      this.critPct = 90;
      this.overPct = 100;
    }
  }

  getBudgetId(s: BudgetStatus): number | null {
    if (s.budgetId != null) return s.budgetId;
    const match = this.budgets().find((b) => b.categoryId === s.categoryId);
    return match ? match.id : null;
  }

  getBudgetForStatus(s: BudgetStatus): Budget | null {
    const id = this.getBudgetId(s);
    if (id != null) {
      const found = this.budgets().find((b) => b.id === id);
      if (found) return found;
    }
    return this.budgets().find((b) => b.categoryId === s.categoryId) || null;
  }

  isBudgetEditing(s: BudgetStatus): boolean {
    const id = this.getBudgetId(s);
    return id != null && this.editingBudgetId() === id;
  }

  isBudgetDeleting(s: BudgetStatus): boolean {
    const id = this.getBudgetId(s);
    return id != null && this.deletingBudgetIds().has(id);
  }

  editBudget(s: BudgetStatus): void {
    const id = this.getBudgetId(s);
    if (!id) return;
    if (this.editingBudgetId() === id) {
      this.cancelEdit();
      return;
    }
    const b = this.getBudgetForStatus(s);
    this.categoryId = s.categoryId;
    this.amount = b ? b.amountCents / 100 : s.limitCents / 100;
    if (b) {
      this.loadThresholds(b);
    }
    this.editingBudgetId.set(id);
  }

  cancelEdit(): void {
    this.editingBudgetId.set(null);
    this.categoryId = null;
    this.amount = null;
    this.warnPct = 80;
    this.critPct = 90;
    this.overPct = 100;
  }

  async deleteBudget(s: BudgetStatus): Promise<void> {
    const targetId = this.getBudgetId(s);
    if (!targetId) {
      this.flash.set({ type: 'err', text: 'Cannot find budget to delete' });
      return;
    }
    if (this.deletingBudgetIds().has(targetId)) return;

    // Optimistically mark as deleting to trigger smooth 240ms exit animation
    this.deletingBudgetIds.update((set) => new Set(set).add(targetId));
    const deleteReq = firstValueFrom(this.api.deleteBudget(targetId));

    try {
      await new Promise((r) => setTimeout(r, 240));

      this.statuses.update((list) => list.filter((item) => this.getBudgetId(item) !== targetId));
      this.budgets.update((list) => list.filter((b) => b.id !== targetId));
      this.deletingBudgetIds.update((set) => {
        const next = new Set(set);
        next.delete(targetId);
        return next;
      });

      if (this.editingBudgetId() === targetId) {
        this.cancelEdit();
      }

      await deleteReq;
      this.flash.set({ type: 'ok', text: `Budget for “${s.label}” deleted` });
    } catch (err: any) {
      this.deletingBudgetIds.update((set) => {
        const next = new Set(set);
        next.delete(targetId);
        return next;
      });
      this.flash.set({ type: 'err', text: err?.error?.error || 'Failed to delete budget' });
      await this.refresh();
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      this.cats.set(await firstValueFrom(this.api.getCategories()));
    } catch {}
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    try {
      const [budgets, statusRes] = await Promise.all([
        firstValueFrom(this.api.getBudgets('monthly', year, month)),
        firstValueFrom(this.api.getBudgetStatus({
          from: `${year}-${String(month).padStart(2, '0')}-01`,
          to: `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
          categoryIds: [], period: 'monthly', groupBy: 'day', kind: 'expense',
        })),
      ]);
      this.budgets.set(budgets);
      this.statuses.set(statusRes.statuses);

      if (this.editingBudgetId() !== null) {
        const current = budgets.find((b) => b.id === this.editingBudgetId());
        if (current) {
          this.amount = current.amountCents / 100;
          this.loadThresholds(current);
        }
      } else if (this.amount == null) {
        const existing = budgets.find((b) => b.categoryId === (this.categoryId as number | null));
        if (existing) {
          this.amount = existing.amountCents / 100;
          this.loadThresholds(existing);
        }
      }
    } catch {}
  }

  private loadThresholds(b: Budget): void {
    this.warnPct = b.warnPct; this.critPct = b.critPct; this.overPct = b.overPct;
  }

  async save(): Promise<void> {
    if (!this.amount) return;
    const now = new Date();
    const isEditing = this.editingBudgetId() !== null;
    try {
      await firstValueFrom(this.api.saveBudget({
        categoryId: this.categoryId,
        period: 'monthly',
        periodYear: now.getFullYear(),
        periodMonth: now.getMonth() + 1,
        amountCents: Math.round(this.amount * 100),
        warnPct: this.warnPct, critPct: this.critPct, overPct: this.overPct,
      }));
      this.flash.set({
        type: 'ok',
        text: isEditing ? 'Budget updated successfully' : 'Budget saved — gauges updated',
      });
      this.editingBudgetId.set(null);
      await this.refresh();
    } catch {
      this.flash.set({ type: 'err', text: 'Could not save budget' });
    }
  }
}
