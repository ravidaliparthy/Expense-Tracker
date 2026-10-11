import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SplitRecordPayload {
  amountCents: number;
  merchant: string;
  notes: string;
}

@Component({
  selector: 'app-split-bill-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon">👥</span>
            <div>
              <h3>Split Bill & WhatsApp Share</h3>
              <p class="modal-sub">Calculate fair shares and generate instant WhatsApp message requests.</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <div class="input-grid">
            <div class="form-group">
              <label for="split-total">Total Bill Amount ({{ currency }})</label>
              <input
                id="split-total"
                type="number"
                step="0.01"
                min="0.01"
                [(ngModel)]="totalAmount"
                placeholder="0.00"
                class="split-input"
              />
            </div>

            <div class="form-group">
              <label for="split-people">Number of People (including you)</label>
              <div class="stepper-wrap">
                <button type="button" class="btn-step" (click)="decrementPeople()">−</button>
                <input
                  id="split-people"
                  type="number"
                  min="2"
                  max="50"
                  [(ngModel)]="peopleCount"
                  class="stepper-input"
                />
                <button type="button" class="btn-step" (click)="incrementPeople()">+</button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="split-desc">Occasion / Description</label>
            <input
              id="split-desc"
              type="text"
              [(ngModel)]="description"
              placeholder="e.g. Dinner, Uber ride, Team lunch, Groceries"
              class="split-input"
            />
          </div>

          <div class="form-group">
            <label for="split-payment">Your Payment Handle (optional)</label>
            <input
              id="split-payment"
              type="text"
              [(ngModel)]="paymentHandle"
              placeholder="e.g. UPI ID, Venmo @username, PayPal, Revolut"
              class="split-input"
            />
          </div>

          <!-- Dynamic Share Breakdown Card -->
          <div class="split-breakdown-card">
            <div class="breakdown-stat">
              <span class="stat-lbl">Per-person share</span>
              <span class="stat-val positive">{{ currency }} {{ perPersonShare().toFixed(2) }}</span>
            </div>
            <div class="breakdown-divider"></div>
            <div class="breakdown-stat">
              <span class="stat-lbl">Your portion</span>
              <span class="stat-val">{{ currency }} {{ perPersonShare().toFixed(2) }}</span>
            </div>
            <div class="breakdown-divider"></div>
            <div class="breakdown-stat">
              <span class="stat-lbl">Friends owe you</span>
              <span class="stat-val accent">{{ currency }} {{ friendsTotal().toFixed(2) }}</span>
            </div>
          </div>

          <!-- Live WhatsApp Message Preview -->
          <div class="msg-preview-wrap">
            <div class="msg-preview-header">
              <span class="wa-badge">💬 WhatsApp Message Preview</span>
              <button type="button" class="btn-copy-preview" (click)="copyMessage()">
                {{ copied() ? '✓ Copied!' : '📋 Copy Text' }}
              </button>
            </div>
            <pre class="msg-bubble">{{ generatedMessage() }}</pre>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button>
          
          <button
            type="button"
            class="btn-wa"
            (click)="shareOnWhatsapp()"
            [disabled]="perPersonShare() <= 0"
            title="Open WhatsApp with pre-filled split message"
          >
            <span>💬</span> Share via WhatsApp
          </button>

          <button
            type="button"
            class="btn-primary"
            (click)="recordMyShare()"
            [disabled]="perPersonShare() <= 0"
            title="Record your share to transactions"
          >
            <span>✓</span> Save My Share ({{ currency }} {{ perPersonShare().toFixed(2) }})
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }
    .modal {
      background: #FFFFFF;
      border-radius: 16px;
      width: 100%;
      max-width: 540px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(226, 232, 240, 0.8);
      display: flex;
      flex-direction: column;
    }
    :host-context([data-theme='dark']) .modal {
      background: #111827;
      border-color: #374151;
      color: #F8FAFC;
    }
    .modal-header {
      padding: 20px 24px 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #E2E8F0;
    }
    :host-context([data-theme='dark']) .modal-header {
      border-color: #1F2937;
    }
    .modal-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .modal-icon {
      font-size: 26px;
      padding: 8px;
      border-radius: 12px;
      background: #EEF2FF;
    }
    :host-context([data-theme='dark']) .modal-icon {
      background: #1E1B4B;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .modal-header h3 {
      color: #F8FAFC;
    }
    .modal-sub {
      margin: 4px 0 0;
      font-size: 12px;
      color: #64748B;
    }
    :host-context([data-theme='dark']) .modal-sub {
      color: #94A3B8;
    }
    .btn-close {
      background: transparent;
      border: none;
      font-size: 18px;
      color: #94A3B8;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .btn-close:hover {
      background: #F1F5F9;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .btn-close:hover {
      background: #1F2937;
      color: #FFFFFF;
    }
    .modal-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .input-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    :host-context([data-theme='dark']) .form-group label {
      color: #94A3B8;
    }
    .split-input {
      height: 48px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1.5px solid #CBD5E1;
      font-size: 16px;
      font-weight: 600;
      background: #FFFFFF;
      color: #0F172A;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .split-input:focus {
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    :host-context([data-theme='dark']) .split-input {
      background: #1F2937;
      border-color: #374151;
      color: #F8FAFC;
    }
    :host-context([data-theme='dark']) .split-input:focus {
      border-color: #818CF8;
      box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
    }
    .stepper-wrap {
      display: flex;
      align-items: center;
      height: 48px;
      border: 1.5px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      background: #FFFFFF;
      box-sizing: border-box;
    }
    :host-context([data-theme='dark']) .stepper-wrap {
      background: #1F2937;
      border-color: #374151;
    }
    .btn-step {
      width: 46px;
      height: 100%;
      background: #F8FAFC;
      border: none;
      cursor: pointer;
      font-weight: bold;
      font-size: 18px;
      color: #475569;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-step:hover {
      background: #EEF2FF;
      color: #4F46E5;
    }
    :host-context([data-theme='dark']) .btn-step {
      background: #111827;
      color: #CBD5E1;
    }
    :host-context([data-theme='dark']) .btn-step:hover {
      background: #1E1B4B;
      color: #A5B4FC;
    }
    .stepper-input {
      flex: 1;
      border: none;
      text-align: center;
      font-weight: 700;
      font-size: 15px;
      color: #0F172A;
      background: transparent;
      outline: none;
    }
    :host-context([data-theme='dark']) .stepper-input {
      color: #F8FAFC;
    }
    .split-breakdown-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
    :host-context([data-theme='dark']) .split-breakdown-card {
      background: #0B1220;
      border-color: #1F2937;
    }
    .breakdown-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .stat-lbl {
      font-size: 11px;
      font-weight: 600;
      color: #64748B;
      text-transform: uppercase;
    }
    .stat-val {
      font-size: 16px;
      font-weight: 700;
      color: #0F172A;
    }
    .stat-val.positive {
      color: #059669;
    }
    .stat-val.accent {
      color: #4F46E5;
    }
    :host-context([data-theme='dark']) .stat-val {
      color: #F8FAFC;
    }
    :host-context([data-theme='dark']) .stat-val.positive {
      color: #34D399 !important;
    }
    :host-context([data-theme='dark']) .stat-val.accent {
      color: #818CF8 !important;
    }
    .breakdown-divider {
      width: 1px;
      height: 32px;
      background: #CBD5E1;
    }
    :host-context([data-theme='dark']) .breakdown-divider {
      background: #374151;
    }
    .msg-preview-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .msg-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .wa-badge {
      font-size: 12px;
      font-weight: 700;
      color: #059669;
    }
    :host-context([data-theme='dark']) .wa-badge {
      color: #34D399;
    }
    .btn-copy-preview {
      background: transparent;
      border: 1px solid #CBD5E1;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      color: #475569;
    }
    .btn-copy-preview:hover {
      background: #F1F5F9;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .btn-copy-preview {
      border-color: #374151;
      color: #94A3B8;
    }
    .msg-bubble {
      margin: 0;
      padding: 12px 14px;
      background: #DCF8C6;
      border-radius: 10px;
      border-top-left-radius: 2px;
      color: #0F172A;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid rgba(5, 150, 105, 0.2);
    }
    :host-context([data-theme='dark']) .msg-bubble {
      background: #064E3B;
      color: #ECFDF5;
      border-color: #059669;
    }
    .modal-footer {
      padding: 16px 24px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-top: 1px solid #E2E8F0;
      flex-wrap: wrap;
    }
    :host-context([data-theme='dark']) .modal-footer {
      border-color: #1F2937;
    }
    .btn-wa {
      background: #25D366;
      color: #FFFFFF;
      border: none;
      padding: 9px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .btn-wa:hover:not(:disabled) {
      background: #1EBE5D;
      transform: translateY(-1px);
    }
    .btn-wa:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    @media (max-width: 600px) {
      .input-grid {
        grid-template-columns: 1fr;
      }
      .modal-footer {
        flex-direction: column;
      }
      .modal-footer button {
        width: 100%;
      }
    }
  `]
})
export class SplitBillModalComponent implements OnInit {
  @Input() total = 0;
  @Input() currency = 'USD';
  @Input() defaultDescription = '';
  @Output() recordShare = new EventEmitter<SplitRecordPayload>();
  @Output() close = new EventEmitter<void>();

  totalAmount = 0;
  peopleCount = 3;
  description = 'Dinner / Group expense';
  paymentHandle = '';
  readonly copied = signal(false);

  ngOnInit(): void {
    if (this.total > 0) {
      this.totalAmount = this.total;
    }
    if (this.defaultDescription) {
      this.description = this.defaultDescription;
    }
  }

  incrementPeople(): void {
    this.peopleCount = Math.min(50, this.peopleCount + 1);
  }

  decrementPeople(): void {
    this.peopleCount = Math.max(2, this.peopleCount - 1);
  }

  perPersonShare(): number {
    if (this.totalAmount <= 0 || this.peopleCount <= 0) return 0;
    return Math.round((this.totalAmount / this.peopleCount) * 100) / 100;
  }

  friendsTotal(): number {
    const share = this.perPersonShare();
    return Math.max(0, Math.round((this.totalAmount - share) * 100) / 100);
  }

  generatedMessage(): string {
    const share = this.perPersonShare().toFixed(2);
    const total = Number(this.totalAmount).toFixed(2);
    const desc = this.description.trim() || 'Shared Expense';
    const pay = this.paymentHandle.trim();

    let text = `Hey! 👋\nHere is the split for ${desc}:\n• Total bill: ${this.currency} ${total}\n• Split (${this.peopleCount} people): ${this.currency} ${share} each\n\n👉 Your share: ${this.currency} ${share}`;

    if (pay) {
      text += `\n💳 Payment handle: ${pay}`;
    }

    text += `\n\nWhenever you get a chance! 🙏`;
    return text;
  }

  shareOnWhatsapp(): void {
    const msg = this.generatedMessage();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  copyMessage(): void {
    const msg = this.generatedMessage();
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(msg).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    }
  }

  recordMyShare(): void {
    const share = this.perPersonShare();
    const desc = this.description.trim() || 'Shared expense';
    this.recordShare.emit({
      amountCents: Math.round(share * 100),
      merchant: desc,
      notes: `[Split bill: ${this.currency} ${share.toFixed(2)} of ${this.currency} ${this.totalAmount.toFixed(2)} total across ${this.peopleCount} people]`
    });
  }
}
