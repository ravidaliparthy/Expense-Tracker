import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Category, Expense, TransactionKind } from '../../core/models';

export interface ExpenseFormValue {
  amountCents: number; occurredAt: string; categoryId: number | null; kind: TransactionKind; merchant?: string | null; notes?: string | null;
}

@Component({
  selector: 'app-expense-form', standalone: true, imports: [FormsModule, CommonModule],
  template: `
    <div class="overlay" (click)="onOverlayClick($event)"><div class="modal" (click)="$event.stopPropagation()">
      <h2>{{ expense ? 'Edit transaction' : 'Add transaction' }}</h2>
      <p class="hint">Track both debits and credits. Budget warnings only use expense transactions.</p>
      <div class="flash err" *ngIf="error()">{{ error() }}</div>
      <form (ngSubmit)="submit()" #f="ngForm">
        <label>Type</label>
        <div class="kind-tabs">
          <button type="button" [class.on]="kind === 'expense'" (click)="kind = 'expense'">Expense</button>
          <button type="button" [class.on]="kind === 'income'" (click)="kind = 'income'">Income / Credit</button>
        </div>
        <label for="expense-amount">Amount ({{ currency }})</label>
        <input id="expense-amount" name="amount" type="number" step="0.01" min="0.01" [(ngModel)]="amount" required placeholder="0.00" />
        <label for="expense-category">Category</label>
        <div class="cat-row">
          <div class="c-select" (click)="$event.stopPropagation()">
            <!-- Native hidden select keeps Angular Form ngModel & tests working 100% -->
            <select id="expense-category" name="category" [(ngModel)]="categoryId" class="sr-hidden">
              <option [ngValue]="null">📌 Uncategorized</option>
              <option *ngFor="let c of categories" [ngValue]="c.id">{{ c.icon || '🏷️' }} {{ c.name }}</option>
            </select>

            <button type="button" class="c-select-trigger" [class.open]="catMenuOpen()" (click)="toggleCatMenu($event)" (keydown)="onTriggerKeydown($event)">
              <span class="c-select-val">
                <span class="c-item-dot" *ngIf="currentCategory()?.colorHex" [style.background]="currentCategory()!.colorHex"></span>
                <span class="c-item-icon">{{ currentCategory()?.icon || '📌' }}</span>
                <span class="c-item-label">{{ currentCategory()?.name || 'Uncategorized' }}</span>
              </span>
              <span class="c-select-arrow">▼</span>
            </button>

            <ul class="c-select-menu" *ngIf="catMenuOpen()" role="listbox">
              <li class="c-select-item" [class.selected]="categoryId === null" (click)="selectCategory(null, $event)">
                <span class="c-item-icon">📌</span>
                <span class="c-item-label">Uncategorized</span>
                <span class="c-item-check" *ngIf="categoryId === null">✓</span>
              </li>
              <li class="c-select-item" *ngFor="let c of categories" [class.selected]="categoryId === c.id" (click)="selectCategory(c.id, $event)">
                <span class="c-item-dot" [style.background]="c.colorHex"></span>
                <span class="c-item-icon">{{ c.icon || '🏷️' }}</span>
                <span class="c-item-label">{{ c.name }}</span>
                <span class="c-item-check" *ngIf="categoryId === c.id">✓</span>
              </li>
            </ul>
          </div>
          <button type="button" class="btn-ghost" (click)="creatingCat.set(!creatingCat())">+ New</button>
        </div>
        <div class="cat-row" *ngIf="creatingCat()">
          <input id="expense-newCatIcon" name="newCatIcon" [(ngModel)]="newCatIcon" class="emoji" maxlength="8" placeholder="🍔" />
          <input id="expense-newCatName" name="newCatName" [(ngModel)]="newCatName" placeholder="e.g. Salary, Vacation" />
          <input id="expense-newCatColor" name="newCatColor" type="color" [(ngModel)]="newCatColor" class="swatch" />
          <button type="button" class="btn-primary" [disabled]="!newCatName.trim() || creatingCatBusy" (click)="addCategory()">{{ creatingCatBusy ? 'Adding...' : 'Create' }}</button>
        </div>
        <label for="expense-occurredAt">Date & time</label>
        <input id="expense-occurredAt" name="occurredAt" type="datetime-local" [(ngModel)]="occurredLocal" required />
        <label for="expense-merchant">{{ kind === 'income' ? 'Source' : 'Merchant' }}</label>
        <input id="expense-merchant" name="merchant" [(ngModel)]="merchant" [placeholder]="kind === 'income' ? 'Payroll, client, refund…' : 'Where did you spend?'" />
        <label for="expense-notes">Contextual notes</label>
        <textarea id="expense-notes" name="notes" rows="3" [(ngModel)]="notes" placeholder="Receipt #, invoice #, split details, reminders…"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button>
          <button class="btn-primary" [disabled]="f.invalid || busy">
            {{ busy ? 'Saving...' : (expense ? 'Save changes' : 'Add transaction') }}
          </button>
        </div>
      </form>
    </div></div>
  `,
  styles: [`.cat-row{display:flex;gap:8px;align-items:center;margin-top:4px}.cat-row select,.cat-row input:not(.swatch):not(.emoji),.cat-row .c-select{flex:1}.swatch{width:42px;height:36px;padding:2px}.emoji{width:54px;text-align:center}.kind-tabs{display:flex;gap:8px;margin:4px 0 10px}.kind-tabs button{flex:1;border:1px solid #CBD5E1;background:#fff;border-radius:8px;padding:9px;cursor:pointer;user-select:none;transition:background-color 0.05s ease, border-color 0.05s ease, color 0.05s ease}.kind-tabs button:hover{border-color:#94A3B8;background:#F8FAFC}.kind-tabs button.on{background:#1E1B4B;color:#fff;border-color:#6366F1}`]
})
export class ExpenseFormComponent implements OnInit, OnChanges {
  private api = inject(ApiService);
  @Input() expense: Expense | null = null;
  @Input() categories: Category[] = [];
  @Input() currency = 'USD';
  @Output() save = new EventEmitter<ExpenseFormValue>();
  @Output() createCategory = new EventEmitter<Category>();
  @Output() close = new EventEmitter<void>();

