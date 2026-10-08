import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardPage } from './dashboard.page';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ApiService } from '../../core/api.service';
import { of } from 'rxjs';
import { Expense } from '../../core/models';
import { By } from '@angular/platform-browser';

describe('DashboardPage Actions', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;
  let apiService: jasmine.SpyObj<ApiService>;

  const mockExpense: Expense = {
    id: 999,
    categoryId: 1,
    categorySnapshot: 'Food',
    categoryColor: '#F97316',
    categoryIcon: '🍔',
    amountCents: 5000,
    currency: 'USD',
    kind: 'expense',
    occurredAtUtc: '2026-10-08T00:00:00.000Z',
    localDate: '2026-10-08',
    merchant: 'Test Shop',
    notes: 'Test Notes',
    clientUuid: '12345678-1234-1234-1234-123456789abc',
    syncVersion: 1,
  };

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', [
      'getCategories',
      'getExpenses',
      'getBudgets',
      'getSummary',
      'getInsights',
      'deleteExpense',
      'updateExpense',
      'createExpense',
    ]);
    apiSpy.getCategories.and.returnValue(of([{ id: 1, name: 'Food', colorHex: '#F97316', icon: '🍔', isSystem: true, isArchived: false }]));
    apiSpy.getExpenses.and.returnValue(of({ items: [mockExpense], total: 1, page: 1, pageSize: 200 }));
    apiSpy.getBudgets.and.returnValue(of([]));
    apiSpy.getSummary.and.returnValue(of(null as any));
    apiSpy.getInsights.and.returnValue(of(null as any));
    apiSpy.deleteExpense.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [DashboardPage, HttpClientTestingModule, RouterTestingModule],
      providers: [{ provide: ApiService, useValue: apiSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    fixture.detectChanges();
  });

  it('should render table with edit and delete buttons and trigger handlers on click', async () => {
    component.expenses.set([mockExpense]);
    component.total.set(1);
    fixture.detectChanges();

    const editBtn = fixture.debugElement.query(By.css('#edit-tx-999'));
    const deleteBtn = fixture.debugElement.query(By.css('#delete-tx-999'));

    expect(editBtn).toBeTruthy('Edit button should exist');
    expect(deleteBtn).toBeTruthy('Delete button should exist');

    // Test Edit Button Click
    spyOn(component, 'openEdit').and.callThrough();
    editBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component.openEdit).toHaveBeenCalledWith(mockExpense);
    expect(component.formOpen()).toBeTrue();
    expect(component.editing()).toEqual(jasmine.objectContaining({ id: 999 }));

    // Verify modal is open in DOM
    const modal = fixture.debugElement.query(By.css('app-expense-form'));
    expect(modal).toBeTruthy('Expense form modal should be in DOM');

    // Test Delete Button Click
    spyOn(component, 'onRemove').and.callThrough();
    deleteBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component.onRemove).toHaveBeenCalledWith(mockExpense);
    expect(apiService.deleteExpense).toHaveBeenCalledWith(999);
  });
});
