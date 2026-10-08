import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BudgetsPage } from './budgets.page';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { of } from 'rxjs';
import { Budget, Category } from '../../core/models';
import { BudgetStatus } from '../../core/budget-status';
import { By } from '@angular/platform-browser';

describe('BudgetsPage Edit and Delete Actions', () => {
  let component: BudgetsPage;
  let fixture: ComponentFixture<BudgetsPage>;
  let apiService: jasmine.SpyObj<ApiService>;

  const mockCategories: Category[] = [
    { id: 10, name: 'Entertainment', colorHex: '#8B5CF6', icon: '🎬', isSystem: true, isArchived: false },
    { id: 20, name: 'Groceries', colorHex: '#10B981', icon: '🛒', isSystem: false, isArchived: false },
  ];

  const mockBudgets: Budget[] = [
    {
      id: 101,
      categoryId: 10,
      period: 'monthly',
      periodYear: 2026,
      periodMonth: 10,
      amountCents: 10000000,
      warnPct: 80,
      critPct: 90,
      overPct: 100,
      label: 'Entertainment',
      color: '#8B5CF6',
    },
  ];

  const mockStatus: BudgetStatus = {
    budgetId: 101,
    categoryId: 10,
    label: 'Entertainment',
    limitCents: 10000000,
    spentCents: 0,
    remainingCents: 10000000,
    ratio: 0,
    percentUsed: 0,
    tier: 'ok',
    dailyBurnRateCents: 0,
    projectedSpendCents: 0,
    daysInPeriod: 31,
    daysLeft: 31,
    isProjectionOver: false,
  };

  beforeEach(async () => {
    const apiSpy = jasmine.createSpyObj('ApiService', [
      'getCategories',
      'getBudgets',
      'getBudgetStatus',
      'saveBudget',
      'deleteBudget',
    ]);
    apiSpy.getCategories.and.returnValue(of(mockCategories));
    apiSpy.getBudgets.and.returnValue(of(mockBudgets));
    apiSpy.getBudgetStatus.and.returnValue(of({
      range: { from: '2026-10-01', to: '2026-10-31' },
      statuses: [mockStatus],
    }));
    apiSpy.saveBudget.and.returnValue(of(mockBudgets[0]));
    apiSpy.deleteBudget.and.returnValue(of(void 0));

    const authSpy = jasmine.createSpyObj('AuthService', ['user']);
    authSpy.user.and.returnValue({ id: 1, email: 'test@example.com', baseCurrency: 'INR' });

    await TestBed.configureTestingModule({
      imports: [BudgetsPage, HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetsPage);
    component = fixture.componentInstance;
    apiService = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;
    await component.ngOnInit();
    fixture.detectChanges();
  });

  it('should render budget gauge with edit and delete buttons', () => {
    const editBtn = fixture.debugElement.query(By.css('#edit-budget-101'));
    const deleteBtn = fixture.debugElement.query(By.css('#delete-budget-101'));

    expect(editBtn).toBeTruthy('Edit button must be rendered');
    expect(deleteBtn).toBeTruthy('Delete button must be rendered');
  });

  it('should populate form when Edit button is clicked', () => {
    const editBtn = fixture.debugElement.query(By.css('#edit-budget-101'));
    editBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component.editingBudgetId()).toBe(101);
    expect(component.categoryId).toBe(10);
    expect(component.amount).toBe(100000);
    expect(component.warnPct).toBe(80);
    expect(component.critPct).toBe(90);
    expect(component.overPct).toBe(100);

    // Cancel edit resets form
    component.cancelEdit();
    expect(component.editingBudgetId()).toBeNull();
  });

  it('should smoothly delete budget when Delete button is clicked', fakeAsync(() => {
    const deleteBtn = fixture.debugElement.query(By.css('#delete-budget-101'));
    deleteBtn.nativeElement.click();

    // Check deleting animation state
    expect(component.deletingBudgetIds().has(101)).toBeTrue();

    // Advance 240ms exit animation
    tick(240);
    tick();

    expect(apiService.deleteBudget).toHaveBeenCalledWith(101);
    expect(component.statuses().length).toBe(0);
    expect(component.flash()?.text).toContain('Entertainment');
  }));
});