  readonly creatingCat = signal(false);
  readonly error = signal('');
  readonly catMenuOpen = signal(false);
  busy = false;
  creatingCatBusy = false;

  amount: number | null = null;
  categoryId: number | null = null;
  kind: TransactionKind = 'expense';
  occurredLocal = '';
  merchant = '';
  notes = '';
  newCatName = '';
  newCatColor = '#6366F1';
  newCatIcon = '🏷️';

  private populate(exp: Expense | null): void {
    const pad = (n: number) => String(n).padStart(2, '0');
    if (exp) {
      this.amount = exp.amountCents / 100;
      this.categoryId = exp.categoryId;
      this.kind = exp.kind || 'expense';
      this.merchant = exp.merchant || '';
      this.notes = exp.notes || '';
      const d = exp.occurredAtUtc ? new Date(exp.occurredAtUtc) : new Date();
      const valid = !Number.isNaN(d.getTime()) ? d : new Date();
      this.occurredLocal = `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}T${pad(valid.getHours())}:${pad(valid.getMinutes())}`;
    } else {
      this.amount = null;
      this.categoryId = null;
      this.kind = 'expense';
      this.merchant = '';
      this.notes = '';
      const now = new Date();
      this.occurredLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  }

  ngOnInit(): void {
    this.populate(this.expense);
    if (!this.categories || this.categories.length === 0) {
      void firstValueFrom(this.api.getCategories())
        .then((fetched) => {
          if (fetched && fetched.length > 0) this.categories = fetched;
        })
        .catch(() => undefined);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['expense']) {
      this.populate(this.expense);
    }
  }

  currentCategory(): Category | null {
    if (this.categoryId === null) return null;
    return this.categories.find((c) => c.id === this.categoryId) || null;
  }

  toggleCatMenu(e?: Event): void {
    if (e) e.stopPropagation();
    this.catMenuOpen.update((v) => !v);
  }

  selectCategory(id: number | null, e?: Event): void {
    if (e) e.stopPropagation();
    this.categoryId = id;
    this.catMenuOpen.set(false);
  }

  onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.catMenuOpen.set(true);
    } else if (e.key === 'Escape') {
      this.catMenuOpen.set(false);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.catMenuOpen.set(false);
  }

  onOverlayClick(e: MouseEvent): void {
    this.catMenuOpen.set(false);
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }

  async addCategory(): Promise<void> {
    const name = this.newCatName.trim();
    if (!name || this.creatingCatBusy) return;
    this.creatingCatBusy = true;
    this.error.set('');
    try {
      const created = await firstValueFrom(
        this.api.createCategory({
          name,
          colorHex: this.newCatColor,
          icon: this.newCatIcon.trim() || '🏷️',
        })
      );
      this.categories = [...this.categories, created];
      this.categoryId = created.id;
      this.createCategory.emit(created);
      this.newCatName = '';
      this.creatingCat.set(false);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string } };
      this.error.set(e.error?.error || 'Category already exists');
    } finally {
      this.creatingCatBusy = false;
    }
  }

  submit(): void {
    if (!this.amount || this.amount <= 0) {
      this.error.set('Enter a valid amount');
      return;
    }
    let iso = new Date().toISOString();
    try {
      if (this.occurredLocal) {
        const d = new Date(this.occurredLocal);
        if (!Number.isNaN(d.getTime())) {
          iso = d.toISOString();
        }
      }
    } catch {
      iso = new Date().toISOString();
    }

    const merchantVal = this.merchant.trim();
    const notesVal = this.notes.trim();

    this.busy = true;
    this.save.emit({
      amountCents: Math.round(this.amount * 100),
      occurredAt: iso,
      categoryId: this.categoryId,
      kind: this.kind,
      merchant: merchantVal ? merchantVal : (this.expense ? null : undefined),
      notes: notesVal ? notesVal : (this.expense ? null : undefined),
    });
    // Reset busy after 1.5s in case the parent catches an error and keeps modal open
    setTimeout(() => { this.busy = false; }, 1500);
  }
}
