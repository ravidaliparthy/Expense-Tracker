import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Budget, Category, Expense, ExpensePage, Filters, Insights, TransactionKind } from './models';
import { OfflineQueueService } from './offline-queue.service';
import { safeUuid } from './uuid';

export const DEFAULT_FALLBACK_CATEGORIES: Category[] = [
  { id: 1, name: 'Food', colorHex: '#F97316', icon: '🍔', isSystem: true, isArchived: false },
  { id: 2, name: 'Travel', colorHex: '#3B82F6', icon: '✈️', isSystem: true, isArchived: false },
  { id: 3, name: 'Shopping', colorHex: '#EC4899', icon: '🛍️', isSystem: true, isArchived: false },
  { id: 4, name: 'Utilities', colorHex: '#F59E0B', icon: '💡', isSystem: true, isArchived: false },
  { id: 5, name: 'Health', colorHex: '#10B981', icon: '💊', isSystem: true, isArchived: false },
  { id: 6, name: 'Entertainment', colorHex: '#8B5CF6', icon: '🎬', isSystem: true, isArchived: false },
  { id: 7, name: 'Salary', colorHex: '#22C55E', icon: '💰', isSystem: true, isArchived: false },
  { id: 8, name: 'Freelance', colorHex: '#06B6D4', icon: '🧑‍💻', isSystem: true, isArchived: false },
  { id: 9, name: 'Bonus', colorHex: '#EAB308', icon: '🎉', isSystem: true, isArchived: false },
];

export interface BudgetStatusDto { range: { from: string; to: string }; statuses: import('./budget-status').BudgetStatus[]; }
export interface SummaryDto {
  range: { from: string; to: string };
  expenseCents: number; incomeCents: number; netCents: number; savingsRate: number;
  count: number; expenseCount: number; incomeCount: number; avgExpenseCents: number;
  topCategories: { categoryId: number | null; name: string; icon?: string | null; totalCents: number; count: number }[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private queue = inject(OfflineQueueService);

  getCategories(includeArchived = false): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories', { params: includeArchived ? { includeArchived: 'true' } : {} }).pipe(
      tap((cats) => {
        try {
          if (cats && cats.length) {
            localStorage.setItem('et.categories', JSON.stringify(cats));
          }
        } catch {}
      }),
      catchError(() => {
        try {
          const cached = localStorage.getItem('et.categories');
          if (cached) {
            const list = JSON.parse(cached) as Category[];
            if (list.length) return of(list);
          }
        } catch {}
        return of([...DEFAULT_FALLBACK_CATEGORIES]);
      })
    );
  }
  createCategory(body: { name: string; colorHex: string; icon?: string | null }): Observable<Category> { return this.http.post<Category>('/api/categories', body); }
  updateCategory(id: number, body: Partial<Pick<Category, 'name' | 'colorHex' | 'icon' | 'isArchived'>>): Observable<Category> { return this.http.patch<Category>(`/api/categories/${id}`, body); }
  archiveCategory(id: number, isArchived: boolean): Observable<Category> { return this.updateCategory(id, { isArchived }); }
  deleteCategory(id: number): Observable<void> { return this.http.delete<void>(`/api/categories/${id}`); }

  getExpenses(f: Filters, page = 1, pageSize = 200): Observable<ExpensePage> {
    return this.http.get<ExpensePage>('/api/expenses', { params: this.filterParams(f).set('page', page).set('pageSize', pageSize) });
  }
  async createExpense(body: { clientUuid?: string; amountCents: number; occurredAt: string; categoryId: number | null; kind: TransactionKind; merchant?: string | null; notes?: string | null; }): Promise<{ id: number; status?: string } | 'queued'> {
    try { return await firstValueFrom(this.http.post<{ id: number; status?: string }>('/api/expenses', body)); }
    catch (err) { if (this.isNetworkError(err)) { this.queue.enqueue({ clientUuid: body.clientUuid ?? safeUuid(), op: 'create', payload: body }); return 'queued'; } return throwError(() => err) as never; }
  }
  updateExpense(id: number, body: Record<string, unknown>): Observable<Expense> { return this.http.patch<Expense>(`/api/expenses/${id}`, body); }
  deleteExpense(id: number): Observable<void> { return this.http.delete<void>(`/api/expenses/${id}`); }
  seedSample(): Observable<{ ok: boolean; count: number }> { return this.http.post<{ ok: boolean; count: number }>('/api/expenses/seed-sample', {}); }

  getBudgets(period: 'monthly' | 'yearly', year: number, month: number): Observable<Budget[]> { return this.http.get<Budget[]>('/api/budgets', { params: { period, year, month } }); }
  saveBudget(body: Record<string, unknown>): Observable<Budget> { return this.http.put<Budget>('/api/budgets', body); }
  deleteBudget(id: number): Observable<void> { return this.http.delete<void>(`/api/budgets/${id}`); }

  getSummary(f: Filters): Observable<SummaryDto> { return this.http.get<SummaryDto>('/api/analytics/summary', { params: this.filterParams(f) }); }
  getInsights(f: Filters): Observable<Insights> { return this.http.get<Insights>('/api/analytics/insights', { params: this.filterParams(f) }); }
  getBudgetStatus(f: Filters): Observable<BudgetStatusDto> { return this.http.get<BudgetStatusDto>('/api/analytics/budget-status', { params: this.filterParams({ ...f, kind: 'expense' }) }); }

  async exportCsv(f: Filters): Promise<void> { await this.download('/api/export/csv?' + this.filterParams(f).toString(), 'transactions.csv'); }
  async exportPdf(f: Filters): Promise<void> { await this.download('/api/export/pdf?' + this.filterParams(f).toString(), 'transaction-report.pdf'); }

  private async download(url: string, fallbackName: string): Promise<void> {
    const token = sessionStorage.getItem('et.token') || localStorage.getItem('et.token');
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob(); const cd = res.headers.get('Content-Disposition') || ''; const match = cd.match(/filename="([^"]+)"/);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = match ? match[1] : fallbackName; a.click(); URL.revokeObjectURL(a.href);
  }
  filterParams(f: Filters): HttpParams {
    let p = new HttpParams().set('from', f.from).set('to', f.to);
    if (f.categoryIds.length) p = p.set('categoryIds', f.categoryIds.join(','));
    if (f.kind && f.kind !== 'all') p = p.set('kind', f.kind);
    return p;
  }
  private isNetworkError(err: unknown): boolean {
    return !navigator.onLine || (!!err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 0);
  }
}
