import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Expense, money } from '../../core/models';

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
                <th>Merchant / Source</th>
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
    .head h3 { margin-bottom:8px; }
    .legend { font-size:11px; color:#94A3B8; }
    .tbl-wrap { overflow-x:auto; }
    .mono { font-variant-numeric:tabular-nums; color:#475569; white-space:nowrap; }
    .notes { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#64748B; }
    .actions-head { text-align:right; width:80px; }
    .actions { white-space:nowrap; text-align:right; }
    .icon {
      background:#F1F5F9;
      border:1px solid #CBD5E1;
      border-radius:6px;
      cursor:pointer;
      padding:4px 8px;
      font-size:13px;
      margin-left:4px;
      transition: background-color 0.05s ease, border-color 0.05s ease, color 0.05s ease;
      user-select: none;
    }
    .icon:hover { opacity:1; background:#E2E8F0; }
    .icon.danger:hover { color:#DC2626; border-color:#FECACA; background:#FEF2F2; }
    .empty { color:#94A3B8; text-align:center; padding:24px 0; }
    .kind { font-size:11px; border-radius:999px; padding:3px 8px; background:#FEE2E2; color:#B91C1C; }
    .kind.income { background:#DCFCE7; color:#047857; }
    .amount.plus { color:#047857; }
    .amount.minus { color:#DC2626; }
    tr.income { background:#F0FDF4; }
  `]
})
export class ExpenseTableComponent {
  @Input({ required: true }) expenses: Expense[] = [];
  @Input() total = 0;
  @Output() edit = new EventEmitter<Expense>();
  @Output() remove = new EventEmitter<Expense>();
  readonly money = money;

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
