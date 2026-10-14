import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Category, RecurringBill, money } from '../../core/models';

@Component({
  selector: 'app-recurring-bills-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card recurring-card" data-tour="recurring-bills">
      <div class="card-head">
        <div class="head-title">
          <span class="head-icon">🔄</span>
          <div>
            <h3>Recurring Bills & Subscriptions</h3>
            <span class="sub-text">Rent, EMIs, and subscriptions with 1-tap payment logging</span>
          </div>
        </div>
        <button type="button" class="btn-add-bill" (click)="openAddModal()">+ Add Bill</button>
      </div>

      <!-- Bills List -->
      <div class="bills-list" *ngIf="bills().length > 0; else noBills">
        <div class="bill-row" *ngFor="let b of bills()" [class.paid]="isPaidThisMonth(b)">
          <div class="bill-left">
            <span class="bill-icon">{{ b.categoryIcon || '📅' }}</span>
            <div class="bill-info">
              <span class="bill-title">{{ b.title }}</span>
              <span class="bill-due">
                Due on day {{ b.dueDay }} of month • {{ b.frequency }}
                <span class="status-tag" [ngClass]="dueStatus(b).cls">{{ dueStatus(b).label }}</span>
              </span>
            </div>
          </div>

          <div class="bill-right">
            <span class="bill-amount">{{ money(b.amountCents, currency) }}</span>
            <button
              type="button"
              class="btn-pay"
              *ngIf="!isPaidThisMonth(b)"
              (click)="payBill(b)"
              title="Log payment into expenses"
            >
              ✓ Pay & Log
            </button>
            <span class="paid-badge" *ngIf="isPaidThisMonth(b)">✓ Paid</span>
            <button type="button" class="btn-del" (click)="deleteBill(b.id)" title="Delete bill">🗑</button>
          </div>
        </div>
      </div>

      <ng-template #noBills>
        <div class="empty-state">
          <span class="empty-icon">🗓️</span>
          <p class="empty-msg">No recurring bills added yet</p>
          <button type="button" class="btn-add-mini" (click)="openAddModal()">+ Track First Subscription / EMI</button>
        </div>
      </ng-template>
    </div>

    <!-- Add Recurring Bill Modal -->
    <div class="overlay" *ngIf="modalOpen()" (click)="closeModal()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-top">
          <h4>🔄 Add Recurring Bill / EMI</h4>
          <button type="button" class="modal-x" (click)="closeModal()">✕</button>
        </div>
        <form (ngSubmit)="saveBill()" class="modal-form">
          <div class="form-row">
            <label>Bill Title</label>
            <input type="text" [(ngModel)]="newTitle" name="title" placeholder="e.g. Apartment Rent, Netflix, Car Loan EMI" required />
          </div>

          <div class="form-cols">
            <div class="form-row">
              <label>Amount ({{ currency }})</label>
              <input type="number" min="1" step="any" [(ngModel)]="newAmount" name="amount" placeholder="500" required />
            </div>
            <div class="form-row">
              <label>Due Day of Month (1-31)</label>
              <input type="number" min="1" max="31" [(ngModel)]="newDueDay" name="dueDay" required />
            </div>
          </div>

          <div class="form-cols">
            <div class="form-row">
              <label>Frequency</label>
              <select [(ngModel)]="newFrequency" name="freq">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div class="form-row">
              <label>Category</label>
              <select [(ngModel)]="newCategoryId" name="cat">
                <option [ngValue]="null">Select Category</option>
                <option *ngFor="let c of categories" [ngValue]="c.id">{{ c.icon || '🏷️' }} {{ c.name }}</option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-ghost" (click)="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="!newTitle.trim() || newAmount <= 0">Save Bill</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .recurring-card { margin-bottom: 16px; padding: 18px 20px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
    .head-title { display: flex; align-items: center; gap: 10px; }
    .head-icon { font-size: 20px; }
    .head-title h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .head-title h3 { color: #F1F5F9; }
    .sub-text { font-size: 11px; color: #64748B; }
    :host-context([data-theme='dark']) .sub-text { color: #94A3B8; }
    .btn-add-bill {
      background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%);
      color: #4338CA; border: 1px solid #C7D2FE;
      padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
      transition: all 0.16s ease;
    }
    .btn-add-bill:hover {
      background: #4F46E5; color: #FFFFFF; border-color: #4F46E5;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
      transform: translateY(-1px);
    }
    :host-context([data-theme='dark']) .btn-add-bill {
      background: #312E81; color: #C7D2FE; border-color: #4338CA;
    }
    :host-context([data-theme='dark']) .btn-add-bill:hover {
      background: #4338CA; color: #FFFFFF;
    }
    .bills-list { display: flex; flex-direction: column; gap: 8px; }
    .bill-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; background: #FFFFFF; border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 12px; transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.02);
    }
    .bill-row:hover {
      transform: translateY(-1.5px);
      box-shadow: 0 6px 16px -2px rgba(15, 23, 42, 0.06);
      border-color: rgba(99, 102, 241, 0.25);
    }
    :host-context([data-theme='dark']) .bill-row {
      background: rgba(30, 41, 59, 0.55); border-color: rgba(255, 255, 255, 0.08);
    }
    :host-context([data-theme='dark']) .bill-row:hover {
      border-color: rgba(255, 255, 255, 0.16);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    .bill-row.paid { opacity: 0.75; }
    .bill-left { display: flex; align-items: center; gap: 10px; }
    .bill-icon { font-size: 20px; }
    .bill-info { display: flex; flex-direction: column; gap: 2px; }
    .bill-title { font-size: 13px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .bill-title { color: #F8FAFC; }
    .bill-due { font-size: 11px; color: #64748B; display: flex; align-items: center; gap: 6px; }
    :host-context([data-theme='dark']) .bill-due { color: #94A3B8; }
    .status-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; }
    .status-tag.urgent { background: #FEE2E2; color: #EF4444; }
    .status-tag.soon { background: #FEF3C7; color: #D97706; }
    .status-tag.normal { background: #EEF2FF; color: #4F46E5; }
    .status-tag.done { background: #DCFCE7; color: #16A34A; }
    .bill-right { display: flex; align-items: center; gap: 10px; }
    .bill-amount { font-size: 14px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .bill-amount { color: #F8FAFC; }
    .btn-pay {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      color: #FFFFFF; border: none; padding: 5px 12px;
      border-radius: 7px; font-size: 11.5px; font-weight: 700; cursor: pointer;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
      transition: all 0.15s ease;
    }
    .btn-pay:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.45);
    }
    .paid-badge { font-size: 11px; font-weight: 700; color: #10B981; }
    .btn-del { background: none; border: none; font-size: 13px; color: #94A3B8; cursor: pointer; padding: 4px; }
    .btn-del:hover { color: #EF4444; }
    .empty-state { text-align: center; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .empty-icon { font-size: 26px; }
    .empty-msg { font-size: 12px; color: #64748B; margin: 0; }
    .btn-add-mini { background: #4F46E5; color: #FFFFFF; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }
    .overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .modal-box { background: #FFFFFF; border-radius: 14px; width: 100%; max-width: 480px; padding: 20px; border: 1px solid #E2E8F0; }
    :host-context([data-theme='dark']) .modal-box { background: #0F172A; border-color: #334155; color: #F8FAFC; }
    .modal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .modal-top h4 { margin: 0; font-size: 15px; font-weight: 700; }
    .modal-x { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748B; }
    .modal-form { display: flex; flex-direction: column; gap: 12px; }
    .form-row { display: flex; flex-direction: column; gap: 4px; }
    .form-row label { font-size: 11px; font-weight: 600; color: #475569; }
    :host-context([data-theme='dark']) .form-row label { color: #CBD5E1; }
    .form-row input, .form-row select {
      border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px; font-size: 13px;
      background: #FFFFFF; color: #0F172A;
    }
    .form-row select option {
      background: #FFFFFF; color: #0F172A;
    }
    :host-context([data-theme='dark']) .form-row input, :host-context([data-theme='dark']) .form-row select {
      background: #1E293B; border-color: #475569; color: #F8FAFC;
    }
    :host-context([data-theme='dark']) .form-row select option {
      background: #1E293B; color: #F8FAFC;
    }
    .form-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
    .btn-ghost { background: none; border: 1px solid #CBD5E1; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
    :host-context([data-theme='dark']) .btn-ghost { border-color: #475569; color: #CBD5E1; }
    .btn-primary { background: #4F46E5; color: #FFFFFF; border: none; padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; }
  `]
})
export class RecurringBillsCardComponent implements OnInit {
  @Input() currency = 'USD';
  @Input() categories: Category[] = [];
  @Output() paymentLogged = new EventEmitter<number>();

  private readonly api = inject(ApiService);
  readonly bills = signal<RecurringBill[]>([]);
  readonly modalOpen = signal(false);
  readonly money = money;

  newTitle = '';
  newAmount = 100;
  newDueDay = 1;
  newFrequency: 'monthly' | 'yearly' | 'weekly' = 'monthly';
  newCategoryId: number | null = null;

  ngOnInit(): void {
    this.loadBills();
    if (!this.categories || this.categories.length === 0) {
      this.loadCategories();
    }
  }

  loadCategories(): void {
    if (typeof this.api?.getCategories === 'function') {
      this.api.getCategories().subscribe({
        next: (cats) => {
          if (cats && cats.length) {
            this.categories = cats;
            if (!this.newCategoryId) {
              this.newCategoryId = cats[0].id;
            }
          }
        },
        error: () => {}
      });
    }
  }

  loadBills(): void {
    if (typeof this.api?.getRecurringBills !== 'function') return;
    this.api.getRecurringBills().subscribe({
      next: (data) => this.bills.set(data),
      error: () => {}
    });
  }

  isPaidThisMonth(b: RecurringBill): boolean {
    if (!b.lastPaidAt) return false;
    const paidDate = new Date(b.lastPaidAt);
    const now = new Date();
    return paidDate.getUTCFullYear() === now.getUTCFullYear() && paidDate.getUTCMonth() === now.getUTCMonth();
  }

  dueStatus(b: RecurringBill): { label: string; cls: string } {
    if (this.isPaidThisMonth(b)) return { label: 'Paid this month', cls: 'done' };
    const today = new Date().getUTCDate();
    const diff = b.dueDay - today;
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, cls: 'urgent' };
    if (diff === 0) return { label: 'Due today!', cls: 'urgent' };
    if (diff <= 3) return { label: `Due in ${diff}d`, cls: 'soon' };
    return { label: `In ${diff} days`, cls: 'normal' };
  }

  payBill(b: RecurringBill): void {
    this.api.payRecurringBill(b.id).subscribe({
      next: (res) => {
        this.paymentLogged.emit(res.expenseId);
        this.loadBills();
      }
    });
  }

  deleteBill(id: number): void {
    if (confirm('Delete this recurring bill?')) {
      this.api.deleteRecurringBill(id).subscribe({
        next: () => this.loadBills()
      });
    }
  }

  openAddModal(): void {
    this.newTitle = '';
    this.newAmount = 100;
    this.newDueDay = 1;
    this.newFrequency = 'monthly';
    if (!this.categories || this.categories.length === 0) {
      this.loadCategories();
    }
    this.newCategoryId = this.categories && this.categories.length ? this.categories[0].id : null;
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  saveBill(): void {
    if (!this.newTitle.trim() || this.newAmount <= 0) return;
    this.api.createRecurringBill({
      title: this.newTitle.trim(),
      amountCents: Math.round(this.newAmount * 100),
      frequency: this.newFrequency,
      dueDay: this.newDueDay,
      categoryId: this.newCategoryId
    }).subscribe({
      next: () => {
        this.closeModal();
        this.loadBills();
      }
    });
  }
}
