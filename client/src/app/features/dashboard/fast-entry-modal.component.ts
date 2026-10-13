import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmartEntryService, ParsedTransaction } from '../../core/smart-entry.service';
import { Category, PaymentSource, TransactionKind, TransactionTag, money } from '../../core/models';

@Component({
  selector: 'app-fast-entry-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="header-left">
            <span class="emoji-icon">⚡</span>
            <div>
              <h3>Fast Entry & UPI / SMS Parser</h3>
              <p class="subtitle">Paste Indian Bank/UPI SMS or type plain English (e.g. "Paid 350 for Swiggy")</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <!-- Text Input / SMS Paste Area -->
          <div class="input-wrap">
            <label>Paste Transaction SMS / UPI Text</label>
            <textarea
              [(ngModel)]="rawText"
              (ngModelChange)="onTextChange($event)"
              rows="3"
              class="sms-textarea"
              placeholder="e.g. Sent Rs.450.00 to Swiggy on 12-10-26 via UPI Ref 12345... or 'Coffee 120'"
              autofocus
            ></textarea>
          </div>

          <!-- Quick Suggestions / Sample Buttons -->
          <div class="sample-chips">
            <span class="sample-label">Try sample:</span>
            <button type="button" class="chip" (click)="setSample('Sent Rs.450 to Swiggy via UPI')">🍔 Swiggy ₹450</button>
            <button type="button" class="chip" (click)="setSample('Debited INR 1,299 at NETFLIX')">🎬 Netflix ₹1,299</button>
            <button type="button" class="chip" (click)="setSample('Paid Rs 85 to Blinkit via GPay')">🛒 Blinkit ₹85</button>
            <button type="button" class="chip" (click)="setSample('Credited INR 50,000 to A/C by ACME Corp Salary')">💰 Salary ₹50k</button>
          </div>

          <!-- Parsed Fields Confirmation Card -->
          <div *ngIf="parsed" class="parsed-card">
            <div class="card-head">
              <span class="parsed-status">{{ rawText.trim() ? '✓ Smart Heuristic Detected' : '⚡ Direct Transaction Entry' }}</span>
              <span class="amt-highlight" [class.income]="parsed.kind === 'income'">
                {{ money((parsed.amount || 0) * 100, currency) }}
              </span>
            </div>

            <div class="fields-grid">
              <div class="field-item">
                <label>Amount ({{ currency }})</label>
                <input type="number" step="any" min="0.01" [(ngModel)]="parsed.amount" class="form-input bold" placeholder="0.00" />
              </div>

              <div class="field-item">
                <label>Transaction Type</label>
                <div class="kind-group">
                  <button type="button" class="kind-btn" [class.active]="parsed.kind === 'expense'" (click)="parsed.kind = 'expense'">🔴 Expense</button>
                  <button type="button" class="kind-btn" [class.active]="parsed.kind === 'income'" (click)="parsed.kind = 'income'">🟢 Income</button>
                </div>
              </div>

              <div class="field-item">
                <label>Merchant / Payee</label>
                <input type="text" [(ngModel)]="parsed.merchant" class="form-input" placeholder="e.g. Swiggy, Netflix, Salary" />
              </div>

              <div class="field-item">
                <label>Category</label>
                <select [(ngModel)]="selectedCategoryName" class="form-input">
                  <option *ngFor="let c of categories" [value]="c.name">{{ c.icon }} {{ c.name }}</option>
                </select>
              </div>

              <div class="field-item">
                <label>Payment Source</label>
                <select [(ngModel)]="parsed.source" class="form-input">
                  <option value="SuperMoney">⚡ SuperMoney</option>
                  <option value="PhonePe">🟣 PhonePe</option>
                  <option value="Google Pay">🔵 Google Pay</option>
                  <option value="Credit Card">💳 Credit Card</option>
                  <option value="Debit Card">🏧 Debit Card</option>
                  <option value="Cash">💵 Cash</option>
                  <option value="Others">✨ Others</option>
                </select>
              </div>

              <div class="field-item">
                <label>Date</label>
                <input type="date" [(ngModel)]="parsed.date" class="form-input" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button>
          <button
            type="button"
            class="btn-primary"
            [disabled]="!parsed || parsed.amount <= 0"
            (click)="confirmSave()"
          >
            ✓ Log Transaction ({{ (parsed && parsed.amount > 0) ? money(parsed.amount * 100, currency) : '$0.00' }})
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px); z-index: 10000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .modal-box {
      background: #FFFFFF; border-radius: 16px; width: 100%; max-width: 600px;
      max-height: 92vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
      border: 1px solid #E2E8F0; overflow: hidden;
    }
    :host-context([data-theme='dark']) .modal-box {
      background: #0F172A; border-color: #334155; color: #F8FAFC;
    }
    .modal-header {
      padding: 16px 20px; border-bottom: 1px solid #E2E8F0;
      display: flex; justify-content: space-between; align-items: center;
    }
    :host-context([data-theme='dark']) .modal-header { border-bottom-color: #334155; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .emoji-icon { font-size: 24px; }
    .header-left h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .subtitle { margin: 2px 0 0; font-size: 12px; color: #64748B; }
    :host-context([data-theme='dark']) .subtitle { color: #94A3B8; }
    .btn-close { background: none; border: none; font-size: 18px; color: #64748B; cursor: pointer; }
    .modal-body { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
    .input-wrap label { font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px; }
    :host-context([data-theme='dark']) .input-wrap label { color: #CBD5E1; }
    .sms-textarea {
      width: 100%; border: 1px solid #CBD5E1; border-radius: 10px; padding: 10px 12px;
      font-size: 13px; font-family: inherit; resize: vertical; box-sizing: border-box;
      background: #F8FAFC;
    }
    :host-context([data-theme='dark']) .sms-textarea {
      background: #1E293B; border-color: #475569; color: #F8FAFC;
    }
    .sample-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sample-label { font-size: 11px; color: #64748B; font-weight: 600; }
    .chip {
      background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;
      padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; cursor: pointer;
    }
    :host-context([data-theme='dark']) .chip {
      background: #312E81; color: #A5B4FC; border-color: #4338CA;
    }
    .parsed-card {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 12px;
    }
    :host-context([data-theme='dark']) .parsed-card {
      background: #1E293B; border-color: #334155;
    }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .parsed-status { font-size: 11px; font-weight: 700; color: #10B981; }
    .amt-highlight { font-size: 18px; font-weight: 800; color: #EF4444; }
    .amt-highlight.income { color: #10B981; }
    .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 520px) { .fields-grid { grid-template-columns: 1fr; } }
    .field-item { display: flex; flex-direction: column; gap: 4px; }
    .field-item label { font-size: 11px; font-weight: 600; color: #64748B; }
    :host-context([data-theme='dark']) .field-item label { color: #94A3B8; }
    .form-input {
      border: 1px solid #CBD5E1; border-radius: 8px; padding: 8px 10px; font-size: 13px;
      background: #FFFFFF; color: #0F172A;
    }
    :host-context([data-theme='dark']) .form-input {
      background: #0F172A; border-color: #475569; color: #F8FAFC;
    }
    .form-input.bold { font-weight: 700; }
    .kind-group, .tag-group { display: flex; gap: 4px; }
    .kind-btn, .tag-btn {
      flex: 1; padding: 6px; border: 1px solid #CBD5E1; border-radius: 6px;
      background: transparent; font-size: 11px; font-weight: 600; cursor: pointer; color: #64748B;
    }
    :host-context([data-theme='dark']) .kind-btn, :host-context([data-theme='dark']) .tag-btn {
      border-color: #475569; color: #94A3B8;
    }
    .kind-btn.active, .tag-btn.active {
      background: #4F46E5; color: #FFFFFF; border-color: #4F46E5;
    }
    .modal-footer {
      padding: 14px 20px; border-top: 1px solid #E2E8F0;
      display: flex; justify-content: flex-end; gap: 10px;
    }
    :host-context([data-theme='dark']) .modal-footer { border-top-color: #334155; }
    .btn-ghost { background: none; border: 1px solid #CBD5E1; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    :host-context([data-theme='dark']) .btn-ghost { border-color: #475569; color: #E2E8F0; }
    .btn-primary { background: #4F46E5; color: #FFFFFF; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class FastEntryModalComponent implements OnInit {
  @Input() currency = 'USD';
  @Input() categories: Category[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{
    amountCents: number;
    kind: TransactionKind;
    tag: TransactionTag;
    source?: PaymentSource;
    merchant: string;
    notes: string;
    categoryId: number | null;
    occurredAt: string;
  }>();

  private readonly smartEntry = inject(SmartEntryService);
  readonly money = money;

  rawText = '';
  parsed: ParsedTransaction = {
    amount: 0,
    kind: 'expense',
    tag: 'need',
    source: 'Others',
    merchant: '',
    notes: '',
    categoryGuess: 'Food',
    date: new Date().toISOString().slice(0, 10),
  };
  selectedCategoryName = 'Food';

  ngOnInit(): void {
    const defaults = this.smartEntry.getLastDefaults();
    this.onTextChange('');
    if (defaults.categoryId && this.categories.length) {
      const matched = this.categories.find((c) => c.id === defaults.categoryId);
      if (matched) this.selectedCategoryName = matched.name;
    }
  }

  setSample(text: string): void {
    this.rawText = text;
    this.onTextChange(text);
  }

  onTextChange(text: string): void {
    const p = this.smartEntry.parseInput(text, this.categories);
    if (p) {
      this.parsed = p;
    } else {
      // Keep parsed card directly visible with fallback fields
      this.parsed = {
        amount: this.parsed?.amount || 0,
        kind: this.parsed?.kind || 'expense',
        tag: 'need',
        source: this.parsed?.source || 'Others',
        merchant: this.parsed?.merchant || '',
        notes: text,
        categoryGuess: this.parsed?.categoryGuess || 'Food',
        date: this.parsed?.date || new Date().toISOString().slice(0, 10),
      };
    }
    if (this.parsed && this.categories.length) {
      const match = this.categories.find(
        (c) => c.name.toLowerCase() === this.parsed!.categoryGuess.toLowerCase()
      );
      this.selectedCategoryName = match ? match.name : (this.categories[0]?.name || 'Food');
    }
  }

  confirmSave(): void {
    if (!this.parsed || this.parsed.amount <= 0) return;
    const cat = this.categories.find((c) => c.name === this.selectedCategoryName) || this.categories[0];
    const catId = cat ? cat.id : null;

    // Save as last-used defaults
    this.smartEntry.saveDefaults(catId, this.parsed.kind, this.parsed.tag);

    const [year, month, day] = this.parsed.date.split('-').map(Number);
    const [hours, minutes, seconds] = (this.parsed.time || '12:00:00').split(':').map(Number);
    const dt = new Date(year, (month || 1) - 1, day || 1, hours || 12, minutes || 0, seconds || 0);
    const occurredAt = !isNaN(dt.getTime()) ? dt.toISOString() : `${this.parsed.date}T12:00:00.000Z`;

    this.save.emit({
      amountCents: Math.round(this.parsed.amount * 100),
      kind: this.parsed.kind,
      tag: this.parsed.tag,
      source: this.parsed.source || 'Others',
      merchant: this.parsed.merchant,
      notes: this.parsed.notes,
      categoryId: catId,
      occurredAt
    });
    this.close.emit();
  }
}
