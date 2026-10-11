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
              <h3>Split Bill Calculator</h3>
              <p class="modal-sub">Calculate fair shares and generate formatted payment requests.</p>
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
                min="0.01"
                step="any"
                [(ngModel)]="totalAmount"
                (ngModelChange)="onValuesChange()"
                placeholder="0.00"
                class="form-control"
              />
            </div>
            <div class="form-group">
              <label for="split-people">Split Between (People)</label>
              <div class="stepper-wrap">
                <button type="button" class="btn-step" (click)="changePeople(-1)">−</button>
                <input
                  id="split-people"
                  type="number"
                  min="2"
                  max="50"
                  [(ngModel)]="peopleCount"
                  (ngModelChange)="onValuesChange()"
                  class="form-control text-center"
                />
                <button type="button" class="btn-step" (click)="changePeople(1)">+</button>
              </div>
            </div>
          </div>

          <!-- Quick Tip Selector -->
          <div class="form-group">
            <label>Add Tip / Gratuity</label>
            <div class="tip-pills">
              <button
                type="button"
                *ngFor="let t of tipPresets"
                class="pill-btn"
                [class.active]="selectedTip === t"
                (click)="setTip(t)"
              >
                {{ t }}%
              </button>
              <button
                type="button"
                class="pill-btn"
                [class.active]="selectedTip === 'custom'"
                (click)="selectedTip = 'custom'"
              >
                Custom
              </button>
            </div>
            <div class="custom-tip-wrap" *ngIf="selectedTip === 'custom'">
              <input
                type="number"
                min="0"
                max="100"
                [(ngModel)]="customTipPercent"
                (ngModelChange)="onValuesChange()"
                placeholder="Tip %"
                class="form-control"
              />
              <span class="tip-suffix">%</span>
            </div>
          </div>

          <div class="form-group">
            <label for="split-desc">Event / Place (Optional)</label>
            <input
              id="split-desc"
              type="text"
              [(ngModel)]="eventDescription"
              placeholder="e.g. Dinner at Olive Garden, Friday Pizza"
              class="form-control"
            />
          </div>

          <!-- Calculated Results Card -->
          <div class="result-card">
            <div class="result-row main-result">
              <span class="lbl">Each Person Pays</span>
              <span class="val highlighted">{{ formatMoney(perPersonShare()) }}</span>
            </div>
            <div class="divider"></div>
            <div class="breakdown-grid">
              <div class="breakdown-item">
                <span class="sub-lbl">Base Bill</span>
                <span class="sub-val">{{ formatMoney(totalAmount) }}</span>
              </div>
              <div class="breakdown-item">
                <span class="sub-lbl">Tip Amount ({{ effectiveTipPct() }}%)</span>
                <span class="sub-val">+{{ formatMoney(tipAmount()) }}</span>
              </div>
              <div class="breakdown-item">
                <span class="sub-lbl">Grand Total</span>
                <span class="sub-val bold">{{ formatMoney(grandTotal()) }}</span>
              </div>
            </div>
          </div>

          <!-- Preview Message -->
          <div class="form-group">
            <label>Share Message Preview</label>
            <div class="preview-box">
              <pre>{{ shareMessage() }}</pre>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" (click)="close.emit()">Close</button>
          <button
            type="button"
            class="btn-copy-msg"
            (click)="copyMessage()"
            [disabled]="totalAmount <= 0"
          >
            {{ copySuccess() ? '✓ Copied to Clipboard!' : '📋 Copy Message' }}
          </button>
          <button
            type="button"
            class="btn-primary"
            (click)="recordMyShare()"
            [disabled]="totalAmount <= 0"
            title="Add your share as a personal expense"
          >
            + Record My Share ({{ formatMoney(perPersonShare()) }})
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
    .modal {
      background: #FFFFFF; border-radius: 16px; width: 100%; max-width: 520px;
      max-height: 92vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
      border: 1px solid #E2E8F0; display: flex; flex-direction: column;
    }
    :host-context([data-theme='dark']) .modal {
      background: #0F172A; border-color: #334155; color: #F8FAFC;
    }
    .modal-header {
      padding: 18px 20px 14px; border-bottom: 1px solid #E2E8F0;
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    :host-context([data-theme='dark']) .modal-header { border-bottom-color: #334155; }
    .modal-title-wrap { display: flex; gap: 12px; align-items: center; }
    .modal-icon { font-size: 26px; }
    .modal-title-wrap h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .modal-title-wrap h3 { color: #F8FAFC; }
    .modal-sub { margin: 2px 0 0; font-size: 12px; color: #64748B; }
    :host-context([data-theme='dark']) .modal-sub { color: #94A3B8; }
    .btn-close {
      background: transparent; border: none; font-size: 18px; color: #64748B;
      cursor: pointer; padding: 4px; border-radius: 6px;
    }
    .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
    .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 480px) { .input-grid { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 12px; font-weight: 600; color: #475569; }
    :host-context([data-theme='dark']) .form-group label { color: #CBD5E1; }
    .form-control {
      border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; outline: none; background: #FFFFFF; color: #0F172A; width: 100%;
      box-sizing: border-box;
    }
    :host-context([data-theme='dark']) .form-control {
      background: #1E293B; border-color: #475569; color: #F8FAFC;
    }
    .stepper-wrap { display: flex; align-items: center; gap: 6px; }
    .btn-step {
      width: 38px; height: 38px; border-radius: 8px; border: 1px solid #CBD5E1;
      background: #F8FAFC; font-size: 18px; font-weight: 700; color: #334155;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    :host-context([data-theme='dark']) .btn-step {
      background: #1E293B; border-color: #475569; color: #CBD5E1;
    }
    .text-center { text-align: center; }
    .tip-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill-btn {
      background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 999px;
      padding: 5px 12px; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer;
    }
    .pill-btn.active {
      background: #4F46E5; border-color: #4F46E5; color: #FFFFFF; font-weight: 700;
    }
    :host-context([data-theme='dark']) .pill-btn {
      background: #1E293B; border-color: #475569; color: #94A3B8;
    }
    :host-context([data-theme='dark']) .pill-btn.active {
      background: #6366F1; border-color: #6366F1; color: #FFFFFF;
    }
    .custom-tip-wrap { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    .custom-tip-wrap input { width: 90px; }
    .tip-suffix { font-size: 13px; font-weight: 600; color: #64748B; }

    /* Result Card */
    .result-card {
      background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%);
      border: 1px solid #C7D2FE; border-radius: 12px; padding: 14px 16px;
    }
    :host-context([data-theme='dark']) .result-card {
      background: linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%);
      border-color: #312E81;
    }
    .main-result { display: flex; justify-content: space-between; align-items: baseline; }
    .main-result .lbl { font-size: 13px; font-weight: 700; color: #4338CA; text-transform: uppercase; letter-spacing: 0.5px; }
    :host-context([data-theme='dark']) .main-result .lbl { color: #A5B4FC; }
    .main-result .val.highlighted {
      font-size: 26px; font-weight: 800; color: #1E1B4B; letter-spacing: -0.5px;
    }
    :host-context([data-theme='dark']) .main-result .val.highlighted { color: #F8FAFC; }
    .divider { height: 1px; background: rgba(99, 102, 241, 0.2); margin: 10px 0; }
    .breakdown-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; }
    .breakdown-item { display: flex; flex-direction: column; gap: 2px; }
    .sub-lbl { font-size: 10px; font-weight: 600; color: #64748B; text-transform: uppercase; }
    :host-context([data-theme='dark']) .sub-lbl { color: #94A3B8; }
    .sub-val { font-size: 13px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .sub-val { color: #F1F5F9; }
    .sub-val.bold { color: #4338CA; }
    :host-context([data-theme='dark']) .sub-val.bold { color: #A5B4FC; }

    .preview-box {
      background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px;
      padding: 10px 12px; font-size: 12px; color: #334155; max-height: 110px; overflow-y: auto;
    }
    :host-context([data-theme='dark']) .preview-box {
      background: #1E293B; border-color: #334155; color: #CBD5E1;
    }
    .preview-box pre { margin: 0; font-family: inherit; white-space: pre-wrap; word-break: break-word; }

    .modal-footer {
      padding: 14px 20px; border-top: 1px solid #E2E8F0; display: flex;
      justify-content: flex-end; gap: 8px; flex-wrap: wrap;
    }
    :host-context([data-theme='dark']) .modal-footer { border-top-color: #334155; }
    .btn-secondary {
      background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px;
      padding: 9px 14px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer;
    }
    :host-context([data-theme='dark']) .btn-secondary {
      background: #1E293B; border-color: #475569; color: #CBD5E1;
    }
    .btn-copy-msg {
      background: #4F46E5; border: none; border-radius: 8px; padding: 9px 14px;
      font-size: 13px; font-weight: 700; color: #FFFFFF; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px; transition: background 0.15s ease;
    }
    .btn-copy-msg:hover:not(:disabled) { background: #4338CA; }
    .btn-copy-msg:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
      background: #10B981; border: none; border-radius: 8px; padding: 9px 14px;
      font-size: 13px; font-weight: 700; color: #FFFFFF; cursor: pointer;
    }
    .btn-primary:hover:not(:disabled) { background: #059669; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class SplitBillModalComponent implements OnInit {
  @Input() total = 0;
  @Input() currency = 'USD';
  @Input() defaultDescription = '';
  @Output() close = new EventEmitter<void>();
  @Output() recordShare = new EventEmitter<SplitRecordPayload>();

  totalAmount = 0;
  peopleCount = 2;
  selectedTip: number | 'custom' = 0;
  customTipPercent = 10;
  eventDescription = '';
  readonly tipPresets = [0, 5, 10, 15, 20];

  readonly copySuccess = signal(false);

  ngOnInit(): void {
    if (this.total > 0) {
      this.totalAmount = this.total;
    }
    if (this.defaultDescription) {
      this.eventDescription = this.defaultDescription;
    }
  }

  changePeople(delta: number): void {
    this.peopleCount = Math.max(2, Math.min(50, this.peopleCount + delta));
  }

  setTip(tip: number): void {
    this.selectedTip = tip;
  }

  effectiveTipPct(): number {
    return this.selectedTip === 'custom' ? (this.customTipPercent || 0) : this.selectedTip;
  }

  tipAmount(): number {
    return (this.totalAmount * this.effectiveTipPct()) / 100;
  }

  grandTotal(): number {
    return this.totalAmount + this.tipAmount();
  }

  perPersonShare(): number {
    if (this.peopleCount <= 0) return 0;
    return this.grandTotal() / this.peopleCount;
  }

  formatMoney(num: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }

  shareMessage(): string {
    const desc = this.eventDescription.trim() ? ` for "${this.eventDescription.trim()}"` : '';
    const shareFormatted = this.formatMoney(this.perPersonShare());
    const totalFormatted = this.formatMoney(this.grandTotal());
    return `Hey! The split bill${desc} came out to ${totalFormatted} total across ${this.peopleCount} of us.\n\nYour fair share is ${shareFormatted}.\nPlease transfer when you get a chance. Thanks!`;
  }

  async copyMessage(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareMessage());
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 3000);
    } catch {
      /* fallback */
    }
  }

  recordMyShare(): void {
    const cents = Math.round(this.perPersonShare() * 100);
    const desc = this.eventDescription.trim() ? ` (Split: ${this.eventDescription.trim()})` : ' (Split bill)';
    this.recordShare.emit({
      amountCents: cents,
      merchant: `My Share${desc}`,
      notes: `Total bill was ${this.formatMoney(this.grandTotal())} split across ${this.peopleCount} people.`
    });
  }

  onValuesChange(): void {
    this.copySuccess.set(false);
  }
}
