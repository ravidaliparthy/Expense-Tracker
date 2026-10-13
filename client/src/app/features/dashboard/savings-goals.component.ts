import { Component, EventEmitter, Input, Output, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalsService, SavingsGoal } from '../../core/goals.service';
import { TransactionKind, money } from '../../core/models';
import { sanitizeNotes } from '../../core/sanitize';

export interface SavingsRecordPayload {
  amountCents: number;
  kind: TransactionKind;
  merchant: string;
  notes?: string;
  occurredAt?: string;
  goalId: string;
  goalTitle: string;
}

@Component({
  selector: 'app-savings-goals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card goals-card" data-tour="savings-goals">
      <div class="card-head-flex">
        <div class="head-left">
          <h3>🎯 Savings Goals</h3>
          <span class="count-badge" *ngIf="goals().length">{{ goals().length }} Active</span>
        </div>
        <button type="button" class="btn-new-goal" (click)="openCreateModal()">+ New Goal</button>
      </div>

      <!-- Goals List -->
      <div class="goals-grid" *ngIf="goals().length > 0; else noGoals">
        <div class="goal-item" *ngFor="let g of goals(); trackBy: trackById">
          <div class="goal-top">
            <div class="goal-icon-title">
              <span class="goal-icon">{{ g.icon }}</span>
              <div class="goal-name-wrap">
                <span class="goal-title">{{ g.title }}</span>
                <span class="goal-deadline" *ngIf="g.deadline">
                  {{ isCompleted(g) ? '🎉 Target Reached!' : deadlineLabel(g.deadline) }}
                </span>
              </div>
            </div>
            <div class="goal-pct" [style.color]="g.color">
              {{ calcPct(g) }}%
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="bar-container">
            <div
              class="bar-fill"
              [style.width.%]="calcPct(g)"
              [style.background]="g.color"
            ></div>
          </div>

          <!-- Amounts and Actions -->
          <div class="goal-bottom">
            <div class="goal-amounts">
              <button
                type="button"
                class="saved-click-btn"
                (click)="openRecordModal(g)"
                title="Click amount to record as a transaction in your history"
              >
                <span class="saved-val">{{ money(g.currentCents, currency) }}</span>
                <span class="tx-tag">📝 Mark Tx</span>
              </button>
              <span class="target-val">of {{ money(g.targetCents, currency) }}</span>
            </div>
            <div class="goal-actions">
              <button
                type="button"
                class="btn-deposit"
                (click)="openDepositModal(g)"
                title="Add savings deposit to this goal"
              >
                + Deposit
              </button>
              <button
                type="button"
                class="btn-del"
                (click)="deleteGoal(g.id)"
                title="Delete this goal"
              >
                🗑
              </button>
            </div>
          </div>
        </div>
      </div>

      <ng-template #noGoals>
        <div class="empty-goals">
          <span class="empty-icon">🌱</span>
          <p class="empty-title">Set your first savings goal</p>
          <p class="empty-desc">Track emergency reserves, dream vacations, or gadgets with live progress bars.</p>
          <button type="button" class="btn-primary-mini" (click)="openCreateModal()">+ Create a Goal</button>
        </div>
      </ng-template>
    </div>

    <!-- Create Goal Modal -->
    <div class="modal-overlay" *ngIf="modalOpen()" (click)="closeModal()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <div class="modal-top">
          <h4>🎯 Create Savings Goal</h4>
          <button type="button" class="modal-x" (click)="closeModal()">✕</button>
        </div>
        <form (ngSubmit)="saveGoal()" class="modal-form">
          <div class="form-row">
            <label>Goal Name</label>
            <input
              type="text"
              [(ngModel)]="formTitle"
              name="title"
              placeholder="e.g. New Laptop, Japan Trip, Rainy Day"
              required
              autofocus
            />
          </div>

          <div class="form-row">
            <label>Choose Icon</label>
            <div class="icon-picker">
              <button
                type="button"
                *ngFor="let ic of iconOptions"
                class="ic-btn"
                [class.selected]="formIcon === ic"
                (click)="formIcon = ic"
              >
                {{ ic }}
              </button>
            </div>
          </div>

          <div class="form-columns">
            <div class="form-row">
              <label>Target Amount ({{ currency }})</label>
              <input
                type="number"
                min="1"
                step="any"
                [(ngModel)]="formTarget"
                name="target"
                placeholder="500"
                required
              />
            </div>
            <div class="form-row">
              <label>Initial Saved ({{ currency }})</label>
              <input
                type="number"
                min="0"
                step="any"
                [(ngModel)]="formCurrent"
                name="current"
                placeholder="0"
              />
            </div>
          </div>

          <div class="form-columns">
            <div class="form-row">
              <label>Target Date (Optional)</label>
              <input
                type="date"
                [(ngModel)]="formDeadline"
                name="deadline"
              />
            </div>
            <div class="form-row">
              <label>Color Accent</label>
              <div class="color-picker">
                <button
                  type="button"
                  *ngFor="let c of colorOptions"
                  class="color-dot"
                  [style.background]="c"
                  [class.selected]="formColor === c"
                  (click)="formColor = c"
                ></button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-ghost" (click)="closeModal()">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="!formTitle || formTarget <= 0">Save Goal</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Quick Deposit Modal -->
    <div class="modal-overlay" *ngIf="depositModalOpen()" (click)="closeDepositModal()">
      <div class="modal-box deposit-box" (click)="$event.stopPropagation()">
        <div class="modal-top">
          <h4>💰 Add Deposit to {{ selectedGoal()?.title }}</h4>
          <button type="button" class="modal-x" (click)="closeDepositModal()">✕</button>
        </div>
        <div class="deposit-body">
          <p class="deposit-sub">Choose a quick amount or enter a custom deposit:</p>
          <div class="quick-chips">
            <button type="button" class="chip-btn" (click)="depositAmount = 25">+ 25</button>
            <button type="button" class="chip-btn" (click)="depositAmount = 50">+ 50</button>
            <button type="button" class="chip-btn" (click)="depositAmount = 100">+ 100</button>
            <button type="button" class="chip-btn" (click)="depositAmount = 250">+ 250</button>
          </div>
          <div class="deposit-input-row">
            <span class="cur-label">{{ currency }}</span>
            <input
              type="number"
              min="1"
              step="any"
              [(ngModel)]="depositAmount"
              placeholder="Deposit amount"
            />
          </div>
          <div class="deposit-tx-toggle">
            <label class="tx-checkbox-label">
              <input type="checkbox" [(ngModel)]="alsoRecordDepositAsTx" />
              <span>Also mark this deposit as a transaction in history</span>
            </label>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-ghost" (click)="closeDepositModal()">Cancel</button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="depositAmount <= 0"
              (click)="confirmDeposit()"
            >
              Add {{ money(depositAmount * 100, currency) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Record Savings as Transaction Modal -->
    <div class="modal-overlay" *ngIf="recordModalOpen()" (click)="closeRecordModal()">
      <div class="modal-box record-box" (click)="$event.stopPropagation()">
        <div class="modal-top">
          <div class="modal-head-left">
            <span class="modal-top-emoji">💸</span>
            <div>
              <h4>Record Savings as Transaction</h4>
              <p class="modal-subtext">Mark {{ selectedGoal()?.title }} in your live transactions</p>
            </div>
          </div>
          <button type="button" class="modal-x" (click)="closeRecordModal()">✕</button>
        </div>

        <div class="record-modal-body">
          <div class="goal-card-preview" [style.border-left-color]="selectedGoal()?.color">
            <span class="preview-icon">{{ selectedGoal()?.icon }}</span>
            <div class="preview-text">
              <span class="preview-title">{{ selectedGoal()?.title }}</span>
              <span class="preview-info">
                Current Saved: <strong>{{ money(selectedGoal()?.currentCents || 0, currency) }}</strong>
                of {{ money(selectedGoal()?.targetCents || 0, currency) }} ({{ selectedGoal() ? calcPct(selectedGoal()!) : 0 }}%)
              </span>
            </div>
          </div>

          <div class="form-row">
            <label>Transaction Type</label>
            <div class="kind-segmented">
              <button
                type="button"
                class="kind-btn"
                [class.active]="txKind === 'expense'"
                (click)="txKind = 'expense'"
              >
                🔴 Expense (Transferred to Savings)
              </button>
              <button
                type="button"
                class="kind-btn"
                [class.active]="txKind === 'income'"
                (click)="txKind = 'income'"
              >
                🟢 Income (Savings Withdrawn/Earned)
              </button>
            </div>
          </div>

          <div class="form-columns">
            <div class="form-row">
              <label>Amount ({{ currency }})</label>
              <input
                type="number"
                min="0.01"
                step="any"
                [(ngModel)]="txAmount"
                name="txAmount"
                placeholder="0.00"
                required
              />
            </div>
            <div class="form-row">
              <label>Transaction Date</label>
              <input
                type="date"
                [(ngModel)]="txDate"
                name="txDate"
              />
            </div>
          </div>

          <div class="form-row">
            <label>Merchant / Title</label>
            <input
              type="text"
              [(ngModel)]="txMerchant"
              name="txMerchant"
              placeholder="e.g. Savings: Emergency Fund"
              required
            />
          </div>

          <div class="form-row">
            <label>Notes (Optional)</label>
            <input
              type="text"
              [(ngModel)]="txNotes"
              name="txNotes"
              placeholder="e.g. Monthly contribution to goal"
            />
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-ghost" (click)="closeRecordModal()">Cancel</button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="txAmount <= 0"
              (click)="confirmRecordTransaction()"
            >
              ✓ Mark as Transaction ({{ money(txAmount * 100, currency) }})
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .goals-card {
      margin-bottom: 16px;
      padding: 18px 20px;
    }
    .card-head-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .head-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .head-left h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #1E293B;
    }
    :host-context([data-theme='dark']) .head-left h3 { color: #F1F5F9; }
    .count-badge {
      background: #EEF2FF;
      color: #4F46E5;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
    }
    :host-context([data-theme='dark']) .count-badge {
      background: #312E81;
      color: #A5B4FC;
    }
    .btn-new-goal {
      background: #4F46E5;
      color: #FFFFFF;
      border: none;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-new-goal:hover { background: #4338CA; }

    .goals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 14px;
    }
    .goal-item {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .goal-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
      transform: translateY(-1px);
    }
    :host-context([data-theme='dark']) .goal-item {
      background: #1E293B;
      border-color: #334155;
    }
    .goal-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .goal-icon-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .goal-icon {
      font-size: 24px;
      line-height: 1;
    }
    .goal-name-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .goal-title {
      font-size: 14px;
      font-weight: 700;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .goal-title { color: #F8FAFC; }
    .goal-deadline {
      font-size: 11px;
      color: #64748B;
      font-weight: 500;
    }
    :host-context([data-theme='dark']) .goal-deadline { color: #94A3B8; }
    .goal-pct {
      font-size: 15px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .bar-container {
      width: 100%;
      height: 10px;
      background: #E2E8F0;
      border-radius: 999px;
      overflow: hidden;
    }
    :host-context([data-theme='dark']) .bar-container { background: #334155; }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .goal-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .goal-amounts {
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-size: 13px;
    }
    .saved-click-btn {
      background: transparent;
      border: 1px solid transparent;
      padding: 2px 6px;
      margin: -2px -6px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-family: inherit;
      text-align: left;
    }
    .saved-click-btn:hover {
      background: rgba(79, 70, 229, 0.08);
      border-color: rgba(79, 70, 229, 0.2);
    }
    :host-context([data-theme='dark']) .saved-click-btn:hover {
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.3);
    }
    .saved-val {
      font-weight: 700;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .saved-val { color: #F8FAFC; }
    .tx-tag {
      font-size: 10px;
      font-weight: 700;
      color: #4F46E5;
      background: #EEF2FF;
      border: 1px solid #C7D2FE;
      padding: 1px 5px;
      border-radius: 4px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    :host-context([data-theme='dark']) .tx-tag {
      background: #1E1B4B;
      color: #A5B4FC;
      border-color: #3730A3;
    }
    .saved-click-btn:hover .tx-tag {
      background: #4F46E5;
      color: #FFFFFF;
      border-color: #4338CA;
    }
    :host-context([data-theme='dark']) .saved-click-btn:hover .tx-tag {
      background: #6366F1;
      color: #FFFFFF;
      border-color: #4F46E5;
    }
    .target-val {
      font-size: 12px;
      color: #64748B;
    }
    :host-context([data-theme='dark']) .target-val { color: #94A3B8; }
    .goal-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-deposit {
      background: #EEF2FF;
      color: #4F46E5;
      border: 1px solid #C7D2FE;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-deposit:hover {
      background: #4F46E5;
      color: #FFFFFF;
      border-color: #4F46E5;
    }
    :host-context([data-theme='dark']) .btn-deposit {
      background: #312E81;
      color: #C7D2FE;
      border-color: #4338CA;
    }
    :host-context([data-theme='dark']) .btn-deposit:hover {
      background: #4F46E5;
      color: #FFFFFF;
    }
    .btn-del {
      background: transparent;
      border: none;
      font-size: 13px;
      color: #94A3B8;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    .btn-del:hover {
      color: #EF4444;
      background: rgba(239, 68, 68, 0.08);
    }

    /* Empty state */
    .empty-goals {
      text-align: center;
      padding: 24px 16px;
    }
    .empty-icon { font-size: 32px; display: block; margin-bottom: 6px; }
    .empty-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; color: #1E293B; }
    :host-context([data-theme='dark']) .empty-title { color: #F1F5F9; }
    .empty-desc { font-size: 12px; color: #64748B; margin: 0 auto 12px; max-width: 380px; }
    :host-context([data-theme='dark']) .empty-desc { color: #94A3B8; }
    .btn-primary-mini {
      background: #4F46E5;
      color: #FFF;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Modals */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-box {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    }
    :host-context([data-theme='dark']) .modal-box {
      background: #0F172A;
      border-color: #334155;
    }
    .modal-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }
    .modal-top h4 { margin: 0; font-size: 17px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .modal-top h4 { color: #F8FAFC; }
    .modal-x { background: transparent; border: none; font-size: 16px; color: #64748B; cursor: pointer; }
    .modal-form { display: flex; flex-direction: column; gap: 14px; }
    .form-row { display: flex; flex-direction: column; gap: 6px; }
    .form-row label { font-size: 12px; font-weight: 600; color: #475569; }
    :host-context([data-theme='dark']) .form-row label { color: #CBD5E1; }
    .form-row input {
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 14px;
      outline: none;
      background: #FFFFFF;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .form-row input {
      background: #1E293B;
      border-color: #475569;
      color: #F8FAFC;
    }
    .form-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 480px) {
      .form-columns { grid-template-columns: 1fr; }
    }
    .icon-picker {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ic-btn {
      font-size: 18px;
      padding: 6px 9px;
      border: 1px solid #E2E8F0;
      background: #F8FAFC;
      border-radius: 8px;
      cursor: pointer;
    }
    .ic-btn.selected {
      background: #EEF2FF;
      border-color: #6366F1;
      transform: scale(1.1);
    }
    :host-context([data-theme='dark']) .ic-btn {
      background: #1E293B;
      border-color: #334155;
    }
    .color-picker {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 38px;
    }
    .color-dot {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      border: 2px solid transparent;
      cursor: pointer;
    }
    .color-dot.selected {
      border-color: #0F172A;
      transform: scale(1.15);
    }
    :host-context([data-theme='dark']) .color-dot.selected { border-color: #FFFFFF; }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 8px;
    }

    /* Deposit modal specific */
    .deposit-box { max-width: 400px; }
    .deposit-sub { font-size: 13px; color: #64748B; margin: 0 0 12px; }
    :host-context([data-theme='dark']) .deposit-sub { color: #94A3B8; }
    .quick-chips { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .chip-btn {
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      cursor: pointer;
    }
    .chip-btn:hover { background: #E2E8F0; }
    :host-context([data-theme='dark']) .chip-btn {
      background: #1E293B;
      border-color: #475569;
      color: #CBD5E1;
    }
    .deposit-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .cur-label { font-size: 14px; font-weight: 700; color: #64748B; }
    .deposit-input-row input {
      flex: 1;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 16px;
      font-weight: 700;
      background: #FFFFFF;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .deposit-input-row input {
      background: #1E293B;
      border-color: #475569;
      color: #F8FAFC;
    }
    .modal-head-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .modal-top-emoji { font-size: 22px; }
    .modal-subtext {
      margin: 2px 0 0;
      font-size: 11px;
      color: #64748B;
    }
    :host-context([data-theme='dark']) .modal-subtext { color: #94A3B8; }
    .record-modal-body {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .goal-card-preview {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-left-width: 4px;
      border-radius: 8px;
      padding: 10px 14px;
    }
    :host-context([data-theme='dark']) .goal-card-preview {
      background: #1E293B;
      border-color: #334155;
    }
    .preview-icon { font-size: 24px; }
    .preview-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .preview-title {
      font-size: 13px;
      font-weight: 700;
      color: #0F172A;
    }
    :host-context([data-theme='dark']) .preview-title { color: #F8FAFC; }
    .preview-info {
      font-size: 11px;
      color: #64748B;
    }
    :host-context([data-theme='dark']) .preview-info { color: #94A3B8; }
    .kind-segmented {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .kind-btn {
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      background: #F8FAFC;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      color: #475569;
    }
    :host-context([data-theme='dark']) .kind-btn {
      background: #1E293B;
      border-color: #334155;
      color: #94A3B8;
    }
    .kind-btn.active {
      background: #EEF2FF;
      border-color: #6366F1;
      color: #4F46E5;
      box-shadow: 0 0 0 1px #6366F1;
    }
    :host-context([data-theme='dark']) .kind-btn.active {
      background: #312E81;
      border-color: #818CF8;
      color: #E0E7FF;
      box-shadow: 0 0 0 1px #818CF8;
    }
    .deposit-tx-toggle {
      margin: 4px 0 12px;
      padding: 10px 12px;
      background: #F1F5F9;
      border-radius: 8px;
      border: 1px solid #E2E8F0;
    }
    :host-context([data-theme='dark']) .deposit-tx-toggle {
      background: #1E293B;
      border-color: #334155;
    }
    .tx-checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
    }
    :host-context([data-theme='dark']) .tx-checkbox-label { color: #E2E8F0; }
  `]
})
export class SavingsGoalsComponent {
  @Input() currency = 'USD';
  @Output() recordTransaction = new EventEmitter<SavingsRecordPayload>();

  private readonly goalsService = inject(GoalsService);
  readonly goals = this.goalsService.goals;
  readonly money = money;

  readonly trackById = (_: number, g: SavingsGoal): string => g.id;

  readonly modalOpen = signal(false);
  readonly depositModalOpen = signal(false);
  readonly recordModalOpen = signal(false);
  readonly selectedGoal = signal<SavingsGoal | null>(null);

  constructor() {
    effect(() => {
      if (this.goalsService.createModalRequested()) {
        this.openCreateModal();
        this.goalsService.createModalRequested.set(false);
      }
    }, { allowSignalWrites: true });
  }

  formTitle = '';
  formIcon = '🛡️';
  formTarget = 500;
  formCurrent = 0;
  formDeadline = '';
  formColor = '#10B981';
  depositAmount = 50;
  alsoRecordDepositAsTx = true;

  // Transaction form fields
  txKind: TransactionKind = 'expense';
  txAmount = 50;
  txMerchant = '';
  txNotes = '';
  txDate = '';

  readonly iconOptions = ['🛡️', '🏖️', '💻', '🚗', '🏠', '🎓', '💍', '📈', '🎁', '✈️'];
  readonly colorOptions = ['#10B981', '#6366F1', '#EC4899', '#F59E0B', '#06B6D4', '#8B5CF6'];

  calcPct(g: SavingsGoal): number {
    if (g.targetCents <= 0) return 100;
    const pct = Math.round((g.currentCents / g.targetCents) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  isCompleted(g: SavingsGoal): boolean {
    return g.currentCents >= g.targetCents;
  }

  deadlineLabel(dateStr: string): string {
    const target = new Date(dateStr + 'T00:00:00Z');
    const today = new Date();
    const diffMs = target.getTime() - today.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Passed deadline';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `${days} days left`;
  }

  openCreateModal(): void {
    this.formTitle = '';
    this.formIcon = '🎯';
    this.formTarget = 500;
    this.formCurrent = 0;
    this.formDeadline = '';
    this.formColor = '#10B981';
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  saveGoal(): void {
    if (!this.formTitle.trim() || this.formTarget <= 0) return;
    this.goalsService.addGoal({
      title: this.formTitle.trim(),
      icon: this.formIcon,
      targetCents: Math.round(this.formTarget * 100),
      currentCents: Math.round((this.formCurrent || 0) * 100),
      deadline: this.formDeadline || undefined,
      color: this.formColor
    });
    this.closeModal();
  }

  openDepositModal(g: SavingsGoal): void {
    this.selectedGoal.set(g);
    this.depositAmount = 50;
    this.alsoRecordDepositAsTx = true;
    this.depositModalOpen.set(true);
  }

  closeDepositModal(): void {
    this.depositModalOpen.set(false);
    this.selectedGoal.set(null);
  }

  confirmDeposit(): void {
    const g = this.selectedGoal();
    if (!g || this.depositAmount <= 0) return;
    const cents = Math.round(this.depositAmount * 100);
    this.goalsService.deposit(g.id, cents);
    if (this.alsoRecordDepositAsTx) {
      this.recordTransaction.emit({
        amountCents: cents,
        kind: 'expense',
        merchant: `Savings Deposit: ${g.title}`,
        notes: `Quick deposit added to goal "${g.title}".`,
        occurredAt: new Date().toISOString(),
        goalId: g.id,
        goalTitle: g.title
      });
    }
    this.closeDepositModal();
  }

  openRecordModal(g: SavingsGoal): void {
    this.selectedGoal.set(g);
    this.txKind = 'expense';
    this.txAmount = g.currentCents > 0 ? (g.currentCents / 100) : 50;
    this.txMerchant = `Savings: ${g.title}`;
    this.txNotes = `Recorded from Savings Goal "${g.title}" (${this.calcPct(g)}% reached)`;
    this.txDate = new Date().toISOString().slice(0, 10);
    this.recordModalOpen.set(true);
  }

  closeRecordModal(): void {
    this.recordModalOpen.set(false);
    this.selectedGoal.set(null);
  }

  confirmRecordTransaction(): void {
    const g = this.selectedGoal();
    if (!g || this.txAmount <= 0) return;
    this.recordTransaction.emit({
      amountCents: Math.round(this.txAmount * 100),
      kind: this.txKind,
      merchant: this.txMerchant.trim() || `Savings: ${g.title}`,
      notes: sanitizeNotes(this.txNotes) || undefined,
      occurredAt: this.txDate ? new Date(this.txDate + 'T12:00:00Z').toISOString() : new Date().toISOString(),
      goalId: g.id,
      goalTitle: g.title
    });
    this.closeRecordModal();
  }

  deleteGoal(id: string): void {
    if (confirm('Delete this savings goal?')) {
      this.goalsService.deleteGoal(id);
    }
  }
}
