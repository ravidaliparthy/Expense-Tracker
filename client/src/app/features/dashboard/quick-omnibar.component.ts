import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Category } from '../../core/models';
import { FxService } from '../../core/fx.service';
import { ParsedOmnibarInput, parseOmnibarInput } from '../../core/nlp-parser';

export interface OmnibarSubmitPayload {
  amountCents: number;
  occurredAt: string;
  categoryId: number | null;
  kind: 'expense' | 'income';
  merchant: string;
  notes: string;
}

@Component({
  selector: 'app-quick-omnibar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="omnibar-container" [class.focused]="isFocused()">
      <div class="omnibar-input-wrap">
        <span class="omnibar-icon">⚡</span>
        <input
          #inputEl
          type="text"
          [(ngModel)]="query"
          (input)="onInputChange()"
          (focus)="isFocused.set(true)"
          (blur)="isFocused.set(false)"
          (keydown)="onKeydown($event)"
          [placeholder]="placeholderText"
          class="omnibar-input"
        />
        <div class="omnibar-actions">
          <span class="hotkey-badge" *ngIf="!query.trim()" title="Press / to focus">/</span>
          <button
            type="button"
            class="btn-clear"
            *ngIf="query.trim()"
            (click)="clear()"
            title="Clear input"
          >
            ✕
          </button>
          <button
            type="button"
            class="btn-log"
            [disabled]="!parsed().isValid || busy"
            (click)="commit()"
            title="Save transaction instantly"
          >
            {{ busy ? 'Saving...' : '⚡ Log' }}
          </button>
        </div>
      </div>

      <!-- Live Intelligent Preview Bar (Displays while typing) -->
      <div class="live-preview" *ngIf="query.trim() && parsed().isValid">
        <div class="preview-badge" [class.income]="parsed().kind === 'income'">
          <span class="kind-tag">{{ parsed().kind === 'income' ? '+ Income' : '- Expense' }}</span>
          <span class="amount-tag">
            {{ currency }} {{ parsed().displayAmount.toFixed(2) }}
          </span>
          <span class="cat-tag" *ngIf="parsed().matchedCategory">
            {{ parsed().categoryIcon }} {{ parsed().categoryLabel }}
          </span>
          <span class="merchant-tag">
            📍 {{ parsed().merchant }}
          </span>
          <span class="date-tag">
            📅 {{ parsed().dateLabel }}
          </span>
          <span class="fx-tag" *ngIf="parsed().currencyConverted as fx">
            💱 {{ fx.fromSymbol }}{{ fx.fromAmount }} {{ fx.fromCode }}
          </span>
        </div>
        <span class="enter-hint">Press <strong>Enter ↵</strong> to save instantly</span>
      </div>

      <!-- 1-Tap Quick Suggestion Chips (Common daily actions) -->
      <div class="quick-chips-row" *ngIf="!query.trim()">
        <span class="chips-lbl">Quick Add:</span>
        <button type="button" class="chip-btn" (click)="applyQuick('4.50 Coffee')">
          ☕ Coffee $4.50
        </button>
        <button type="button" class="chip-btn" (click)="applyQuick('15.00 Lunch')">
          🍔 Lunch $15.00
        </button>
        <button type="button" class="chip-btn" (click)="applyQuick('35.00 Groceries')">
          🛒 Groceries $35.00
        </button>
        <button type="button" class="chip-btn" (click)="applyQuick('3.00 Metro')">
          🚇 Transit $3.00
        </button>
        <button type="button" class="chip-btn" (click)="applyQuick('40.00 Gas')">
          ⛽ Gas $40.00
        </button>
      </div>
    </div>
  `,
  styles: [`
    .omnibar-container {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 12px;
      padding: 8px 12px;
      margin-bottom: 16px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
    }
    :host-context([data-theme='dark']) .omnibar-container {
      background: #111827;
      border-color: #374151;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .omnibar-container.focused {
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    :host-context([data-theme='dark']) .omnibar-container.focused {
      border-color: #818CF8;
    }
    .omnibar-input-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .omnibar-icon {
      font-size: 16px;
      color: #F59E0B;
      flex-shrink: 0;
    }
    .omnibar-input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 14px;
      color: #0F172A;
      outline: none;
      font-weight: 500;
    }
    :host-context([data-theme='dark']) .omnibar-input {
      color: #F8FAFC;
    }
    .omnibar-input::placeholder {
      color: #94A3B8;
      font-weight: 400;
    }
    .omnibar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hotkey-badge {
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      color: #64748B;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
    }
    :host-context([data-theme='dark']) .hotkey-badge {
      background: #1F2937;
      border-color: #374151;
      color: #94A3B8;
    }
    .btn-clear {
      background: transparent;
      border: none;
      color: #94A3B8;
      font-size: 13px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .btn-clear:hover {
      color: #0F172A;
      background: #E2E8F0;
    }
    :host-context([data-theme='dark']) .btn-clear:hover {
      color: #FFFFFF;
      background: #374151;
    }
    .btn-log {
      background: #4F46E5;
      color: #FFFFFF;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.1s ease, transform 0.1s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn-log:hover:not(:disabled) {
      background: #4338CA;
      transform: translateY(-1px);
    }
    .btn-log:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    :host-context([data-theme='dark']) .btn-log {
      background: #6366F1;
    }
    :host-context([data-theme='dark']) .btn-log:hover:not(:disabled) {
      background: #4F46E5;
    }
    .live-preview {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #E2E8F0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    :host-context([data-theme='dark']) .live-preview {
      border-color: #1F2937;
    }
    .preview-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .kind-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      background: #FEE2E2;
      color: #DC2626;
    }
    .preview-badge.income .kind-tag {
      background: #DCFCE7;
      color: #16A34A;
    }
    :host-context([data-theme='dark']) .kind-tag {
      background: #450A0A;
      color: #F87171;
    }
    :host-context([data-theme='dark']) .preview-badge.income .kind-tag {
      background: #052E16;
      color: #34D399;
    }
    .amount-tag {
      font-size: 13px;
      font-weight: 700;
      color: #0F172A;
      font-family: monospace;
    }
    :host-context([data-theme='dark']) .amount-tag {
      color: #F8FAFC;
    }
    .cat-tag, .merchant-tag, .date-tag, .fx-tag {
      font-size: 11px;
      background: #F1F5F9;
      color: #475569;
      padding: 2px 7px;
      border-radius: 4px;
    }
    :host-context([data-theme='dark']) .cat-tag,
    :host-context([data-theme='dark']) .merchant-tag,
    :host-context([data-theme='dark']) .date-tag,
    :host-context([data-theme='dark']) .fx-tag {
      background: #1F2937;
      color: #CBD5E1;
    }
    .fx-tag {
      background: #FEF3C7;
      color: #D97706;
      font-weight: 600;
    }
    :host-context([data-theme='dark']) .fx-tag {
      background: #451A03;
      color: #FBBF24;
    }
    .enter-hint {
      font-size: 11px;
      color: #94A3B8;
    }
    .quick-chips-row {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #F1F5F9;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    :host-context([data-theme='dark']) .quick-chips-row {
      border-color: #1F2937;
    }
    .chips-lbl {
      font-size: 11px;
      font-weight: 600;
      color: #94A3B8;
      margin-right: 2px;
    }
    .chip-btn {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      color: #334155;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .chip-btn:hover {
      background: #EEF2FF;
      border-color: #6366F1;
      color: #4F46E5;
    }
    :host-context([data-theme='dark']) .chip-btn {
      background: #1F2937;
      border-color: #374151;
      color: #CBD5E1;
    }
    :host-context([data-theme='dark']) .chip-btn:hover {
      background: #1E1B4B;
      border-color: #818CF8;
      color: #C7D2FE;
    }
  `]
})
export class QuickOmnibarComponent {
  private fx = inject(FxService);

  @Input() categories: Category[] = [];
  @Input() currency = 'USD';
  @Input() busy = false;
  @Output() submitExpense = new EventEmitter<OmnibarSubmitPayload>();

  @ViewChild('inputEl') inputRef!: ElementRef<HTMLInputElement>;

  query = '';
  readonly isFocused = signal(false);
  readonly placeholderText = '⚡ Quick Log: e.g. "15 lunch", "45 groceries", "1200 salary", "€20 coffee" (Press /)';

  readonly parsed = computed<ParsedOmnibarInput>(() => {
    return parseOmnibarInput(this.query, this.categories, this.currency, this.fx);
  });

  @HostListener('window:keydown', ['$event'])
  handleGlobalSlash(e: KeyboardEvent): void {
    if (e.key === '/' && !this.isFocused()) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      this.inputRef?.nativeElement?.focus();
    }
  }

  onInputChange(): void {
    // Computed signal updates automatically
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.commit();
    } else if (e.key === 'Escape') {
      this.clear();
      this.inputRef?.nativeElement?.blur();
    }
  }

  commit(): void {
    const p = this.parsed();
    if (!p.isValid || this.busy) return;

    this.submitExpense.emit({
      amountCents: p.amountCents,
      occurredAt: p.occurredAtUtc,
      categoryId: p.categoryId,
      kind: p.kind,
      merchant: p.merchant,
      notes: p.notes
    });

    this.query = '';
  }

  applyQuick(text: string): void {
    this.query = text;
    this.commit();
  }

  clear(): void {
    this.query = '';
  }
}
