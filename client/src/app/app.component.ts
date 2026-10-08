import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { OfflineQueueService } from './core/offline-queue.service';
import { OnboardingService } from './core/onboarding.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <ng-container *ngIf="auth.isLoggedIn(); else loginOutlet">
      <header class="topbar">
        <div class="brand">
          <span class="logo">◆</span> Expense<span class="accent">Tracker</span>
        </div>
        <div class="topbar-right">
          <span class="badge warn" *ngIf="queue.pending() > 0" title="Changes waiting to sync">
            ⟳ {{ queue.pending() }} pending
          </span>
          <span class="badge off" *ngIf="!queue.online()">● Offline — saving locally</span>
          <button class="ghost" (click)="replayTour()" title="Replay guided tour">✨ Tour</button>
          <button class="ghost" (click)="toggleTheme()" title="Toggle dark mode">{{ dark() ? '☀️ Light' : '🌙 Dark' }}</button>
          <span class="user">{{ auth.user()?.displayName }}</span>
          <button class="ghost" (click)="auth.logout()">Sign out</button>
        </div>
      </header>

      <div class="shell">
        <nav class="sidenav">
          <a routerLink="/dashboard" routerLinkActive="active">◫ Dashboard</a>
          <a routerLink="/transactions" routerLinkActive="active" data-tour="transactions-nav">📋 Transactions</a>
          <a routerLink="/budgets" routerLinkActive="active" data-tour="budgets-nav">◑ Budgets</a>
          <a routerLink="/categories" routerLinkActive="active" data-tour="categories-nav">▦ Categories</a>
          <a routerLink="/settings" routerLinkActive="active">⚙ Settings</a>
        </nav>
        <main class="content">
          <router-outlet />
        </main>
      </div>
    </ng-container>
    <ng-template #loginOutlet>
      <router-outlet />
    </ng-template>
  `,
  styles: [`
    .topbar { display:flex; justify-content:space-between; align-items:center; height:56px;
      padding:0 20px; background:#0F172A; color:#E2E8F0; position:sticky; top:0; z-index:20; }
    .brand { font-weight:700; font-size:16px; letter-spacing:.3px; }
    .logo { color:#6366F1; margin-right:4px; }
    .accent { color:#A5B4FC; }
    .topbar-right { display:flex; align-items:center; gap:12px; font-size:13px; }
    .user { color:#94A3B8; }
    .ghost { background:transparent; border:1px solid #334155; color:#CBD5E1;
      border-radius:6px; padding:5px 10px; cursor:pointer; font-size:13px; }
    .ghost:hover { border-color:#6366F1; color:#fff; }
    .badge { padding:4px 10px; border-radius:999px; font-size:12px; }
    .badge.warn { background:#422006; color:#FBBF24; }
    .badge.off { background:#450A0A; color:#F87171; }
    .shell { display:flex; min-height:calc(100vh - 56px); }
    .sidenav { width:200px; background:#111827; padding:16px 10px; display:flex;
      flex-direction:column; gap:4px; position:sticky; top:56px; height:calc(100vh - 56px); flex-shrink:0; }
    .sidenav a { display:block; padding:10px 14px; border-radius:8px; color:#94A3B8;
      text-decoration:none; font-size:14px; }
    .sidenav a:hover { background:#1E293B; color:#E2E8F0; }
    .sidenav a.active { background:#1E1B4B; color:#A5B4FC; font-weight:600; }
    .content { flex:1; padding:24px; background:#F1F5F9; min-width:0; }
    @media (max-width: 820px) {
      .shell { flex-direction: column; }
      .sidenav { width:100%; flex-direction:row; overflow-x:auto; padding:8px; gap:6px;
        position:sticky; top:56px; z-index:15; }
      .sidenav a { white-space:nowrap; padding:8px 12px; }
      .content { padding:16px; }
      .user { display:none; }
    }
    @media (max-width: 480px) {
      .topbar { padding:0 12px; }
      .brand { font-size:14px; }
      .topbar-right { gap:6px; }
      .topbar-right .ghost { padding:4px 8px; font-size:12px; }
    }
  `],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly queue = inject(OfflineQueueService);
  readonly onboarding = inject(OnboardingService);
  /** Theme preference — persisted so the app opens in your chosen mode. */
  readonly dark = signal(readStoredTheme());

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
      try { localStorage.setItem('et.theme', this.dark() ? 'dark' : 'light'); } catch { /* private mode */ }
    });
  }

  toggleTheme(): void { this.dark.update((v) => !v); }
  replayTour(): void { this.onboarding.replay(); }
}

function readStoredTheme(): boolean {
  try { return localStorage.getItem('et.theme') === 'dark'; } catch { return false; }
}
