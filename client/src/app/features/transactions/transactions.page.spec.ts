import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TransactionsPage } from './transactions.page';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { of } from 'rxjs';
import { Expense } from '../../core/models';
import { By } from '@angular/platform-browser';

describe('TransactionsPage', () => {
  let component: TransactionsPage;
  let fixture: ComponentFixture<TransactionsPage>;
  let apiService: jasmine.SpyObj<ApiService>;

  const mockExpense: Expense = {
    id: 501,
    categoryId: 2,
    categorySnapshot: 'Shopping',
    categoryColor: '#EC4899',
    categoryIcon: '🛍️',
    amountCents: 15000,
    currency: 'USD',
    kind: 'expense',
    occurredAtUtc: '2026-10-08T00:00:00.000Z',
    localDate: '2026-10-08',
    merchant: 'Mega Mall',
    notes: 'Winter jacket',
    clientUuid: '11112222-3333-4444-5555-666677778888',
    syncVersion: 1,
  };

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', [
      'getCategories',
      'getExpenses',
      'updateExpense',
      'deleteExpense',
      'createExpense',
      'exportCsv',
      'exportPdf',
    ]);
    apiSpy.getCategories.and.returnValue(of([{ id: 2, name: 'Shopping', colorHex: '#EC4899', icon: '🛍️', isSystem: false, isArchived: false }]));
    apiSpy.getExpenses.and.returnValue(of({ items: [mockExpense], total: 1, page: 1, pageSize: 200 }));
    apiSpy.deleteExpense.and.returnValue(of(void 0));

    const authSpy = jasmine.createSpyObj('AuthService', ['user']);
    authSpy.user.and.returnValue({ id: 1, email: 'test@example.com', baseCurrency: 'USD' });

    await TestBed.configureTestingModule({
      imports: [TransactionsPage, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionsPage);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    await component.ngOnInit();
    fixture.detectChanges();
  });

  it('should render transaction table with edit and delete buttons', () => {
    const editBtn = fixture.debugElement.query(By.css('#edit-tx-501'));
    const deleteBtn = fixture.debugElement.query(By.css('#delete-tx-501'));

    expect(editBtn).toBeTruthy('Edit button should exist');
    expect(deleteBtn).toBeTruthy('Delete button should exist');
  });

  it('should open edit form on edit button click', () => {
    const editBtn = fixture.debugElement.query(By.css('#edit-tx-501'));
    editBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component.formOpen()).toBeTrue();
    expect(component.editing()?.id).toBe(501);
  });

  it('should filter transactions by search query', () => {
    component.searchQuery.set('Mall');
    fixture.detectChanges();
    expect(component.filteredExpenses().length).toBe(1);

    component.searchQuery.set('NonExistent');
    fixture.detectChanges();
    expect(component.filteredExpenses().length).toBe(0);
  });

  it('should delete transaction on delete button click', fakeAsync(() => {
    const deleteBtn = fixture.debugElement.query(By.css('#delete-tx-501'));
    deleteBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component.deletingIds().has(501)).toBeTrue();

    tick(240);
    tick();

    expect(apiService.deleteExpense).toHaveBeenCalledWith(501);
    expect(component.expenses().length).toBe(0);

    // Flush flash notification timer
    tick(3500);
  }));
});
