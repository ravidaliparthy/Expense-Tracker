import { ChangeDetectorRef, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FilterService } from '../../core/filter.service';
import { ApiService, SummaryDto } from '../../core/api.service';
import { OfflineQueueService } from '../../core/offline-queue.service';
import { OnboardingService } from '../../core/onboarding.service';
import { AuthService } from '../../core/auth.service';
import { Budget, Category, Expense, Insights, TIER_COLORS, money, signedMoney } from '../../core/models';
import { BudgetStatus, computeBudgetStatus } from '../../core/budget-status';
import { FilterBarComponent } from './filter-bar.component';
import { ExpenseTableComponent } from './expense-table.component';
import { ExpenseFormComponent, ExpenseFormValue } from './expense-form.component';
import { OnboardingOverlayComponent } from '../onboarding/onboarding-overlay.component';
import { safeUuid } from '../../core/uuid';
const pad = (n: number) => String(n).padStart(2, '0');

export interface BreakdownRow {
  label: string;
  subLabel?: string;
  cents: number;
  pct: number;
  key?: string;
  clickable?: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FilterBarComponent, ExpenseTableComponent, ExpenseFormComponent, OnboardingOverlayComponent],
  templateUrl: './dashboard.page.html',
  styles: [`
    .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap}
    .toolbar h1{margin:0;font-size:22px}
    .toolbar .sub{color:#64748B;font-size:12px;margin-top:2px}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
    .grid-2{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px}
    .analysis-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
    @media(max-width:980px){.grid-2,.analysis-grid{grid-template-columns:1fr}}
    .chart svg{width:100%;height:auto;display:block}
    .catbar{display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:12px}
    .catbar .name{width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}
    .catbar .bar{flex:1;height:14px;background:#F1F5F9;border-radius:4px;overflow:hidden}
    .catbar .bar>div{height:100%;border-radius:4px}
    .catbar .val{width:84px;text-align:right;font-variant-numeric:tabular-nums;color:#334155}
    .positive{color:#047857}
    .negative{color:#DC2626}
    .mini{font-size:12px;color:#64748B}
    .legend-line{display:flex;gap:14px;font-size:12px;color:#64748B;margin-top:8px}
    .dot{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:4px}
    .dash{stroke-dasharray:4 3}
    .tbl-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;padding:0;box-sizing:border-box;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:6px;cursor:pointer;font-size:14px;margin-left:4px;color:#334155;user-select:none;outline:none;transition:background-color .12s ease, border-color .12s ease, color .12s ease}
    .tbl-icon-btn:hover{background:#E2E8F0;border-color:#94A3B8;color:#0F172A}
    .tbl-icon-btn:active{background:#CBD5E1;border-color:#64748B}
    .tbl-icon-btn.danger:hover{color:#DC2626;border-color:#FECACA;background:#FEF2F2}
    .tbl-icon-btn.danger:active{background:#FEE2E2;border-color:#F87171}
    .kind{font-size:11px;border-radius:999px;padding:3px 8px;background:#FEE2E2;color:#B91C1C}
    .kind.income{background:#DCFCE7;color:#047857}
    .amount.plus{color:#047857}
    .amount.minus{color:#DC2626}
    tr.income{background:#F0FDF4}
    .mono{font-variant-numeric:tabular-nums;color:#475569;white-space:nowrap}
    .notes-cell{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748B}

    /* Spending Breakdown Card Header & Segmented Mode Switcher */
    .card-head-flex{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px}
    .card-head-flex h3{margin:0}
    .mode-toggle{display:inline-flex;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:6px;padding:2px;gap:2px}
    .mode-btn{padding:3px 8px;font-size:11px;font-weight:500;border:none;background:transparent;color:#64748B;border-radius:4px;cursor:pointer;transition:all .08s ease}
    .mode-btn:hover{color:#0F172A}
    .mode-btn.active{background:#fff;color:#4F46E5;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}

    /* Sub-filters (Styled like Picture 2) */
    .subfilter-container{display:flex;align-items:center;gap:10px;margin-bottom:10px;user-select:none;flex-wrap:wrap}
    .subfilter-dropdown-wrap{position:relative}
    .subfilter-dropdown-btn{display:inline-flex;align-items:center;gap:8px;font-size:12px;padding:6px 12px;border-radius:8px;border:1px solid #CBD5E1;background:#fff;color:#334155;cursor:pointer;font-weight:500;transition:border-color .05s ease, background-color .05s ease}
    .subfilter-dropdown-btn:hover{border-color:#94A3B8;background:#F8FAFC}
    .dropdown-caret{font-size:9px;color:#94A3B8}
    .subfilter-range-label{font-size:12px;color:#64748B;font-variant-numeric:tabular-nums}
    .subfilter-dropdown-menu{position:absolute;top:calc(100% + 4px);left:0;min-width:220px;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #CBD5E1;border-radius:8px;box-shadow:0 10px 25px rgba(15,23,42,.12);z-index:100;padding:4px;list-style:none;margin:0;scrollbar-width:thin;scrollbar-color:#CBD5E1 transparent}
    .subfilter-dropdown-menu::-webkit-scrollbar{width:6px}
    .subfilter-dropdown-menu::-webkit-scrollbar-track{background:transparent}
    .subfilter-dropdown-menu::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:999px}
    .subfilter-dropdown-item{padding:7px 11px;font-size:12px;border-radius:6px;cursor:pointer;color:#1E293B;transition:background-color .03s ease}
    .subfilter-dropdown-item:hover{background:#EEF2FF;color:#4338CA}
    .subfilter-dropdown-item.selected{background:#E0E7FF;color:#3730A3;font-weight:600}

    /* Scrollbar for Picture 1 */
    .breakdown-scroll-body{max-height:270px;overflow-y:auto;padding-right:6px;margin-top:4px;margin-bottom:6px;scrollbar-width:thin;scrollbar-color:#CBD5E1 transparent}
    .breakdown-scroll-body::-webkit-scrollbar{width:6px}
    .breakdown-scroll-body::-webkit-scrollbar-track{background:transparent}
    .breakdown-scroll-body::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:999px}
    .breakdown-scroll-body::-webkit-scrollbar-thumb:hover{background:#94A3B8}

    .btn-back-crumb{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#4F46E5;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:6px;padding:3px 9px;cursor:pointer;margin-bottom:8px;transition:all .05s ease}
    .btn-back-crumb:hover{background:#E0E7FF}
    .wdrow.clickable{cursor:pointer;border-radius:6px;padding:3px 6px;margin-left:-6px;margin-right:-6px;transition:background-color .05s ease}
    .wdrow.clickable:hover{background:#F1F5F9}
    .drill-hint{color:#6366F1;font-weight:bold;margin-left:4px;font-size:13px}

    /* Table Sorting Controls */
    .sort-controls{display:flex;align-items:center;gap:6px;font-size:12px}
    .sort-lbl{color:#64748B;font-weight:500}
    .sort-btn{background:#F1F5F9;border:1px solid #CBD5E1;color:#334155;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:500;transition:all .05s ease}
    .sort-btn:hover{border-color:#94A3B8;background:#E2E8F0}
    .sort-btn.active{background:#EEF2FF;border-color:#6366F1;color:#4F46E5;font-weight:600}
    .sortable{cursor:pointer;user-select:none;transition:color .05s ease}
    .sortable:hover{color:#4F46E5}
    .sort-icon{font-size:10px;margin-left:3px;color:#6366F1}

    /* Dark Mode */
    :host-context([data-theme='dark']) .mode-toggle{background:#0F172A;border-color:#334155}
    :host-context([data-theme='dark']) .mode-btn{color:#94A3B8}
    :host-context([data-theme='dark']) .mode-btn:hover{color:#F1F5F9}
    :host-context([data-theme='dark']) .mode-btn.active{background:#1E293B;color:#A5B4FC}
    :host-context([data-theme='dark']) .subfilter-dropdown-btn{background:#1E293B;border-color:#334155;color:#F1F5F9}
    :host-context([data-theme='dark']) .subfilter-dropdown-btn:hover{border-color:#64748B;background:#334155}
    :host-context([data-theme='dark']) .subfilter-dropdown-menu{background:#1E293B;border-color:#334155;box-shadow:0 10px 25px rgba(0,0,0,.4);scrollbar-color:#475569 transparent}
    :host-context([data-theme='dark']) .subfilter-dropdown-item{color:#E2E8F0}
    :host-context([data-theme='dark']) .subfilter-dropdown-item:hover{background:#312E81;color:#C7D2FE}
    :host-context([data-theme='dark']) .subfilter-dropdown-item.selected{background:#4338CA;color:#fff}
    :host-context([data-theme='dark']) .subfilter-range-label{color:#94A3B8}
    :host-context([data-theme='dark']) .breakdown-scroll-body{scrollbar-color:#475569 transparent}
    :host-context([data-theme='dark']) .breakdown-scroll-body::-webkit-scrollbar-thumb{background:#475569}
    :host-context([data-theme='dark']) .breakdown-scroll-body::-webkit-scrollbar-thumb:hover{background:#64748B}
    :host-context([data-theme='dark']) .btn-back-crumb{background:#312E81;border-color:#4338CA;color:#C7D2FE}
    :host-context([data-theme='dark']) .wdrow.clickable:hover{background:#1E293B}
    :host-context([data-theme='dark']) .sort-btn{background:#1E293B;border-color:#334155;color:#CBD5E1}
    :host-context([data-theme='dark']) .sort-btn:hover{background:#334155}
    :host-context([data-theme='dark']) .sort-btn.active{background:#312E81;border-color:#6366F1;color:#A5B4FC}
    :host-context([data-theme='dark']) .sortable:hover{color:#A5B4FC}

    /* Empty state card */
    .empty-state-card { text-align:center; padding:32px 16px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:12px; margin-top:8px; }
    :host-context([data-theme='dark']) .empty-state-card { background:#1E293B; border-color:#334155; }
    .empty-state-art { font-size:36px; margin-bottom:8px; }
    .empty-state-card h4 { margin:0 0 6px; font-size:16px; color:#1E293B; }
    :host-context([data-theme='dark']) .empty-state-card h4 { color:#F1F5F9; }
    .empty-state-desc { color:#64748B; font-size:13px; max-width:440px; margin:0 auto 16px; line-height:1.4; }
    .empty-state-actions { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; }

    /* Contained table scroll & mobile responsiveness */
    .tbl-wrap { width:100%; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:8px; box-sizing:border-box; }
    table { width:100%; min-width:480px; border-collapse:collapse; }
    @media (max-width: 640px) {
      .notes, .notes-cell { display:none !important; }
      table { min-width:380px !important; }
      .tbl-wrap { margin:0 -4px; padding:0 4px; }
      .sort-controls { width:100%; justify-content:flex-end; margin-top:4px; }
    }
  `]
})
export class DashboardPage {
  readonly filter=inject(FilterService); private api=inject(ApiService); readonly queue=inject(OfflineQueueService); readonly tour=inject(OnboardingService); readonly auth=inject(AuthService); private cdr = inject(ChangeDetectorRef);
  readonly TIER_COLORS=TIER_COLORS; readonly money=money; readonly signedMoney=signedMoney;
  readonly trackById = (_: number, e: Expense): number => e.id;
  readonly expenses=signal<Expense[]>([]); readonly total=signal(0); readonly categories=signal<Category[]>([]); readonly budgets=signal<Budget[]>([]); readonly summary=signal<SummaryDto|null>(null); readonly insights=signal<Insights|null>(null); readonly loading=signal(false); readonly flash=signal<{type:'ok'|'warn'|'err';text:string}|null>(null); readonly exportBusy=signal(false); readonly formOpen=signal(false); readonly editing=signal<Expense|null>(null); readonly hadData=signal(false);
  readonly deletingIds=signal<Set<number>>(new Set());
  readonly seedingDemo=signal(false);

