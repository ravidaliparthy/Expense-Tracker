import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FxService, SUPPORTED_CURRENCIES } from '../../core/fx.service';

@Component({
  selector: 'app-currency-converter-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon">💱</span>
            <div>
              <h3>Multi-Currency Converter</h3>
              <p class="modal-sub">Offline-ready currency converter with zero server latency.</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <div class="converter-box">
            <div class="conv-col">
              <label for="from-amount">From</label>
              <div class="curr-input-wrap">
                <input
                  id="from-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  [(ngModel)]="fromAmount"
                  (ngModelChange)="onFromChange()"
                  placeholder="0.00"
                  class="conv-input"
                />
                <select id="from-currency" [(ngModel)]="fromCurrency" (ngModelChange)="onFromChange()" class="curr-select">
                  <option *ngFor="let c of currencies" [value]="c.code">{{ c.code }} ({{ c.symbol }})</option>
                </select>
              </div>
            </div>

            <button type="button" class="btn-swap" (click)="swapCurrencies()" title="Swap currencies">
              ⇄
            </button>

            <div class="conv-col">
              <label for="to-amount">To</label>
              <div class="curr-input-wrap">
                <input
                  id="to-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  [value]="toAmount.toFixed(2)"
                  readonly
                  class="conv-input readonly"
                />
                <select id="to-currency" [(ngModel)]="toCurrency" (ngModelChange)="onFromChange()" class="curr-select">
                  <option *ngFor="let c of currencies" [value]="c.code">{{ c.code }} ({{ c.symbol }})</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Conversion rate pill -->
          <div class="rate-pill">
            <span>1 {{ fromCurrency }} = <strong>{{ unitRate.toFixed(4) }} {{ toCurrency }}</strong></span>
            <span class="sub-pill">Updated daily · Cached locally</span>
          </div>

          <!-- Currency reference table -->
          <div class="rates-table-wrap">
            <h4>Quick Reference Rates (vs {{ fromCurrency }})</h4>
            <div class="rates-grid">
              <div class="rate-cell" *ngFor="let c of currencies" [class.active]="c.code === toCurrency">
                <span class="cell-code">{{ c.code }}</span>
                <span class="cell-val">{{ (c.rateToUsd / currentFromRateToUsd).toFixed(2) }} {{ c.symbol }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-ghost" (click)="close.emit()">Close</button>
          <button type="button" class="btn-primary" (click)="copyResult()">
            📋 Copy {{ toCurrency }} {{ toAmount.toFixed(2) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 16px;
    }
    .modal {
      background: #FFFFFF; border-radius: 16px; width: 100%; max-width: 520px;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(226, 232, 240, 0.8); display: flex; flex-direction: column;
    }
    :host-context([data-theme='dark']) .modal {
      background: #111827; border-color: #374151; color: #F8FAFC;
    }
    .modal-header {
      padding: 20px 24px 16px; display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 1px solid #E2E8F0;
    }
    :host-context([data-theme='dark']) .modal-header { border-color: #1F2937; }
    .modal-title-wrap { display: flex; align-items: center; gap: 12px; }
    .modal-icon { font-size: 26px; padding: 8px; border-radius: 12px; background: #EEF2FF; }
    :host-context([data-theme='dark']) .modal-icon { background: #1E1B4B; }
    .modal-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .modal-header h3 { color: #F8FAFC; }
    .modal-sub { margin: 4px 0 0; font-size: 12px; color: #64748B; }
    :host-context([data-theme='dark']) .modal-sub { color: #94A3B8; }
    .btn-close {
      background: transparent; border: none; font-size: 18px; color: #94A3B8; cursor: pointer;
      padding: 4px 8px; border-radius: 6px;
    }
    .btn-close:hover { background: #F1F5F9; color: #0F172A; }
    :host-context([data-theme='dark']) .btn-close:hover { background: #1F2937; color: #FFFFFF; }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
    .converter-box { display: flex; align-items: flex-end; gap: 10px; }
    .conv-col { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .conv-col label { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; }
    :host-context([data-theme='dark']) .conv-col label { color: #94A3B8; }
    .curr-input-wrap {
      display: flex; border: 1px solid #CBD5E1; border-radius: 8px; overflow: hidden; background: #FFFFFF;
    }
    :host-context([data-theme='dark']) .curr-input-wrap { background: #1F2937; border-color: #374151; }
    .conv-input {
      flex: 1; min-width: 0; padding: 10px 12px; border: none; font-size: 15px; font-weight: 600;
      color: #0F172A; background: transparent; outline: none;
    }
    :host-context([data-theme='dark']) .conv-input { color: #F8FAFC; }
    .conv-input.readonly { background: #F8FAFC; color: #4F46E5; }
    :host-context([data-theme='dark']) .conv-input.readonly { background: #0B1220; color: #818CF8; }
    .curr-select {
      background: #F1F5F9; border: none; border-left: 1px solid #CBD5E1; padding: 0 10px;
      font-size: 13px; font-weight: 600; color: #334155; outline: none; cursor: pointer;
    }
    :host-context([data-theme='dark']) .curr-select { background: #111827; border-color: #374151; color: #CBD5E1; }
    .btn-swap {
      height: 42px; width: 42px; border-radius: 8px; border: 1px solid #CBD5E1;
      background: #F8FAFC; font-size: 18px; color: #475569; cursor: pointer; display: flex;
      align-items: center; justify-content: center; transition: all 0.1s ease;
    }
    .btn-swap:hover { background: #EEF2FF; border-color: #6366F1; color: #4F46E5; transform: rotate(180deg); }
    :host-context([data-theme='dark']) .btn-swap { background: #1F2937; border-color: #374151; color: #CBD5E1; }
    :host-context([data-theme='dark']) .btn-swap:hover { background: #1E1B4B; color: #A5B4FC; }
    .rate-pill {
      background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px; padding: 8px 12px;
      display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #3730A3;
    }
    :host-context([data-theme='dark']) .rate-pill { background: #1E1B4B; border-color: #3730A3; color: #C7D2FE; }
    .sub-pill { font-size: 11px; opacity: 0.8; }
    .rates-table-wrap h4 { margin: 0 0 10px; font-size: 13px; color: #475569; font-weight: 600; }
    :host-context([data-theme='dark']) .rates-table-wrap h4 { color: #94A3B8; }
    .rates-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .rate-cell {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 10px;
      display: flex; justify-content: space-between; font-size: 12px;
    }
    :host-context([data-theme='dark']) .rate-cell { background: #1F2937; border-color: #374151; }
    .rate-cell.active { border-color: #6366F1; background: #EEF2FF; }
    :host-context([data-theme='dark']) .rate-cell.active { border-color: #818CF8; background: #1E1B4B; }
    .cell-code { font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .cell-code { color: #F8FAFC; }
    .cell-val { color: #64748B; font-family: monospace; }
    :host-context([data-theme='dark']) .cell-val { color: #94A3B8; }
    .modal-footer {
      padding: 16px 24px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #E2E8F0;
    }
    :host-context([data-theme='dark']) .modal-footer { border-color: #1F2937; }
  `]
})
export class CurrencyConverterModalComponent implements OnInit {
  private fx = inject(FxService);

  @Input() initialAmount = 100;
  @Input() initialCurrency = 'USD';
  @Output() close = new EventEmitter<void>();

  readonly currencies = SUPPORTED_CURRENCIES;
  fromAmount = 100;
  fromCurrency = 'USD';
  toCurrency = 'EUR';
  toAmount = 0;
  unitRate = 0;
  currentFromRateToUsd = 1.0;

  ngOnInit(): void {
    if (this.initialCurrency) {
      this.fromCurrency = this.initialCurrency.toUpperCase();
      this.toCurrency = this.fromCurrency === 'USD' ? 'EUR' : 'USD';
    }
    if (this.initialAmount > 0) {
      this.fromAmount = this.initialAmount;
    }
    this.recalculate();
  }

  onFromChange(): void {
    this.recalculate();
  }

  swapCurrencies(): void {
    const temp = this.fromCurrency;
    this.fromCurrency = this.toCurrency;
    this.toCurrency = temp;
    this.recalculate();
  }

  recalculate(): void {
    this.toAmount = this.fx.convert(this.fromAmount, this.fromCurrency, this.toCurrency);
    this.unitRate = this.fx.convert(1, this.fromCurrency, this.toCurrency);
    const fromRate = this.currencies.find((c) => c.code === this.fromCurrency)?.rateToUsd || 1.0;
    this.currentFromRateToUsd = fromRate;
  }

  copyResult(): void {
    const txt = `${this.toCurrency} ${this.toAmount.toFixed(2)}`;
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(txt);
    }
    this.close.emit();
  }
}
