import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { OfflineQueueService } from './core/offline-queue.service';
import { OnboardingService } from './core/onboarding.service';
import { PwaService } from './core/pwa.service';
import { KeepAliveService } from './core/keep-alive.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- PWA Update Notification Banner -->
    <div class="pwa-update-bar" *ngIf="pwa.updateAvailable()">
      <span>🚀 A new update is ready!</span>
      <button class="btn-pwa-update" (click)="pwa.activateUpdate()">Update now</button>
    </div>

    <ng-container *ngIf="auth.isLoggedIn(); else loginOutlet">
      <header class="topbar">
        <div class="brand">
          <span class="logo">◆</span> Expense<span class="accent">Tracker</span>
        </div>
        <div class="topbar-right">
          <button class="ghost install-btn" *ngIf="pwa.canInstall()" (click)="pwa.installApp()" title="Install app on your phone">
            📲 Install
          </button>
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
          <a routerLink="/dashboard" routerLinkActive="active">
            <span class="nav-ico">◫</span>
            <span class="nav-lbl">Dashboard</span>
          </a>
          <a routerLink="/transactions" routerLinkActive="active" data-tour="transactions-nav">
            <span class="nav-ico">📋</span>
            <span class="nav-lbl">Transactions</span>
          </a>
          <a routerLink="/budgets" routerLinkActive="active" data-tour="budgets-nav">
            <span class="nav-ico">◐</span>
            <span class="nav-lbl">Budgets</span>
          </a>
          <a routerLink="/categories" routerLinkActive="active" data-tour="categories-nav">
            <span class="nav-ico">▦</span>
            <span class="nav-lbl">Categories</span>
          </a>
          <a routerLink="/settings" routerLinkActive="active">
            <span class="nav-ico">⚙</span>
            <span class="nav-lbl">Settings</span>
          </a>
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
    .sidenav a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:#94A3B8;
      text-decoration:none; font-size:14px; }
    .sidenav a:hover { background:#1E293B; color:#E2E8F0; }
    .sidenav a.active { background:#1E1B4B; color:#A5B4FC; font-weight:600; }
    .nav-ico { font-size:16px; display:inline-block; }
    .nav-lbl { display:inline-block; }
    .content { flex:1; padding:24px; background:#F1F5F9; min-width:0; }

    @media (max-width: 820px) {
      .shell {
        display: block !important;
        min-height: calc(100vh - 56px) !important;
        padding-bottom: 64px !important;
      }
      .sidenav {
        position: fixed !important;
        bottom: 0 !important;
        top: auto !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: 56px !important;
        max-height: 56px !important;
        z-index: 100 !important;
        background: #0F172A !important;
        border-top: 1px solid #1E293B !important;
        border-bottom: none !important;
        padding: 0 4px !important;
        padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        display: flex !important;
        flex-direction: row !important;
        justify-content: space-around !important;
        align-items: center !important;
        box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.25) !important;
        overflow: visible !important;
      }
      .sidenav a {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
        padding: 4px 2px !important;
        height: 48px !important;
        border-radius: 8px !important;
        font-size: 10px !important;
        color: #94A3B8 !important;
        text-align: center !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
      }
      .sidenav a:hover { background: transparent !important; }
      .sidenav a.active {
        background: rgba(99, 102, 241, 0.18) !important;
        color: #A5B4FC !important;
        font-weight: 600 !important;
      }
      .nav-ico { font-size: 16px !important; }
      .nav-lbl { font-size: 10px !important; }
      .content {
        padding: 14px 10px 24px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .user { display: none !important; }
    }

    @media (max-width: 480px) {
      .topbar { padding: 0 10px !important; height: 50px !important; }
      .brand { font-size: 14px !important; }
      .topbar-right { gap: 4px !important; }
      .topbar-right .ghost { padding: 3px 6px !important; font-size: 11px !important; border-radius: 4px !important; }
      .topbar-right .badge { display: none !important; }
    }

    .pwa-update-bar {
      background: linear-gradient(90deg, #4338CA, #6366F1);
      color: #FFFFFF;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
      position: sticky;
      top: 0;
      z-index: 2000;
      animation: pwaSlideDown 0.25s ease;
    }
    @keyframes pwaSlideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .btn-pwa-update {
      background: #FFFFFF;
      color: #312E81;
      border: none;
      padding: 5px 12px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      transition: background 0.15s ease;
    }
    .btn-pwa-update:hover {
      background: #F1F5F9;
    }
    .install-btn {
      background: rgba(99, 102, 241, 0.2) !important;
      border-color: #818CF8 !important;
      color: #C7D2FE !important;
      font-weight: 600 !important;
    }
    .install-btn:hover {
      background: rgba(99, 102, 241, 0.35) !important;
      color: #FFFFFF !important;
    }
  `],
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly queue = inject(OfflineQueueService);
  readonly onboarding = inject(OnboardingService);
  readonly pwa = inject(PwaService);
  private readonly keepAlive = inject(KeepAliveService);
  /** Theme preference — persisted so the app opens in your chosen mode. */
  readonly dark = signal(readStoredTheme());

  constructor() {
    this.keepAlive.init();
    effect(() => {
      document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
      try { localStorage.setItem('et.theme', this.dark() ? 'dark' : 'light'); } catch { /* private mode */ }
    });
  }

  toggleTheme(): void { this.dark.update((v) => !v); }
  replayTour(): void {
    void this.router.navigate(['/dashboard']).then(() => {
      setTimeout(() => {
        this.onboarding.replay();
      }, 80);
    });
  }
}

function readStoredTheme(): boolean {
  try { return localStorage.getItem('et.theme') === 'dark'; } catch { return false; }
}