  // Customizable breakdown mode & sub-filter keys
  readonly breakdownMode=signal<'weekday'|'weekly'|'monthly'|'yearly'>('weekday');
  readonly selectedWeekKey=signal<string|null>(null);
  readonly selectedMonthKey=signal<string|null>(null);
  readonly weekDropdownOpen=signal(false);
  readonly monthDropdownOpen=signal(false);

  // Sorting
  readonly sortField=signal<'date'|'amount'>('date');
  readonly sortDirection=signal<'desc'|'asc'>('desc');

  readonly currency=computed(()=>this.auth.user()?.baseCurrency || 'USD');
  readonly spendRows=computed(()=>this.expenses().filter(e=>e.kind==='expense'));
  readonly incomeRows=computed(()=>this.expenses().filter(e=>e.kind==='income'));
  readonly statuses=computed<BudgetStatus[]>(()=>{ const f=this.filter.filters(); const rows=computeBudgetStatus({ expenses:this.spendRows(), budgets:this.budgets(), range:{from:f.from,to:f.to}, activeCategoryIds:null }); return f.categoryIds.length?rows.filter(s=>s.categoryId===null||f.categoryIds.includes(s.categoryId)):rows; });
  readonly kpis=computed(()=>{ const s=this.summary(); const expense=s?.expenseCents ?? this.spendRows().reduce((a,e)=>a+e.amountCents,0); const income=s?.incomeCents ?? this.incomeRows().reduce((a,e)=>a+e.amountCents,0); const net=income-expense; const savings=income>0?Math.round((net/income)*1000)/10:0; const byCat=new Map<string,{name:string;icon:string;cents:number}>(); for(const e of this.spendRows()){ const key=e.categorySnapshot; const cur=byCat.get(key)??{name:key,icon:e.categoryIcon||'🏷️',cents:0}; cur.cents+=e.amountCents; byCat.set(key,cur); } const top=[...byCat.values()].sort((a,b)=>b.cents-a.cents)[0]; return {expense,income,net,savings,count:this.expenses().length,expenseCount:this.spendRows().length,incomeCount:this.incomeRows().length,avgExpense:this.spendRows().length?Math.round(expense/this.spendRows().length):0,topName:top?`${top.icon} ${top.name}`:'—',topCents:top?.cents??0}; });
  readonly trend=computed(()=>{ const f=this.filter.filters(); const buckets=new Map<string,{expense:number;income:number;net:number}>(); for(const e of this.expenses()){ const key=this.bucket(e.localDate,f.groupBy); const cur=buckets.get(key)??{expense:0,income:0,net:0}; if(e.kind==='income')cur.income+=e.amountCents; else cur.expense+=e.amountCents; cur.net=cur.income-cur.expense; buckets.set(key,cur); } return [...buckets.entries()].sort((a,b)=>a[0].localeCompare(b[0])); });
  readonly expensePoints=computed(()=>this.pointsFor('expense')); readonly incomePoints=computed(()=>this.pointsFor('income')); readonly netPoints=computed(()=>this.pointsFor('net'));
  readonly byCategory=computed(()=>{ const map=new Map<string,{name:string;icon:string;cents:number;color:string}>(); for(const e of this.spendRows()){ const cur=map.get(e.categorySnapshot)??{name:e.categorySnapshot,icon:e.categoryIcon||'🏷️',cents:0,color:e.categoryColor}; cur.cents+=e.amountCents; map.set(e.categorySnapshot,cur); } const rows=[...map.values()].sort((a,b)=>b.cents-a.cents).slice(0,7); const max=rows[0]?.cents||1; return rows.map(r=>({...r,pct:Math.round((r.cents/max)*100)})); });
  readonly cashflowBreakdown=computed(()=>{ const k=this.kpis(); const days=this.daysInRange(); const elapsed=this.daysElapsedInRange(); const left=Math.max(0,days-elapsed); const burnRate=elapsed>0?Math.round(k.expense/elapsed):0; const projectedExpense=Math.round(burnRate*days); const projectedNet=k.income-projectedExpense; const remainingIncome=Math.max(0,k.income-k.expense); const safeToday=left>0?Math.round(remainingIncome/left):remainingIncome; return { burnRate, daysLeft:left, projectedExpense, projectedNet, safeToday, runwayDays: burnRate>0 && k.income>0 ? Math.round(k.income/burnRate) : 0, expenseRatio: k.income>0 ? Math.round((k.expense/k.income)*1000)/10 : 0 }; });
  readonly insightMessages=computed(()=>{ const ins=this.insights(); if(!ins)return[]; const cur=this.currency(); const out:{icon:string;text:string;tone?:'pos'|'neg'}[]=[]; const c=ins.comparison; const pct=(p:number)=>`${Math.abs(p)}%`;
    if(c.prevExpenseCents>0){const up=c.expenseDeltaPct>0;out.push({icon:up?'📈':'📉',text:`Debits ${up?'up':'down'} ${pct(c.expenseDeltaPct)} vs previous period (${money(c.prevExpenseCents,cur)} → ${money(c.expenseCents,cur)}).`,tone:up?'neg':'pos'});}
    if(c.incomeCents>0||c.prevIncomeCents>0){const up=c.incomeDeltaPct>=0;out.push({icon:'💰',text:`Credits ${up?'grew':'fell'} ${pct(c.incomeDeltaPct)} (${money(c.prevIncomeCents,cur)} → ${money(c.incomeCents,cur)}).`,tone:up?'pos':'neg'});}
    out.push({icon:c.netCents>=0?'✅':'⚠️',text:`Net savings ${signedMoney(c.netCents,cur)} this period${c.prevNetCents!==0?` vs ${signedMoney(c.prevNetCents,cur)} previously`:''}.`,tone:c.netCents>=0?'pos':'neg'});
    if(ins.biggestExpense)out.push({icon:'😱',text:`Biggest debit: ${money(ins.biggestExpense.amountCents,cur)} at ${ins.biggestExpense.merchant} on ${ins.biggestExpense.localDate}.`});
    if(ins.topMerchant)out.push({icon:'🏪',text:`Top spender: ${ins.topMerchant.merchant} — ${money(ins.topMerchant.totalCents,cur)} across ${ins.topMerchant.count} visits.`});
    if(ins.recurring.length)out.push({icon:'🔁',text:`Recurring: ${ins.recurring.slice(0,3).map(r=>`${r.merchant} (${r.count}×)`).join(', ')} — review subscriptions.`});
    out.push({icon:'🪑',text:`${ins.days.noSpendDays} no-spend day${ins.days.noSpendDays===1?'':'s'} of ${ins.days.total} — longest streak ${ins.days.longestNoSpendStreak}.`,tone:'pos'});
    const w=ins.weekdayVsWeekend; if(w.weekdayAvg>0&&w.weekendAvg>0)out.push({icon:'📅',text:`Weekend days cost ${money(w.weekendAvg,cur)} on average vs ${money(w.weekdayAvg,cur)} on weekdays.`});
    if(ins.categoryShares.length){const t=ins.categoryShares[0];out.push({icon:t.icon,text:`${t.name} takes ${t.pct}% of all spending.`});}
    out.push({icon:'⏳',text:`Daily average ${money(ins.dailyAverageCents,cur)} over ${ins.days.total} days.`});
    return out.slice(0,9);
  });

