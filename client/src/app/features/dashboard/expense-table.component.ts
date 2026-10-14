import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Expense, money, paymentSourceLabel } from '../../core/models';

@Component({
  selector: 'app-expense-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="head">
        <h3>Transactions ({{ total }})</h3>
        <div class="legend">Showing {{ expenses.length }} of {{ total }}</div>
      </div>
      <ng-container *ngIf="expenses.length === 0; else tableTpl">
        <p class="empty">No transactions match the current filters.</p>
      </ng-container>
      <ng-template #tableTpl>
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Merchant</th>
                <th>Payment Source</th>
                <th class="notes">Notes</th>
                <th class="amount">Amount</th>
                <th class="actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of expenses" [class.income]="e.kind === 'income'">
                <td class="mono">{{ e.localDate }}</td>
                <td><span class="kind" [class.income]="e.kind === 'income'">{{ e.kind === 'income' ? 'Credit' : 'Expense' }}</span></td>
                <td><span class="chip" [style.background]="hex(e.categoryColor, .14)" [style.color]="e.categoryColor">{{ e.categoryIcon || '🏷️' }} {{ e.categorySnapshot }}</span></td>
                <td>{{ e.merchant || '—' }}</td>
                <td><span class="source-chip">{{ paymentSourceLabel(e.source) }}</span></td>
                <td class="notes" [title]="e.notes || ''">{{ e.notes || '—' }}</td>
                <td class="amount" [class.plus]="e.kind === 'income'" [class.minus]="e.kind !== 'income'">{{ e.kind === 'income' ? '+' : '-' }}{{ money(e.amountCents, e.currency) }}</td>
                <td class="actions">
                  <button type="button" class="icon" title="Edit" (click)="onEdit($event, e)">✎</button>
                  <button type="button" class="icon danger" title="Delete" (click)="onRemove($event, e)">🗑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:baseline; }
    .head h3 { margin-bottom:8px; font-family:'Plus Jakarta Sans', sans-serif; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#475569; }
    :host-context([data-theme='dark']) .head h3 { color:#94A3B8; }
    .legend { font-size:11px; color:#94A3B8; }
    .tbl-wrap { overflow-x:auto; border-radius:10px; }
    table { width:100%; border-collapse:separate; border-spacing:0; }
    tbody tr {
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease, box-shadow 0.2s ease;
      cursor: pointer;
    }
    tbody td {
      padding: 10px 8px;
      border-bottom: 1px solid #F1F5F9;
      vertical-align: middle;
      transition: color 0.15s ease;
    }
    tbody tr:hover {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.05) 0%, rgba(99, 102, 241, 0.01) 100%) !important;
      transform: translateX(4px);
      box-shadow: inset 3.5px 0 0 #6366F1, 0 4px 12px rgba(15, 23, 42, 0.04);
    }
    :host-context([data-theme='dark']) tbody td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #CBD5E1;
    }
    :host-context([data-theme='dark']) tbody tr:hover {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.04) 65%, transparent 100%) !important;
      transform: translateX(4px);
      box-shadow: inset 3.5px 0 0 #6366F1, 0 6px 16px rgba(0, 0, 0, 0.35);
    }
    .mono { font-family: 'JetBrains Mono', 'Plus Jakarta Sans', monospace; font-variant-numeric:tabular-nums; color:#64748B; white-space:nowrap; font-size:12.5px; }
    :host-context([data-theme='dark']) .mono { color:#94A3B8; }
    .notes { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#64748B; }
    :host-context([data-theme='dark']) .notes { color:#94A3B8; }
    .actions-head { text-align:right; width:80px; }
    .actions { white-space:nowrap; text-align:right; }
    .icon {
      background:#F1F5F9;
      border:1px solid #CBD5E1;
      border-radius:6px;
      cursor:pointer;
      padding:4px 8px;
      font-size:12px;
      margin-left:4px;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .icon:hover { transform: scale(1.15); background:#E2E8F0; }
    .icon.danger:hover { color:#DC2626; border-color:#FECACA; background:#FEF2F2; box-shadow:0 2px 8px rgba(220, 38, 38, 0.2); }
    :host-context([data-theme='dark']) .icon {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.08);
      color: #CBD5E1;
    }
    :host-context([data-theme='dark']) .icon:hover {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366F1;
      color: #A5B4FC;
    }
    :host-context([data-theme='dark']) .icon.danger:hover {
      background: rgba(244, 63, 94, 0.25);
      border-color: #F43F5E;
      color: #FDA4AF;
    }
    .empty { color:#94A3B8; text-align:center; padding:24px 0; }
    .kind { font-size:11px; border-radius:999px; padding:3px 8px; background:#FEE2E2; color:#B91C1C; }
    .kind.income { background:#DCFCE7; color:#047857; }
    .amount {
      font-family: 'JetBrains Mono', 'Plus Jakarta Sans', monospace;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 13.5px;
      transition: transform 0.18s ease;
    }
    tbody tr:hover .amount { transform: scale(1.03); }
    .amount.plus { color:#047857; }
    .amount.minus { color:#DC2626; }
    :host-context([data-theme='dark']) .amount.plus { color:#34D399; }
    :host-context([data-theme='dark']) .amount.minus { color:#FB7185; }
    tr.income { background:#F0FDF4; }
    :host-context([data-theme='dark']) tr.income { background: rgba(34, 197, 94, 0.08); }
  `]
})
export class ExpenseTableComponent {
  @Input({ required: true }) expenses: Expense[] = [];
  @Input() total = 0;
  @Output() edit = new EventEmitter<Expense>();
  @Output() remove = new EventEmitter<Expense>();
  readonly money = money;
  readonly paymentSourceLabel = paymentSourceLabel;

  onEdit(event: MouseEvent, e: Expense): void {
    event.stopPropagation();
    this.edit.emit(e);
  }

  onRemove(event: MouseEvent, e: Expense): void {
    event.stopPropagation();
    this.remove.emit(e);
  }

  hex(color: string, alpha: number): string {
    const c = color && color.startsWith('#') ? color : '#64748B';
    const r = parseInt(c.slice(1, 3), 16) || 100;
    const g = parseInt(c.slice(3, 5), 16) || 116;
    const b = parseInt(c.slice(5, 7), 16) || 139;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
