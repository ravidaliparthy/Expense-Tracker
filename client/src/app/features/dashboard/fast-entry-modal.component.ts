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
              <p class="subtitle">Smart SMS/UPI parser & hands-free voice dictation</p>
            </div>
          </div>
          <button type="button" class="btn-close" (click)="close.emit()" title="Close">✕</button>
        </div>

        <div class="modal-body">
          <!-- Text Input / SMS Paste & Voice Area -->
          <div class="input-wrap">
            <div class="input-header-bar">
              <label class="input-title">Paste Transaction SMS / UPI Text, or Speak:</label>
              <div class="voice-actions-strip">
                <button
                  type="button"
                  class="voice-action-btn primary-voice"
                  [class.recording]="isRecording"
                  (click)="toggleVoice()"
                  [title]="isRecording ? 'Click to stop listening' : 'Start speaking your expense'"
                >
                  <span class="mic-dot" *ngIf="isRecording"></span>
                  <span>{{ isRecording ? '⏹ Stop' : '🎙️ Speak Now' }}</span>
                </button>
                <button
                  *ngIf="isSafari || isIOS"
                  type="button"
                  class="voice-action-btn tip-btn"
                  (click)="showSafariHelp = !showSafariHelp"
                  title="View 2 instant iPhone voice methods"
                >
                  💡 iPhone Tips
                </button>
                <button
                  *ngIf="isSafari || isIOS"
                  type="button"
                  class="voice-action-btn lang-btn"
                  (click)="toggleLanguage()"
                  [title]="'Speech language: ' + (speechLang === 'en-IN' ? 'Indian English' : 'Global English (US)')"
                >
                  <span>{{ speechLang === 'en-IN' ? '🇮🇳 IN' : '🌐 US' }}</span>
                </button>
              </div>
            </div>
            <textarea
              [(ngModel)]="rawText"
              (ngModelChange)="onTextChange($event)"
              rows="3"
              class="sms-textarea"
              [class.listening]="isRecording"
              placeholder="e.g. 'Paid Rs 450 to Swiggy via GPay for Travel' or tap 🎙️ Speak Now"
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

            <!-- Voice Notice / Error Banner (Only for genuine speech failure) -->
            <div *ngIf="speechError && !speechError.startsWith('iPhone tip')" class="voice-error-banner">
              <span>⚠️ {{ speechError }}</span>
              <button type="button" class="btn-dismiss" (click)="speechError = null">✕</button>
            </div>

            <!-- Sleek iOS 2-Method Voice Shortcuts Card -->
            <div *ngIf="showSafariHelp" class="ios-voice-card">
              <div class="ios-card-head">
                <span class="ios-card-title">🎙️ 2 Real Ways to Speak on iPhone (Zero Errors)</span>
                <button type="button" class="btn-dismiss" (click)="showSafariHelp = false">✕</button>
              </div>

              <div class="ios-methods-grid">
                <!-- Method 1: Keyboard Mic -->
                <div class="ios-method-box highlight">
                  <div class="method-badge">✨ Recommended • Zero Permissions</div>
                  <div class="method-body">
                    <span class="method-icon">⌨️</span>
                    <div class="method-text">
                      <strong>1. Tap the 🎙️ mic on your iPhone keyboard</strong>
                      <p>Tap inside the text box above, then tap the 🎙️ microphone icon on your iPhone keyboard (bottom right, next to space). Speak naturally (e.g. <em>"Paid 450 to Swiggy via GPay"</em>)—text transcribes instantly!</p>
                    </div>
                  </div>
                </div>

                <!-- Method 2: Safari Always Allow -->
                <div class="ios-method-box">
                  <div class="method-badge permanent">🔒 Permanent Safari Mode</div>
                  <div class="method-body">
                    <span class="method-icon">🌐</span>
                    <div class="method-text">
                      <strong>2. Safari with "Always Allow"</strong>
                      <p>In Safari: tap <strong>aA</strong> in the address bar → <strong>Website Settings</strong> → set <strong>Microphone</strong> to <strong>Allow</strong>. The in-app 🎙️ Voice Mode will work permanently without asking again!</p>
                      <a *ngIf="isStandalone" href="https://expense-tracker-ochre-eight-80.vercel.app/" target="_blank" rel="noopener" class="btn-safari-ext">
                        Open in Safari for Permanent Mode ↗
                      </a>
                    </div>
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
                  <button type="button" class="kind-btn" [class.active]="parsed.kind === 'expense'" [class.expense]="parsed.kind === 'expense'" (click)="parsed.kind = 'expense'">🔴 Expense</button>
                  <button type="button" class="kind-btn" [class.active]="parsed.kind === 'income'" [class.income]="parsed.kind === 'income'" (click)="parsed.kind = 'income'">🟢 Income</button>
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
            ✓ Log Transaction ({{ (parsed && parsed.amount > 0) ? money(parsed.amount * 100, currency) : money(0, currency) }})
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 10000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      animation: overlayFadeIn 0.2s ease-out;
    }
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .modal-box {
      background: #FFFFFF; border-radius: 18px; width: 100%; max-width: 580px;
      max-height: 88vh; display: flex; flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      border: 1px solid #E2E8F0; overflow: hidden;
      animation: modalScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalScaleIn {
      from { opacity: 0; transform: scale(0.96) translateY(6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    :host-context([data-theme='dark']) .modal-box {
      background: #0F172A; border-color: rgba(255, 255, 255, 0.1); color: #F8FAFC;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    .modal-header {
      padding: 14px 18px; border-bottom: 1px solid #E2E8F0;
      display: flex; justify-content: space-between; align-items: center;
    }
    :host-context([data-theme='dark']) .modal-header { border-bottom-color: rgba(255, 255, 255, 0.08); }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .emoji-icon { font-size: 22px; }
    .header-left h3 { margin: 0; font-size: 15.5px; font-weight: 700; letter-spacing: -0.2px; }
    .subtitle { margin: 2px 0 0; font-size: 11.5px; color: #64748B; }
    :host-context([data-theme='dark']) .subtitle { color: #94A3B8; }
    .btn-close {
      background: none; border: none; font-size: 18px; color: #64748B; cursor: pointer;
      width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .btn-close:hover { background: rgba(148, 163, 184, 0.15); color: #0F172A; }
    :host-context([data-theme='dark']) .btn-close:hover { color: #FFFFFF; background: rgba(255, 255, 255, 0.1); }

    /* Voice Actions Strip */
    .input-header-bar {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px;
    }
    .input-title {
      font-size: 12px; font-weight: 600; color: #475569;
    }
    :host-context([data-theme='dark']) .input-title { color: #CBD5E1; }
    .voice-actions-strip {
      display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
    }
    .voice-action-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
      user-select: none; border: 1px solid transparent; box-sizing: border-box;
    }
    .voice-action-btn:active { transform: scale(0.97); }
    .voice-action-btn.primary-voice {
      background: #EEF2FF; border-color: #C7D2FE; color: #4F46E5;
    }
    :host-context([data-theme='dark']) .voice-action-btn.primary-voice {
      background: #1E1B4B; border-color: #4338CA; color: #C7D2FE;
    }
    .voice-action-btn.primary-voice:hover {
      background: #E0E7FF; border-color: #818CF8;
    }
    .voice-action-btn.primary-voice.recording {
      background: #FEE2E2 !important; border-color: #F87171 !important; color: #DC2626 !important;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); animation: mic-pulse 1.6s infinite;
    }
    :host-context([data-theme='dark']) .voice-action-btn.primary-voice.recording {
      background: #450A0A !important; border-color: #B91C1C !important; color: #FCA5A5 !important;
    }
    .voice-action-btn.tip-btn {
      background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.22);
      color: #4F46E5; font-size: 11.5px; padding: 6px 10px;
    }
    :host-context([data-theme='dark']) .voice-action-btn.tip-btn {
      background: rgba(99, 102, 241, 0.18); border-color: rgba(165, 180, 252, 0.3); color: #A5B4FC;
    }
    .voice-action-btn.tip-btn:hover { background: rgba(99, 102, 241, 0.16); }
    :host-context([data-theme='dark']) .voice-action-btn.tip-btn:hover { background: rgba(99, 102, 241, 0.28); }
    .voice-action-btn.lang-btn {
      background: #F1F5F9; border-color: #CBD5E1; color: #475569;
      font-size: 11.5px; padding: 6px 10px;
    }
    :host-context([data-theme='dark']) .voice-action-btn.lang-btn {
      background: #1E293B; border-color: #475569; color: #CBD5E1;
    }
    .voice-action-btn.lang-btn:hover { background: #E2E8F0; color: #1E293B; }
    :host-context([data-theme='dark']) .voice-action-btn.lang-btn:hover { background: #334155; color: #F8FAFC; }
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

    .modal-body {
      padding: 16px 18px; overflow-y: auto; -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain; display: flex; flex-direction: column; gap: 14px; flex: 1 1 auto;
    }
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

    .ios-tip-pill {
      background: #EEF2FF; border: 1px solid #C7D2FE; color: #4F46E5;
      padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
      cursor: pointer; transition: all 0.2s ease;
    }
    :host-context([data-theme='dark']) .ios-tip-pill {
      background: #1E1B4B; border-color: #4338CA; color: #C7D2FE;
    }
    .ios-tip-pill:hover { background: #E0E7FF; }

    .ios-voice-card {
      margin-top: 8px; padding: 12px; border-radius: 12px;
      background: linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%);
      border: 1px solid #C7D2FE; display: flex; flex-direction: column; gap: 10px;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.08);
    }
    :host-context([data-theme='dark']) .ios-voice-card {
      background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%);
      border-color: #4338CA;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    .ios-card-head {
      display: flex; justify-content: space-between; align-items: center;
    }
    .ios-card-title {
      font-size: 12px; font-weight: 800; color: #3730A3; letter-spacing: -0.2px;
    }
    :host-context([data-theme='dark']) .ios-card-title { color: #E0E7FF; }
    .ios-methods-grid {
      display: flex; flex-direction: column; gap: 8px;
    }
    .ios-method-box {
      background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
      transition: all 0.2s ease;
    }
    :host-context([data-theme='dark']) .ios-method-box {
      background: #111827; border-color: #374151;
    }
    .ios-method-box.highlight {
      border-color: #818CF8; background: #FAF5FF;
    }
    :host-context([data-theme='dark']) .ios-method-box.highlight {
      background: #1F1535; border-color: #6366F1;
    }
    .method-badge {
      display: inline-flex; align-self: flex-start; align-items: center;
      padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800;
      background: #EDE9FE; color: #6D28D9; text-transform: uppercase; letter-spacing: 0.3px;
    }
    :host-context([data-theme='dark']) .method-badge {
      background: #4C1D95; color: #DDD6FE;
    }
    .method-badge.permanent {
      background: #DCFCE7; color: #15803D;
    }
    :host-context([data-theme='dark']) .method-badge.permanent {
      background: #14532D; color: #86EFAC;
    }
    .method-body {
      display: flex; align-items: flex-start; gap: 10px;
    }
    .method-icon {
      font-size: 20px; flex-shrink: 0; line-height: 1.2;
    }
    .method-text {
      flex: 1; font-size: 11.5px; line-height: 1.4; color: #475569;
    }
    :host-context([data-theme='dark']) .method-text { color: #CBD5E1; }
    .method-text strong {
      display: block; font-size: 12px; color: #0F172A; margin-bottom: 2px;
    }
    :host-context([data-theme='dark']) .method-text strong { color: #F8FAFC; }
    .method-text p { margin: 0; }
    .btn-safari-ext {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 5px 11px; border-radius: 7px; font-size: 11px; font-weight: 700;
      background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;
      text-decoration: none; margin-top: 6px; cursor: pointer; transition: all 0.2s ease;
    }
    :host-context([data-theme='dark']) .btn-safari-ext {
      background: #312E81; color: #C7D2FE; border-color: #4338CA;
    }
    .btn-safari-ext:hover { background: #E0E7FF; }
    .btn-dismiss { background: none; border: none; cursor: pointer; color: inherit; font-size: 12px; }

    .sample-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
    .sample-label { font-size: 11.5px; color: #64748B; font-weight: 600; }
    .chip {
      background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;
      padding: 5px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease;
    }
    .chip:hover { transform: translateY(-1px); }
    .chip:active { transform: scale(0.96); }
    :host-context([data-theme='dark']) .chip {
      background: #1E1B4B; color: #A5B4FC; border-color: #4338CA;
    }
    :host-context([data-theme='dark']) .chip:hover { background: #312E81; }

    .parsed-card {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 12px;
    }
    :host-context([data-theme='dark']) .parsed-card {
      background: #1E293B; border-color: #334155;
    }
    .card-head { display: flex; justify-content: space-between; align-items: center; }
    .parsed-status { font-size: 11.5px; font-weight: 700; color: #10B981; }
    .amt-highlight { font-size: 18px; font-weight: 800; color: #EF4444; font-variant-numeric: tabular-nums; }
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
    .kind-group {
      display: flex; gap: 4px; background: #F1F5F9; padding: 3px; border-radius: 8px; border: 1px solid #CBD5E1;
    }
    :host-context([data-theme='dark']) .kind-group {
      background: #0B1220; border-color: #334155;
    }
    .kind-btn {
      flex: 1; padding: 7px 10px; border: none; border-radius: 6px; background: transparent;
      font-size: 12px; font-weight: 600; cursor: pointer; color: #64748B;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      transition: all 0.15s ease;
    }
    :host-context([data-theme='dark']) .kind-btn { color: #94A3B8; }
    .kind-btn.active.expense {
      background: #DC2626 !important; color: #FFFFFF !important;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
    }
    .kind-btn.active.income {
      background: #059669 !important; color: #FFFFFF !important;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.4);
    }
    .kind-btn:active { transform: scale(0.97); }

    .modal-footer {
      padding: 14px 20px; border-top: 1px solid #E2E8F0;
      display: flex; justify-content: flex-end; gap: 10px;
      background: #FFFFFF; position: sticky; bottom: 0; z-index: 10;
    }
    :host-context([data-theme='dark']) .modal-footer {
      background: #0F172A; border-top-color: rgba(255, 255, 255, 0.08);
    }
    .btn-ghost {
      background: transparent; border: 1px solid #CBD5E1; padding: 8px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; color: #475569;
    }
    .btn-ghost:hover { background: #F8FAFC; color: #0F172A; }
    :host-context([data-theme='dark']) .btn-ghost { border-color: #475569; color: #E2E8F0; }
    :host-context([data-theme='dark']) .btn-ghost:hover { background: #1E293B; }
    .btn-primary {
      background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
      color: #FFFFFF; border: none; padding: 8px 18px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
      transition: all 0.15s ease;
    }
    .btn-primary:hover {
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);
      transform: translateY(-1px);
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-ghost:active, .btn-primary:active { transform: scale(0.98); }

    @media (max-width: 540px) {
      .overlay { padding: 8px; align-items: flex-end; }
      .modal-box {
        max-height: 88dvh;
        border-radius: 18px 18px 12px 12px;
      }
      .modal-header { padding: 12px 16px; }
      .modal-body { padding: 12px 16px; gap: 12px; }
      .modal-footer {
        padding: 10px 14px max(14px, env(safe-area-inset-bottom));
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 8px;
      }
      .modal-footer .btn-ghost,
      .modal-footer .btn-primary {
        width: 100%;
        text-align: center;
        justify-content: center;
        padding: 10px 12px;
      }
      .header-left h3 { font-size: 14.5px; }
      .subtitle { font-size: 11px; }
      .amt-highlight { font-size: 17px; }
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
      if (!this.isStandalone || !this.isIOS) {
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
            if (this.isSafari || this.isIOS) {
              this.speechError = 'Microphone permission needed. Tap inside the box & use the 🎙️ mic on your iPhone keyboard (next to space bar), or set Safari to "Always Allow"!';
            } else {
              this.speechError = 'Microphone access denied. Please click the lock icon in your address bar and allow microphone permission.';
            }
          } else if (event.error === 'network') {
            if (this.isBrave) {
              this.speechError = 'Brave Browser blocks cloud speech-to-text servers for privacy. Please open in Google Chrome or Microsoft Edge (in your taskbar) for Voice Mode, or type/paste SMS text directly.';
            } else if (this.isSafari || this.isIOS) {
              this.showSafariHelp = true;
              this.speechError = 'Voice service paused. Tap inside the box & use the 🎙️ mic on your iPhone keyboard (next to space bar) for 100% instant voice!';
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