  /** Weeks available in current date range for the week sub-filter */
  readonly availableWeeks = computed(() => {
    const r = this.filter.range();
    const fromD = new Date(r.from + 'T00:00:00Z');
    const toD = new Date(r.to + 'T00:00:00Z');
    const day = (fromD.getUTCDay() + 6) % 7;
    fromD.setUTCDate(fromD.getUTCDate() - day);

    const list: { key: string; shortLabel: string; fullLabel: string; start: string; end: string }[] = [];
    const cur = new Date(fromD);
    let idx = 1;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    while (cur <= toD) {
      const startStr = cur.toISOString().slice(0, 10);
      const endD = new Date(cur);
      endD.setUTCDate(endD.getUTCDate() + 6);
      const endStr = endD.toISOString().slice(0, 10);
      const sDay = String(cur.getUTCDate()).padStart(2, '0');
      const sMon = monthNames[cur.getUTCMonth()];
      const eDay = String(endD.getUTCDate()).padStart(2, '0');
      const eMon = monthNames[endD.getUTCMonth()];
      list.push({
        key: startStr,
        shortLabel: `Week ${idx}`,
        fullLabel: `Week ${idx} (${sDay} ${sMon} – ${eDay} ${eMon})`,
        start: startStr,
        end: endStr,
      });
      idx++;
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return list;
  });

  /** Months available in current date range for the month sub-filter */
  readonly availableMonths = computed(() => {
    const r = this.filter.range();
    const startY = Number(r.from.slice(0, 4));
    const startM = Number(r.from.slice(5, 7));
    const endY = Number(r.to.slice(0, 4));
    const endM = Number(r.to.slice(5, 7));

    const list: { key: string; label: string }[] = [];
    let y = startY, m = startM;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    while (y < endY || (y === endY && m <= endM)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      list.push({ key, label: `${monthNames[m - 1]} '${String(y).slice(2)}` });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return list;
  });

  readonly currentWeekFilterLabel = computed(() => {
    const key = this.selectedWeekKey();
    if (!key) return 'All Weeks';
    const found = this.availableWeeks().find((w) => w.key === key);
    return found ? found.shortLabel : 'Selected Week';
  });

  readonly currentWeekFilterRange = computed(() => {
    const key = this.selectedWeekKey();
    if (!key) {
      const r = this.filter.range();
      return `${r.from} → ${r.to}`;
    }
    const found = this.availableWeeks().find((w) => w.key === key);
    return found ? `${found.start} → ${found.end}` : '';
  });

  readonly currentMonthFilterLabel = computed(() => {
    const key = this.selectedMonthKey();
    if (!key) return 'All Months';
    const found = this.availableMonths().find((m) => m.key === key);
    return found ? found.label : 'Selected Month';
  });

  readonly currentMonthFilterRange = computed(() => {
    const key = this.selectedMonthKey();
    if (!key) {
      const r = this.filter.range();
      return `${r.from} → ${r.to}`;
    }
    const [yStr, mStr] = key.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${key}-01 → ${key}-${String(lastDay).padStart(2, '0')}`;
  });

  /** Customizable Spending Breakdown supporting Weekday, Weekly (with daily sub-filter), Monthly (with weekly sub-filter), and Yearly */
  readonly breakdownData = computed<{
    title: string;
    rows: BreakdownRow[];
    summary: string;
  }>(() => {
    const mode = this.breakdownMode();
    const cur = this.currency();
    const expenses = this.spendRows();

    // 1. WEEKDAY MODE
    if (mode === 'weekday') {
      const dist = this.insights()?.weekdayDistribution ?? [0, 0, 0, 0, 0, 0, 0];
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      let actualDist = [...dist];
      if (!actualDist.some((c) => c > 0) && expenses.length > 0) {
        actualDist = [0, 0, 0, 0, 0, 0, 0];
        for (const e of expenses) {
          const dow = new Date(e.localDate + 'T00:00:00Z').getUTCDay();
          actualDist[(dow + 6) % 7] += e.amountCents;
        }
      }
      const max = Math.max(...actualDist, 1);
      const rows: BreakdownRow[] = labels.map((label, i) => ({
        label,
        cents: actualDist[i] ?? 0,
        pct: Math.round(((actualDist[i] ?? 0) / max) * 100),
      }));

      const ins = this.insights();
      let summary = '';
      if (ins) {
        summary = `Weekday avg ${money(ins.weekdayVsWeekend.weekdayAvg, cur)} · weekend avg ${money(ins.weekdayVsWeekend.weekendAvg, cur)} · ${ins.days.noSpendDays} no-spend days`;
      } else {
        const weekdaySum = actualDist.slice(0, 5).reduce((a, b) => a + b, 0);
        const weekendSum = actualDist.slice(5).reduce((a, b) => a + b, 0);
        summary = `Weekday avg ${money(Math.round(weekdaySum / 5), cur)} · weekend avg ${money(Math.round(weekendSum / 2), cur)}`;
      }
      return { title: 'Spending by weekday', rows, summary };
    }

    // 2. WEEKLY MODE (with Day-by-Day Sub-filter)
    if (mode === 'weekly') {
      const selectedWKey = this.selectedWeekKey();
      const allWeeks = this.availableWeeks();

      // If a specific week is selected, drill down into its 7 DAYS (Mon → Sun)
      if (selectedWKey) {
        const targetWeek = allWeeks.find((w) => w.key === selectedWKey) || allWeeks[0];
        const startD = new Date((targetWeek ? targetWeek.start : selectedWKey) + 'T00:00:00Z');
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayRows: BreakdownRow[] = [];
        const centsList: number[] = [];

        for (let i = 0; i < 7; i++) {
          const d = new Date(startD);
          d.setUTCDate(d.getUTCDate() + i);
          const dStr = d.toISOString().slice(0, 10);
          const dayCents = expenses
            .filter((e) => e.localDate === dStr)
            .reduce((sum, e) => sum + e.amountCents, 0);
          centsList.push(dayCents);
          const label = `${dayNames[i]} (${String(d.getUTCDate()).padStart(2, '0')} ${monthNames[d.getUTCMonth()]})`;
          dayRows.push({ label, cents: dayCents, pct: 0 });
        }
        const maxDay = Math.max(...centsList, 1);
        dayRows.forEach((r, i) => (r.pct = Math.round((centsList[i] / maxDay) * 100)));

        const weekTotal = centsList.reduce((a, b) => a + b, 0);
        const spendDaysCount = centsList.filter((c) => c > 0).length;
        const peakIdx = centsList.indexOf(Math.max(...centsList));
        const peakText = Math.max(...centsList) > 0 ? ` · Peak on ${dayNames[peakIdx]}: ${money(centsList[peakIdx], cur)}` : '';
        const summary = `Week total: ${money(weekTotal, cur)} · ${spendDaysCount} spend day(s)${peakText}`;
        const weekTitle = targetWeek ? targetWeek.fullLabel : `Week starting ${selectedWKey}`;
        return {
          title: `Spending in ${weekTitle}`,
          rows: dayRows,
          summary,
        };
      }

      // If viewing All Weeks: list all weeks
      const centsList: number[] = [];
      const rows: BreakdownRow[] = allWeeks.map((w) => {
        const weekCents = expenses
          .filter((e) => e.localDate >= w.start && e.localDate <= w.end)
          .reduce((sum, e) => sum + e.amountCents, 0);
        centsList.push(weekCents);
        return {
          label: w.fullLabel,
          cents: weekCents,
          pct: 0,
          key: w.key,
          clickable: true,
        };
      });
      const maxWeek = Math.max(...centsList, 1);
      rows.forEach((r, i) => (r.pct = Math.round((centsList[i] / maxWeek) * 100)));

      const totalCents = centsList.reduce((s, c) => s + c, 0);
      const avg = rows.length ? Math.round(totalCents / rows.length) : 0;
      const summary = rows.length
        ? `Weekly avg ${money(avg, cur)} across ${rows.length} week(s) · Click any week to view its day-by-day transactions`
        : 'No weekly expense data in this date range.';
      return { title: 'Spending by week', rows, summary };
    }

    // 3. MONTHLY MODE (with Week-by-Week Sub-filter)
    if (mode === 'monthly') {
      const selectedMKey = this.selectedMonthKey();
      const allMonths = this.availableMonths();

      // If a specific month is selected, drill down into its WEEKS
      if (selectedMKey) {
        const monthObj = allMonths.find((m) => m.key === selectedMKey);
        const monthLabel = monthObj ? monthObj.label : selectedMKey;
        const overlappingWeeks = this.availableWeeks().filter((w) => w.start.slice(0, 7) === selectedMKey || w.end.slice(0, 7) === selectedMKey);

        const centsList: number[] = [];
        const rows: BreakdownRow[] = overlappingWeeks.map((w) => {
          const weekCents = expenses
            .filter((e) => e.localDate >= w.start && e.localDate <= w.end && e.localDate.startsWith(selectedMKey))
            .reduce((sum, e) => sum + e.amountCents, 0);
          centsList.push(weekCents);
          return {
            label: w.fullLabel,
            cents: weekCents,
            pct: 0,
            key: w.key,
            clickable: true,
          };
        });
        const maxW = Math.max(...centsList, 1);
        rows.forEach((r, i) => (r.pct = Math.round((centsList[i] / maxW) * 100)));

        const monthTotal = centsList.reduce((a, b) => a + b, 0);
        const summary = `${monthLabel} Total: ${money(monthTotal, cur)} · Click any week to view its day-by-day transactions`;
        return {
          title: `Spending in ${monthLabel} by week`,
          rows,
          summary,
        };
      }

      // If viewing All Months: list all months
      const centsList: number[] = [];
      const rows: BreakdownRow[] = allMonths.map((m) => {
        const monthCents = expenses
          .filter((e) => e.localDate.startsWith(m.key))
          .reduce((sum, e) => sum + e.amountCents, 0);
        centsList.push(monthCents);
        return {
          label: m.label,
          cents: monthCents,
          pct: 0,
          key: m.key,
          clickable: true,
        };
      });
      const maxM = Math.max(...centsList, 1);
      rows.forEach((r, i) => (r.pct = Math.round((centsList[i] / maxM) * 100)));

      const totalCents = centsList.reduce((s, c) => s + c, 0);
      const avg = rows.length ? Math.round(totalCents / rows.length) : 0;
      const summary = rows.length
        ? `Monthly avg ${money(avg, cur)} across ${rows.length} month(s) · Click any month to view its weekly breakdown`
        : 'No monthly expense data in this date range.';
      return { title: 'Spending by month', rows, summary };
    }

    // 4. YEARLY MODE
    const buckets = new Map<string, number>();
    for (const e of expenses) {
      const bKey = e.localDate.slice(0, 4);
      buckets.set(bKey, (buckets.get(bKey) ?? 0) + e.amountCents);
    }
    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(...sorted.map(([, c]) => c), 1);
    const rows: BreakdownRow[] = sorted.map(([bKey, cents]) => ({
      label: bKey,
      cents,
      pct: Math.round((cents / max) * 100),
    }));
    const totalCents = rows.reduce((s, r) => s + r.cents, 0);
    const avg = rows.length ? Math.round(totalCents / rows.length) : 0;
    const summary = rows.length
      ? `Yearly avg ${money(avg, cur)} across ${rows.length} year(s) · Total: ${money(totalCents, cur)}`
      : 'No yearly expense data in this date range.';
    return { title: 'Spending by year', rows, summary };
  });

  readonly weekdayRows = computed(() => this.breakdownData().rows);

  /** Sorted transactions list supporting Ascending / Descending by Date or Amount */
  readonly sortedExpenses = computed(() => {
    const list = [...this.expenses()];
    const field = this.sortField();
    const dir = this.sortDirection();
    return list.sort((a, b) => {
      if (field === 'date') {
        const cmp = a.localDate.localeCompare(b.localDate);
        return dir === 'desc' ? -cmp : cmp;
      } else {
        const cmp = a.amountCents - b.amountCents;
        return dir === 'desc' ? -cmp : cmp;
      }
    });
  });

  toggleSort(field: 'date' | 'amount'): void {
    if (this.sortField() === field) {
      this.sortDirection.update((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('desc');
    }
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.weekDropdownOpen.set(false);
    this.monthDropdownOpen.set(false);
  }

  selectWeek(key: string | null): void {
    this.selectedWeekKey.set(key);
    this.weekDropdownOpen.set(false);
  }

  selectMonth(key: string | null): void {
    this.selectedMonthKey.set(key);
    this.monthDropdownOpen.set(false);
  }

  setBreakdownMode(m: 'weekday' | 'weekly' | 'monthly' | 'yearly'): void {
    this.breakdownMode.set(m);
    this.selectedWeekKey.set(null);
    this.selectedMonthKey.set(null);
    this.weekDropdownOpen.set(false);
    this.monthDropdownOpen.set(false);
    const gb = m === 'weekday' ? 'day' : m === 'weekly' ? 'week' : m === 'monthly' ? 'month' : 'year';
    if (this.filter.groupBy() !== gb) {
      this.filter.setGroupBy(gb);
    }
  }

  onBreakdownRowClick(row: BreakdownRow): void {
    if (!row.clickable || !row.key) return;
    if (this.breakdownMode() === 'weekly' && this.selectedWeekKey() === null) {
      this.selectedWeekKey.set(row.key);
    } else if (this.breakdownMode() === 'monthly') {
      if (this.selectedMonthKey() === null) {
        this.selectedMonthKey.set(row.key);
      } else {
        // Drilled into week from month view
        this.breakdownMode.set('weekly');
        this.selectedWeekKey.set(row.key);
      }
    }
  }

  readonly donutSegments=computed(()=>{ const rows=this.byCategory(); const total=rows.reduce((s,r)=>s+r.cents,0); if(!total)return[]; const C=2*Math.PI*42; let start=0; return rows.map(r=>{ const len=(r.cents/total)*C; const draw=Math.max(len-1.5,0.5); const seg={color:r.color,dash:`${draw} ${C-draw}`,offset:-start,pct:Math.round((r.cents/total)*100),name:r.name,icon:r.icon}; start+=len; return seg; }); });
  readonly groupedBars=computed(()=>{ const series=this.trend(); if(!series.length)return[]; const data=series.slice(-40); const max=Math.max(...data.map(([,v])=>Math.max(v.income,v.expense)),1); return data.map(([bucket,v])=>({bucket,short:bucket.length>7?bucket.slice(5):bucket,creditCents:v.income,debitCents:v.expense,creditPct:Math.max(v.income>0?3:0,Math.round((v.income/max)*100)),debitPct:Math.max(v.expense>0?3:0,Math.round((v.expense/max)*100))})); });
  readonly cumulative=computed(()=>{ const series=this.trend(); if(!series.length)return{points:'',zeroY:70,final:0}; let run=0; const vals=series.map(([,v])=>(run+=v.net)); const max=Math.max(...vals,0); const min=Math.min(...vals,0); const span=(max-min)||1; const h=140,step=vals.length>1?(600-20)/(vals.length-1):0; const y=(v:number)=>h-10-((v-min)/span)*(h-30); const points=vals.map((v,i)=>`${10+i*step},${y(v)}`).join(' '); return{points,zeroY:y(0),final:vals[vals.length-1]}; });
  readonly isEmpty=computed(()=>!this.loading()&&this.total()===0);
  private loadReqSeq = 0;

  constructor(){
    // Instant Cache Pre-Hydration: render in 0ms on startup without waiting for network
    try {
      const cachedExps = localStorage.getItem('et.cachedExpenses');
      if (cachedExps) {
        const parsed = JSON.parse(cachedExps);
        if (parsed?.items?.length) {
          this.expenses.set(parsed.items);
          this.total.set(parsed.total || parsed.items.length);
          this.hadData.set(true);
        }
      }
      const cachedSum = localStorage.getItem('et.cachedSummary');
      if (cachedSum) {
        this.summary.set(JSON.parse(cachedSum));
      }
      const cachedCats = localStorage.getItem('et.categories');
      if (cachedCats) {
        const parsedCats = JSON.parse(cachedCats);
        if (parsedCats?.length) this.categories.set(parsedCats);
      }
    } catch {}

    effect(()=>{
      const f=this.filter.filters();
      void this.loadFor(f);
      if(f.groupBy==='week') this.breakdownMode.set('weekly');
      else if(f.groupBy==='month') this.breakdownMode.set('monthly');
      else if(f.groupBy==='year') this.breakdownMode.set('yearly');
      else if(f.groupBy==='day') this.breakdownMode.set('weekday');
    }, { allowSignalWrites: true });
    window.addEventListener('et:synced',()=>void this.reload());
  }
  readonly tierMsg=(s:BudgetStatus):string=>{ if(s.tier==='exceeded')return`Over budget by ${money(-s.remainingCents,this.currency())}!`; if(s.tier==='critical')return`${s.percentUsed}% used — ${money(s.remainingCents,this.currency())} left`; if(s.tier==='warning')return`${s.percentUsed}% used — approaching limit`; if(s.isProjectionOver)return`Projected ${money(s.projectedSpendCents,this.currency())} by period end`; return`${money(s.remainingCents,this.currency())} remaining`; };
  async seedSampleData(): Promise<void> {
    try {
      this.seedingDemo.set(true);
      const res = await firstValueFrom(this.api.seedSample());
      this.flash.set({ type: 'ok', text: `Loaded ${res.count} sample transactions!` });
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      await this.reload();
    } catch {
      this.flash.set({ type: 'err', text: 'Could not load sample data' });
    } finally {
      this.seedingDemo.set(false);
    }
  }
  reload():Promise<void>{return this.loadFor(this.filter.filters());} min(a:number,b:number):number{return Math.min(a,b);}
  private async loadCategories(): Promise<void> {
    try {
      const cats = await firstValueFrom(this.api.getCategories());
      if (cats && cats.length) {
        this.categories.set(cats);
      }
    } catch {}
  }
  private async loadFor(f: ReturnType<FilterService['filters']>): Promise<void> {
    const seq = ++this.loadReqSeq;

    // Only show blocking loader on initial cold load if we have no cached data at all
    if (!this.hadData() && this.expenses().length === 0) {
      this.loading.set(true);
      this.cdr.detectChanges();
    }

    try {
      const shouldFetchCats = this.categories().length === 0;

      // 1. Fast Primary Expenses Stream (loads in ~100-200ms)
      const expTask = firstValueFrom(this.api.getExpenses(f)).then((res) => {
        if (seq !== this.loadReqSeq) return;
        if (res?.items) {
          this.expenses.set(res.items);
          this.total.set(res.total || res.items.length);
          if ((res.total || 0) > 0) this.hadData.set(true);
          this.loading.set(false);
          this.cdr.detectChanges();
        }
      }).catch(() => {});

      // 2. Fast KPI Summary Stream (loads in ~100-200ms)
      const sumTask = firstValueFrom(this.api.getSummary(f)).then((res) => {
        if (seq !== this.loadReqSeq) return;
        if (res) {
          this.summary.set(res);
          this.cdr.detectChanges();
        }
      }).catch(() => {});

      // 3. Budgets Stream (loads in ~100-200ms)
      const budTask = firstValueFrom(
        this.api.getBudgets(f.period === 'yearly' ? 'yearly' : 'monthly', Number(f.from.slice(0, 4)), Number(f.from.slice(5, 7)))
      ).then((res) => {
        if (seq !== this.loadReqSeq) return;
        if (res) {
          this.budgets.set(res);
          this.cdr.detectChanges();
        }
      }).catch(() => {});

      // 4. Categories Stream
      const catTask = shouldFetchCats ? firstValueFrom(this.api.getCategories()).then((res) => {
        if (seq !== this.loadReqSeq) return;
        if (res?.length) {
          this.categories.set(res);
          this.cdr.detectChanges();
        }
      }).catch(() => {}) : Promise.resolve();

      // 5. Deeper Insights Stream (runs in background without delaying table or KPIs)
      const insTask = firstValueFrom(this.api.getInsights(f)).then((res) => {
        if (seq !== this.loadReqSeq) return;
        if (res) {
          this.insights.set(res);
          this.cdr.detectChanges();
        }
      }).catch(() => {});

      await Promise.allSettled([expTask, sumTask, budTask, catTask, insTask]);
    } catch {
      this.flash.set({ type: 'err', text: 'Failed to load data — is the API running?' });
    } finally {
      if (seq === this.loadReqSeq) {
        this.loading.set(false);
        this.cdr.detectChanges();
      }
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
    this.cdr.detectChanges();
    if (this.categories().length === 0) {
      void this.loadCategories();
    }
  }

  openEdit(e: Expense): void {
    this.editing.set({ ...e });
    this.formOpen.set(true);
    this.cdr.detectChanges();
    if (this.categories().length === 0) {
      void this.loadCategories();
    }
  }

  hex(color: string, alpha: number): string {
    const c = color && color.startsWith('#') ? color : '#64748B';
    const r = parseInt(c.slice(1, 3), 16) || 100;
    const g = parseInt(c.slice(3, 5), 16) || 116;
    const b = parseInt(c.slice(5, 7), 16) || 139;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  async onSave(v: ExpenseFormValue): Promise<void> {
    const editing = this.editing();
    try {
      if (editing) {
        await firstValueFrom(this.api.updateExpense(editing.id, { ...v, baseVersion: editing.syncVersion }));
        this.flash.set({ type: 'ok', text: 'Transaction updated successfully.' });
      } else {
        const res = await this.api.createExpense({ ...v, clientUuid: safeUuid() });
        this.flash.set(
          res === 'queued'
            ? { type: 'warn', text: 'Offline — saved locally, will sync when back online' }
            : { type: 'ok', text: v.kind === 'income' ? 'Income credited' : 'Expense added' }
        );
      }
      this.formOpen.set(false);
      this.editing.set(null);
      this.cdr.detectChanges();
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      await this.reload();
      this.cdr.detectChanges();
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { error?: string } };
      this.flash.set({
        type: 'err',
        text: e.status === 409 ? 'Conflict: this transaction changed elsewhere. Reload and retry.' : e.error?.error || 'Save failed',
      });
      this.cdr.detectChanges();
    }
  }

  async onRemove(e: Expense): Promise<void> {
    const deleteReq = firstValueFrom(this.api.deleteExpense(e.id));
    this.deletingIds.update((s) => new Set(s).add(e.id));
    this.cdr.detectChanges();

    const prevExpenses = this.expenses();
    const prevTotal = this.total();

    setTimeout(() => {
      this.expenses.set(this.expenses().filter((x) => x.id !== e.id));
      this.total.set(Math.max(0, this.total() - 1));
      this.deletingIds.update((s) => {
        const next = new Set(s);
        next.delete(e.id);
        return next;
      });
      this.cdr.detectChanges();
    }, 240);

    try {
      await deleteReq;
      this.flash.set({ type: 'ok', text: `“${e.categorySnapshot}” (${money(e.amountCents, this.currency())}) deleted` });
      this.cdr.detectChanges();
      setTimeout(() => { if (this.flash()?.type === 'ok') this.flash.set(null); }, 3500);
      await this.reload();
      this.cdr.detectChanges();
    } catch (err: unknown) {
      this.expenses.set(prevExpenses);
      this.total.set(prevTotal);
      this.deletingIds.update((s) => {
        const next = new Set(s);
        next.delete(e.id);
        return next;
      });
      this.cdr.detectChanges();
      const error = err as { error?: { error?: string } };
      this.flash.set({ type: 'err', text: error.error?.error || 'Failed to delete transaction' });
      this.cdr.detectChanges();
      setTimeout(() => { if (this.flash()?.type === 'err') this.flash.set(null); }, 4000);
    }
  }

  onCreateCategory(cat: Category): void {
    const exists = this.categories().some(c => c.id === cat.id);
    if (!exists) {
      this.categories.set([...this.categories(), cat]);
    }
    this.flash.set({ type: 'ok', text: `${cat.icon || '🏷️'} ${cat.name} created` });
  }

  async exportCsv():Promise<void>{this.exportBusy.set(true);try{await this.api.exportCsv(this.filter.filters());}catch{this.flash.set({type:'err',text:'CSV export failed'});}finally{this.exportBusy.set(false);}}
  async exportPdf():Promise<void>{this.exportBusy.set(true);try{await this.api.exportPdf(this.filter.filters());}catch{this.flash.set({type:'err',text:'PDF export failed'});}finally{this.exportBusy.set(false);}}
  private bucket(localDate:string,groupBy:string):string{ if(groupBy==='day')return localDate; if(groupBy==='month')return localDate.slice(0,7); if(groupBy==='year')return localDate.slice(0,4); const t=new Date(localDate+'T00:00:00Z'); const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); return `${t.getUTCFullYear()}-W${pad(Math.floor((t.getUTCDate()-1)/7)+1)}`; }
  private pointsFor(kind:'expense'|'income'|'net'):string{ const series=this.trend(); if(series.length<2)return''; const vals=series.map(([,v])=>kind==='expense'?v.expense:kind==='income'?v.income:Math.max(0,v.net)); const max=Math.max(...vals,1); const w=600,h=140,step=(w-20)/(series.length-1); return vals.map((v,i)=>`${10+i*step},${h-10-(v/max)*(h-30)}`).join(' '); }
  private daysInRange():number{ const r=this.filter.range(); return Math.round((Date.UTC(+r.to.slice(0,4),+r.to.slice(5,7)-1,+r.to.slice(8,10))-Date.UTC(+r.from.slice(0,4),+r.from.slice(5,7)-1,+r.from.slice(8,10)))/86400000)+1; }
  private daysElapsedInRange():number{ const r=this.filter.range(); const from=Date.UTC(+r.from.slice(0,4),+r.from.slice(5,7)-1,+r.from.slice(8,10)); const to=Date.UTC(+r.to.slice(0,4),+r.to.slice(5,7)-1,+r.to.slice(8,10)); const today=new Date(); const t=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()); return Math.min(this.daysInRange(),Math.max(1,Math.round((Math.min(t,to)-from)/86400000)+1)); }
}
