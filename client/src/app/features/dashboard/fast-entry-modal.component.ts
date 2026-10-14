import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, inject } from '@angular/core';
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
              <h3>Fast Entry & Voice / SMS Parser</h3>
              <p class="subtitle">Type, paste Indian Bank/UPI SMS, or speak aloud (Voice Mode)</p>
            </div>
          </div>
          <div class="header-actions">
            <button
              type="button"
              class="voice-toggle-btn"
              [class.recording]="isRecording"
              (click)="toggleVoice()"
              [title]="isRecording ? 'Click to stop listening' : 'Start speaking your expense'"
            >
              <span class="mic-dot" *ngIf="isRecording"></span>
              <span>{{ isRecording ? '🔴 Listening...' : '🎙️ Voice Mode' }}</span>
            </button>
            <button type="button" class="btn-close" (click)="close.emit()">✕</button>
          </div>
        </div>

        <div class="modal-body">
          <!-- Text Input / SMS Paste & Voice Area -->
          <div class="input-wrap">
            <div class="input-label-row">
              <label>Paste Transaction SMS / UPI Text, or Speak:</label>
              <div class="voice-ctrl-cluster">
                <button
                  *ngIf="isSafari || isIOS"
                  type="button"
                  class="lang-pill-btn"
                  (click)="toggleLanguage()"
                  [title]="'Speech language: ' + (speechLang === 'en-IN' ? 'Indian English' : 'Global English (US)')"
                >
                  <span>{{ speechLang === 'en-IN' ? '🇮🇳 IN' : '🌐 US' }}</span>
                </button>
                <button
                  type="button"
                  class="mic-pill-btn"
                  [class.active]="isRecording"
                  (click)="toggleVoice()"
                >
                  <span *ngIf="isRecording" class="mic-dot"></span>
                  <span>{{ isRecording ? '⏹ Stop' : '🎙️ Speak Now' }}</span>
                </button>
              </div>
            </div>
            <textarea
              [(ngModel)]="rawText"
              (ngModelChange)="onTextChange($event)"
              rows="3"
              class="sms-textarea"
              [class.listening]="isRecording"
              placeholder="e.g. 'Paid Rs 450 to Swiggy via GPay for Travel' or tap 🎙️ Voice Mode to speak"
            ></textarea>

            <!-- Dynamic Voice Wave / Status Indicator -->
            <div *ngIf="isRecording" class="voice-listening-bar">
              <div class="pulse-indicator"></div>
              <div class="wave-lines">
                <span class="wave"></span>
                <span class="wave"></span>
                <span class="wave"></span>
                <span class="wave"></span>
              </div>
              <span class="voice-text">
                {{ rawText ? 'Heard: “' + rawText + '”' : 'Listening... Speak naturally (e.g. "Paid 450 to Swiggy via GPay")' }}
              </span>
              <button type="button" class="btn-voice-done" (click)="toggleVoice()">Done ✓</button>
            </div>

            <!-- Voice Notice / Error Banner -->
            <div *ngIf="speechError" class="voice-error-banner">
              <div class="error-msg-wrap">
                <span>⚠️ {{ speechError }}</span>
                <button
                  *ngIf="isSafari || isIOS"
                  type="button"
                  class="safari-guide-link"
                  (click)="showSafariHelp = !showSafariHelp"
                >
                  {{ showSafariHelp ? 'Hide Safari Checklist ▲' : 'Open Safari Checklist ▼' }}
                </button>
              </div>
              <button type="button" class="btn-dismiss" (click)="speechError = null">✕</button>
            </div>

            <!-- Safari / iOS Configuration Checklist Card -->
            <div *ngIf="showSafariHelp" class="safari-help-card">
              <div class="safari-help-header">
                <span class="safari-help-title">🍎 Safari & iPhone Microphone Configuration Checklist</span>
                <button type="button" class="btn-dismiss" (click)="showSafariHelp = false">✕</button>
              </div>
              <div class="safari-checklist">
                <div class="check-item">
                  <span class="check-icon">🔋</span>
                  <div>
                    <strong>1. Turn OFF Low Power Mode</strong>
                    <p>Go to <em>Settings → Battery</em> and toggle <strong>Low Power Mode OFF</strong>. When the battery icon is yellow, iOS suspends Apple dictation network sockets after 1–3 seconds, causing immediate microphone cutoff.</p>
                  </div>
                </div>
                <div class="check-item">
                  <span class="check-icon">⌨️</span>
                  <div>
                    <strong>2. Enable Dictation in Keyboard Settings</strong>
                    <p>Safari requires system dictation. Go to <em>Settings → General → Keyboard</em> → turn <strong>Enable Dictation ON</strong>. Ensure English is listed under Dictation Languages.</p>
                  </div>
                </div>
                <div class="check-item">
                  <span class="check-icon">🎙️</span>
                  <div>
                    <strong>3. Safari Address Bar Microphone Permission</strong>
                    <p>On this page in Safari, tap the <strong>aA</strong> (or lock) icon on the left of the address bar → tap <strong>Website Settings</strong> → set <strong>Microphone</strong> to <strong>Allow</strong>.</p>
                  </div>
                </div>
                <div class="check-item">
                  <span class="check-icon">🗣️</span>
                  <div>
                    <strong>4. Speak Promptly (2–4 Second Silence Limit)</strong>
                    <p>Apple's speech engine strictly closes if silence is detected for 2–4 seconds. Speak your expense clearly immediately after tapping 🎙️ Speak Now (e.g. <em>"Paid 450 to Swiggy via GPay"</em>).</p>
                  </div>
                </div>
                <div class="check-item" *ngIf="isStandalone || isIOS">
                  <span class="check-icon">📱</span>
                  <div>
                    <strong>5. Standalone PWA vs Safari Permission Persistence</strong>
                    <p>Apple WebKit resets media permissions in Home Screen PWAs whenever the app is closed from App Switcher. Inside the PWA, tap <strong>🎙️ Speak Now</strong> once per session to enable it freely. For permanent <em>"Always Allow"</em> (never resets), use the app directly in Safari!</p>
                    <a *ngIf="isStandalone" href="https://expense-tracker-ochre-eight-80.vercel.app/" target="_blank" rel="noopener" class="btn-safari-ext">
                      🌐 Open in Safari for Permanent "Always Allow" Permission ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
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
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .emoji-icon { font-size: 24px; }
    .header-left h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .subtitle { margin: 2px 0 0; font-size: 12px; color: #64748B; }
    :host-context([data-theme='dark']) .subtitle { color: #94A3B8; }
    .btn-close { background: none; border: none; font-size: 18px; color: #64748B; cursor: pointer; }

    /* Voice Buttons */
    .voice-toggle-btn, .mic-pill-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;
      cursor: pointer; transition: all 0.2s ease; border: 1px solid #C7D2FE;
      background: #EEF2FF; color: #4F46E5;
    }
    :host-context([data-theme='dark']) .voice-toggle-btn,
    :host-context([data-theme='dark']) .mic-pill-btn {
      background: #1E1B4B; border-color: #4338CA; color: #C7D2FE;
    }
    .voice-toggle-btn:hover, .mic-pill-btn:hover {
      background: #E0E7FF; border-color: #818CF8; transform: translateY(-1px);
    }
    .voice-toggle-btn.recording, .mic-pill-btn.active {
      background: #FEE2E2 !important; border-color: #F87171 !important; color: #DC2626 !important;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); animation: mic-pulse 1.6s infinite;
    }
    :host-context([data-theme='dark']) .voice-toggle-btn.recording,
    :host-context([data-theme='dark']) .mic-pill-btn.active {
      background: #450A0A !important; border-color: #B91C1C !important; color: #FCA5A5 !important;
    }
    @keyframes mic-pulse {
      0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
      70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }
    .mic-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #EF4444;
      display: inline-block; animation: blink 1s infinite alternate;
    }
    @keyframes blink { from { opacity: 0.3; } to { opacity: 1; } }

    .modal-body { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
    .input-wrap label { font-size: 12px; font-weight: 600; color: #475569; }
    :host-context([data-theme='dark']) .input-wrap label { color: #CBD5E1; }
    .input-label-row {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
    }
    .sms-textarea {
      width: 100%; border: 1px solid #CBD5E1; border-radius: 10px; padding: 10px 12px;
      font-size: 13px; font-family: inherit; resize: vertical; box-sizing: border-box;
      background: #F8FAFC; transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    :host-context([data-theme='dark']) .sms-textarea {
      background: #1E293B; border-color: #475569; color: #F8FAFC;
    }
    .sms-textarea.listening {
      border-color: #EF4444 !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
    }

    /* Voice Wave Indicator */
    .voice-listening-bar {
      display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin-top: 6px;
      border-radius: 8px; background: #FEF2F2; border: 1px solid #FECACA;
      font-size: 12px; color: #B91C1C;
    }
    :host-context([data-theme='dark']) .voice-listening-bar {
      background: #2D1515; border-color: #7F1D1D; color: #FCA5A5;
    }
    .pulse-indicator {
      width: 8px; height: 8px; border-radius: 50%; background: #EF4444;
      box-shadow: 0 0 8px #EF4444; flex-shrink: 0;
    }
    .wave-lines { display: flex; align-items: center; gap: 3px; height: 14px; }
    .wave {
      width: 3px; height: 6px; background: #EF4444; border-radius: 3px;
      animation: sound-wave 0.6s ease-in-out infinite alternate;
    }
    .wave:nth-child(2) { animation-delay: 0.15s; height: 12px; }
    .wave:nth-child(3) { animation-delay: 0.3s; height: 9px; }
    .wave:nth-child(4) { animation-delay: 0.45s; height: 14px; }
    @keyframes sound-wave {
      0% { height: 4px; }
      100% { height: 14px; }
    }
    .voice-text { font-weight: 500; font-size: 11px; flex: 1; }
    .btn-voice-done {
      background: #DC2626; color: #fff; border: none; border-radius: 6px;
      padding: 3px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
      margin-left: auto; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .btn-voice-done:hover { background: #B91C1C; }
    .voice-ctrl-cluster { display: flex; align-items: center; gap: 6px; }
    .lang-pill-btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;
      cursor: pointer; transition: all 0.2s ease; border: 1px solid #CBD5E1;
      background: #F1F5F9; color: #475569;
    }
    :host-context([data-theme='dark']) .lang-pill-btn {
      background: #1E293B; border-color: #475569; color: #CBD5E1;
    }
    .lang-pill-btn:hover { background: #E2E8F0; color: #1E293B; }
    :host-context([data-theme='dark']) .lang-pill-btn:hover { background: #334155; color: #F8FAFC; }

    .voice-error-banner {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
      padding: 8px 10px; margin-top: 6px; border-radius: 8px;
      background: #FFFBEB; border: 1px solid #FDE68A; color: #B45309; font-size: 11px; line-height: 1.4;
    }
    :host-context([data-theme='dark']) .voice-error-banner {
      background: #362506; border-color: #78350F; color: #FCD34D;
    }
    .error-msg-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .safari-guide-link {
      background: none; border: none; padding: 0; font-size: 11px; font-weight: 700;
      color: #D97706; text-decoration: underline; cursor: pointer; text-align: left;
    }
    :host-context([data-theme='dark']) .safari-guide-link { color: #FDE68A; }

    .safari-help-card {
      margin-top: 8px; padding: 12px; border-radius: 10px;
      background: #F8FAFC; border: 1px solid #E2E8F0; display: flex; flex-direction: column; gap: 10px;
    }
    :host-context([data-theme='dark']) .safari-help-card {
      background: #0F172A; border-color: #334155;
    }
    .safari-help-header {
      display: flex; justify-content: space-between; align-items: center;
    }
    .safari-help-title { font-size: 12px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .safari-help-title { color: #F8FAFC; }
    .safari-checklist { display: flex; flex-direction: column; gap: 8px; font-size: 11px; }
    .check-item { display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; color: #475569; }
    :host-context([data-theme='dark']) .check-item { color: #CBD5E1; }
    .check-item strong { color: #0F172A; }
    :host-context([data-theme='dark']) .check-item strong { color: #F1F5F9; }
    .check-item p { margin: 2px 0 0; }
    .check-icon { font-size: 14px; flex-shrink: 0; }
    .btn-safari-ext {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
      background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;
      text-decoration: none; margin-top: 6px; cursor: pointer; transition: all 0.2s ease;
    }
    :host-context([data-theme='dark']) .btn-safari-ext {
      background: #312E81; color: #C7D2FE; border-color: #4338CA;
    }
    .btn-safari-ext:hover { background: #E0E7FF; }
    .btn-dismiss { background: none; border: none; cursor: pointer; color: inherit; font-size: 12px; }

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

    @media (max-width: 480px) {
      .overlay { padding: 10px; }
      .modal-box { max-height: 94dvh; border-radius: 14px; }
      .modal-header { padding: 12px 14px; }
      .modal-body { padding: 14px; gap: 12px; }
      .modal-footer { padding: 12px 14px; }
      .header-left h3 { font-size: 14px; }
      .subtitle { font-size: 11px; }
      .amt-highlight { font-size: 16px; }
    }
  `]
})
export class FastEntryModalComponent implements OnInit, OnDestroy {
  @Input() currency = 'USD';
  @Input() categories: Category[] = [];
  @Input() startWithVoice = false;
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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
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

  // Voice Mode State
  isRecording = false;
  speechError: string | null = null;
  hasSpeechSupport = true;
  private recognition: any = null;

  isBrave = false;
  isSafari = false;
  isIOS = false;
  isStandalone = false;
  speechLang: 'en-IN' | 'en-US' = 'en-IN';
  showSafariHelp = false;

  ngOnInit(): void {
    const defaults = this.smartEntry.getLastDefaults();
    this.onTextChange('');
    if (defaults.categoryId && this.categories.length) {
      const matched = this.categories.find((c) => c.id === defaults.categoryId);
      if (matched) this.selectedCategoryName = matched.name;
    }

    if (typeof window !== 'undefined') {
      this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;
    }

    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      this.isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
      this.isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if ((navigator as any).brave?.isBrave) {
        (navigator as any).brave.isBrave().then((b: boolean) => {
          this.isBrave = b;
        }).catch(() => {});
      }
    }

    this.hasSpeechSupport = this.checkSpeechSupport();
    if (this.startWithVoice && this.hasSpeechSupport) {
      if (this.isStandalone && this.isIOS) {
        // In iOS PWA, WebKit blocks microphone permission prompts when triggered outside direct tap handlers.
        // Prompt user to tap "Speak Now" directly so iOS shows the permission prompt cleanly.
        this.speechError = 'iOS Home Screen PWA: Tap 🎙️ Speak Now to activate microphone for this session.';
      } else {
        try {
          this.startListeningSession();
        } catch {
          this.isRecording = false;
          this.cdr.detectChanges();
        }
      }
    }
  }

  toggleLanguage(): void {
    this.speechLang = this.speechLang === 'en-IN' ? 'en-US' : 'en-IN';
    if (this.isRecording) {
      this.stopListeningSession();
      setTimeout(() => this.startListeningSession(), 100);
    }
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.cleanupVoiceSession();
  }

  checkSpeechSupport(): boolean {
    return typeof window !== 'undefined' &&
      (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));
  }

  toggleVoice(): void {
    if (this.isRecording) {
      this.stopListeningSession();
    } else {
      this.startListeningSession();
    }
  }

  private cleanupVoiceSession(): void {
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
  }

  private startListeningSession(): void {
    // Dismiss mobile virtual keyboard so OS does not mute microphone
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    this.cleanupVoiceSession();

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      this.hasSpeechSupport = false;
      this.isRecording = false;
      this.speechError = 'Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.';
      this.cdr.detectChanges();
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      // en-IN recognizes Indian English, UPI terms (Rs, Swiggy, GPay, Lakh); fallback to en-US for Safari devices without en-IN dictation model
      rec.lang = this.speechLang;

      rec.onstart = () => {
        this.ngZone.run(() => {
          this.isRecording = true;
          this.speechError = null;
          this.cdr.detectChanges();
        });
      };

      rec.onresult = (event: any) => {
        this.ngZone.run(() => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          if (!text.trim() && event.results && event.results.length > 0) {
            for (let i = 0; i < event.results.length; ++i) {
              text += event.results[i][0].transcript;
            }
          }
          if (text.trim()) {
            this.rawText = text.trim();
            this.onTextChange(this.rawText);
            this.cdr.detectChanges();
          }
        });
      };

      rec.onerror = (event: any) => {
        this.ngZone.run(() => {
          this.isRecording = false;
          this.recognition = null;
          if (event.error === 'aborted') {
            this.speechError = null;
          } else if (event.error === 'no-speech') {
            if (!this.rawText.trim()) {
              this.speechError = (this.isSafari || this.isIOS)
                ? 'No speech detected. Safari pauses after 2–4s of silence. Tap 🎙️ and speak promptly.'
                : 'No speech detected. Tap 🎙️ to try speaking again.';
            }
          } else if (event.error === 'not-allowed') {
            this.showSafariHelp = true;
            if (this.isStandalone && this.isIOS) {
              this.speechError = 'Microphone permission required for this session. Tap 🎙️ Speak Now directly to allow access, or use Safari for permanent "Always Allow".';
            } else if (this.isSafari || this.isIOS) {
              this.speechError = 'Microphone permission blocked. In Safari: tap "aA" in address bar > Website Settings > Microphone > Allow. Also check iOS Settings > Privacy & Security > Speech Recognition.';
            } else {
              this.speechError = 'Microphone access denied. Please click the lock icon in your address bar and allow microphone permission.';
            }
          } else if (event.error === 'network') {
            if (this.isBrave) {
              this.speechError = 'Brave Browser blocks cloud speech-to-text servers for privacy. Please open in Google Chrome or Microsoft Edge (in your taskbar) for Voice Mode, or type/paste SMS text directly.';
            } else if (this.isSafari || this.isIOS) {
              this.showSafariHelp = true;
              if (this.speechLang === 'en-IN') {
                this.speechLang = 'en-US';
                this.speechError = 'Safari speech service unreachable. Auto-switched to Global English (en-US). Also verify Low Power Mode (yellow battery) is turned OFF in Settings > Battery.';
              } else {
                this.speechError = 'Safari speech unreachable. Check that Low Power Mode is OFF (yellow battery icon) & Settings > General > Keyboard > Enable Dictation is ON.';
              }
            } else {
              this.speechError = 'Speech service unreachable. Ensure you have an active internet connection, or try Chrome/Edge.';
            }
          } else {
            this.speechError = `Voice notice: ${event.error}`;
          }
          this.cdr.detectChanges();
        });
      };

      rec.onend = () => {
        this.ngZone.run(() => {
          this.isRecording = false;
          this.recognition = null;
          if (this.rawText.trim()) {
            this.onTextChange(this.rawText);
          } else if (!this.speechError && (this.isSafari || this.isIOS)) {
            this.speechError = 'Listening ended. Safari pauses after 2–4s of silence. Tap 🎙️ to speak your expense.';
          }
          this.cdr.detectChanges();
        });
      };

      this.recognition = rec;
      // Start synchronously within user gesture
      rec.start();
    } catch (err: any) {
      this.ngZone.run(() => {
        this.isRecording = false;
        this.recognition = null;
        this.speechError = 'Could not start voice input: ' + (err?.message || 'Please tap 🎙️ to try again.');
        this.cdr.detectChanges();
      });
    }
  }

  private stopListeningSession(): void {
    this.cleanupVoiceSession();
    this.ngZone.run(() => {
      this.isRecording = false;
      this.cdr.detectChanges();
    });
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
    this.cleanupVoiceSession();
    this.close.emit();
  }
}
