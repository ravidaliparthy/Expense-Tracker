import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Expense, Insights, money, signedMoney } from '../../core/models';
import { SummaryDto } from '../../core/api.service';

@Component({
  selector: 'app-cash-flow-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card cashflow-card" data-tour="cash-flow-view">
      <div class="cf-header">
        <div class="cf-title-wrap">
          <span class="cf-icon">🌊</span>
          <div>
            <h3>Cash-Flow & Month-End Forecast</h3>
            <span class="cf-sub">Inflow vs Outflow, 50/30/20 Budgeting, and Extrapolated Projections</span>
          </div>
        </div>
      </div>

      <!-- Cash Flow High-Level Grid -->
      <div class="cf-kpi-grid">
        <div class="kpi-box inflow">
          <span class="kpi-lbl">Total Inflow (Income)</span>
          <span class="kpi-val">{{ money(incomeCents, currency) }}</span>
          <span class="kpi-sub">Money In</span>
        </div>

        <div class="kpi-box outflow">
          <span class="kpi-lbl">Total Outflow (Spending)</span>
          <span class="kpi-val">{{ money(expenseCents, currency) }}</span>
          <span class="kpi-sub">Money Out</span>
        </div>

        <div class="kpi-box net" [class.positive]="netCents >= 0" [class.negative]="netCents < 0">
          <span class="kpi-lbl">Net Cash-Flow</span>
          <span class="kpi-val">{{ signedMoney(netCents, currency) }}</span>
          <span class="kpi-sub">{{ netCents >= 0 ? 'Surplus Saved' : 'Deficit / Burning Reserves' }}</span>
        </div>

        <div class="kpi-box projected">
          <span class="kpi-lbl">Projected Month-End</span>
          <span class="kpi-val">{{ money(projectedMonthEndCents(), currency) }}</span>
          <span class="kpi-sub">At current daily burn rate</span>
        </div>
      </div>

      <!-- Inflow vs Outflow Ratio Bar -->
      <div class="cf-bar-section" *ngIf="incomeCents > 0 || expenseCents > 0">
        <div class="bar-labels">
          <span>Inflow: {{ incomeShare() }}%</span>
          <span>Outflow: {{ expenseShare() }}%</span>
        </div>
        <div class="multi-bar">
          <div class="bar-part inflow-bar" [style.width.%]="incomeShare()"></div>
          <div class="bar-part outflow-bar" [style.width.%]="expenseShare()"></div>
        </div>
      </div>

      <!-- 50/30/20 Rule Insights (Needs vs Wants vs Savings) -->
      <div class="rules-section">
        <div class="sec-title">
          <span>⚖️ 50/30/20 Rule Breakdown</span>
          <span class="sec-hint">Needs (50%) • Wants (30%) • Savings (20%)</span>
        </div>

        <div class="rules-grid">
          <div class="rule-card need">
            <div class="rule-top">
              <span class="rule-name">🎯 Needs (Essentials)</span>
              <span class="rule-pct">{{ needPct() }}%</span>
            </div>
            <div class="rule-bar-wrap">
              <div class="rule-fill need-fill" [style.width.%]="needPct()"></div>
            </div>
            <span class="rule-val">{{ money(needCents(), currency) }}</span>
          </div>

          <div class="rule-card want">
            <div class="rule-top">
              <span class="rule-name">✨ Wants (Lifestyle)</span>
              <span class="rule-pct">{{ wantPct() }}%</span>
            </div>
            <div class="rule-bar-wrap">
              <div class="rule-fill want-fill" [style.width.%]="wantPct()"></div>
            </div>
            <span class="rule-val">{{ money(wantCents(), currency) }}</span>
          </div>

          <div class="rule-card saving">
            <div class="rule-top">
              <span class="rule-name">💎 Savings (Future)</span>
              <span class="rule-pct">{{ savingPct() }}%</span>
            </div>
            <div class="rule-bar-wrap">
              <div class="rule-fill saving-fill" [style.width.%]="savingPct()"></div>
            </div>
            <span class="rule-val">{{ money(savingCents(), currency) }}</span>
          </div>
        </div>
      </div>

      <!-- MoM Category Insights Comparison -->
      <div class="comparison-pills-row" *ngIf="comparisonPills().length > 0">
        <span class="comp-label">📈 Period Trends:</span>
        <div class="pills-wrap">
          <span class="comp-pill" *ngFor="let p of comparisonPills()" [class.up]="p.isUp" [class.down]="!p.isUp">
            {{ p.icon }} {{ p.name }} is {{ p.deltaText }}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cashflow-card { margin-bottom: 16px; padding: 18px 20px; }
    .cf-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .cf-title-wrap { display: flex; align-items: center; gap: 10px; }
    .cf-icon { font-size: 20px; }
    .cf-title-wrap h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .cf-title-wrap h3 { color: #F1F5F9; }
    .cf-sub { font-size: 11px; color: #64748B; }
    :host-context([data-theme='dark']) .cf-sub { color: #94A3B8; }
    .cf-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .kpi-box {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
    }
    :host-context([data-theme='dark']) .kpi-box { background: #1E293B; border-color: #334155; }
    .kpi-lbl { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.03em; }
    :host-context([data-theme='dark']) .kpi-lbl { color: #94A3B8; }
    .kpi-val { font-size: 16px; font-weight: 800; color: #0F172A; }
    :host-context([data-theme='dark']) .kpi-val { color: #F8FAFC; }
    .kpi-box.inflow .kpi-val { color: #10B981; }
    .kpi-box.outflow .kpi-val { color: #EF4444; }
    .kpi-box.net.positive .kpi-val { color: #10B981; }
    .kpi-box.net.negative .kpi-val { color: #EF4444; }
    .kpi-box.projected .kpi-val { color: #6366F1; }
    .kpi-sub { font-size: 10px; color: #94A3B8; }
    .cf-bar-section { margin-bottom: 16px; }
    .bar-labels { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #64748B; margin-bottom: 4px; }
    :host-context([data-theme='dark']) .bar-labels { color: #94A3B8; }
    .multi-bar { height: 8px; border-radius: 999px; overflow: hidden; display: flex; background: #E2E8F0; }
    .inflow-bar { background: #10B981; }
    .outflow-bar { background: #EF4444; }
    .rules-section { margin-bottom: 14px; }
    .sec-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #1E293B; }
    :host-context([data-theme='dark']) .sec-title { color: #E2E8F0; }
    .sec-hint { font-size: 10px; color: #94A3B8; font-weight: normal; }
    .rules-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    @media (max-width: 540px) { .rules-grid { grid-template-columns: 1fr; } }
    .rule-card {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;
      padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
    }
    :host-context([data-theme='dark']) .rule-card { background: #1E293B; border-color: #334155; }
    .rule-top { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
    .rule-card.need .rule-name { color: #3B82F6; }
    .rule-card.want .rule-name { color: #EC4899; }
    .rule-card.saving .rule-name { color: #10B981; }
    .rule-bar-wrap { height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden; }
    :host-context([data-theme='dark']) .rule-bar-wrap { background: #334155; }
    .rule-fill { height: 100%; border-radius: 999px; }
    .need-fill { background: #3B82F6; }
    .want-fill { background: #EC4899; }
    .saving-fill { background: #10B981; }
    .rule-val { font-size: 12px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .rule-val { color: #F8FAFC; }
    .comparison-pills-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .comp-label { font-size: 11px; font-weight: 700; color: #64748B; }
    .pills-wrap { display: flex; gap: 6px; flex-wrap: wrap; }
    .comp-pill {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .comp-pill.up { background: #FEE2E2; color: #EF4444; }
    .comp-pill.down { background: #DCFCE7; color: #16A34A; }
  `]
})
export class CashFlowCardComponent {
  @Input() currency = 'USD';
  @Input() incomeCents = 0;
  @Input() expenseCents = 0;
  @Input() expenses: Expense[] = [];
  @Input() insights: Insights | null = null;

  readonly money = money;
  readonly signedMoney = signedMoney;

  get netCents(): number {
    return this.incomeCents - this.expenseCents;
  }

  incomeShare(): number {
    const total = this.incomeCents + this.expenseCents;
    if (total <= 0) return 50;
    return Math.round((this.incomeCents / total) * 100);
  }

  expenseShare(): number {
    const total = this.incomeCents + this.expenseCents;
    if (total <= 0) return 50;
    return 100 - this.incomeShare();
  }

  projectedMonthEndCents(): number {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth <= 0) return this.expenseCents;
    const dailyRate = this.expenseCents / dayOfMonth;
    return Math.round(dailyRate * totalDaysInMonth);
  }

  needCents(): number {
    return this.expenses
      .filter((e) => e.kind === 'expense' && (!e.tag || e.tag === 'need'))
      .reduce((s, e) => s + e.amountCents, 0);
  }

  wantCents(): number {
    return this.expenses
      .filter((e) => e.kind === 'expense' && e.tag === 'want')
      .reduce((s, e) => s + e.amountCents, 0);
  }

  savingCents(): number {
    const fromTags = this.expenses
      .filter((e) => e.tag === 'saving')
      .reduce((s, e) => s + e.amountCents, 0);
    const surplus = Math.max(0, this.netCents);
    return Math.max(fromTags, surplus);
  }

  needPct(): number {
    const total = this.expenseCents + (this.netCents > 0 ? this.netCents : 0);
    if (total <= 0) return 50;
    return Math.min(100, Math.round((this.needCents() / total) * 100));
  }

  wantPct(): number {
    const total = this.expenseCents + (this.netCents > 0 ? this.netCents : 0);
    if (total <= 0) return 30;
    return Math.min(100, Math.round((this.wantCents() / total) * 100));
  }

  savingPct(): number {
    const total = this.expenseCents + (this.netCents > 0 ? this.netCents : 0);
    if (total <= 0) return 20;
    return Math.min(100, Math.round((this.savingCents() / total) * 100));
  }

  comparisonPills(): { name: string; icon: string; deltaText: string; isUp: boolean }[] {
    if (!this.insights?.categoryShares?.length) return [];
    return this.insights.categoryShares.slice(0, 3).map((c) => {
      // Delta preview
      const delta = Math.round(c.pct);
      return {
        name: c.name,
        icon: c.icon || '🏷️',
        deltaText: `${delta}% of total spend`,
        isUp: delta > 25
      };
    });
  }
}
