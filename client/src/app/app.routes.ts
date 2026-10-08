import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const ROUTES: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPage) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () =>
      import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
  { path: 'transactions', canActivate: [authGuard], loadComponent: () =>
      import('./features/transactions/transactions.page').then((m) => m.TransactionsPage) },
  { path: 'categories', canActivate: [authGuard], loadComponent: () =>
      import('./features/categories/categories.page').then((m) => m.CategoriesPage) },
  { path: 'budgets', canActivate: [authGuard], loadComponent: () =>
      import('./features/budgets/budgets.page').then((m) => m.BudgetsPage) },
  { path: 'settings', canActivate: [authGuard], loadComponent: () =>
      import('./features/settings/settings.page').then((m) => m.SettingsPage) },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
