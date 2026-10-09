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
    <!-- Cold-Start Wakeup Notification Banner -->
    <div class="cold-start-banner" *ngIf="keepAlive.wakingUp()">
      <span class="cold-start-icon">⚡</span>
      <span>Connecting to cloud server... (Render instance waking up from sleep)</span>
    </div>

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
          <button class="ghost btn-topbar-signout" (click)="auth.logout()" title="Sign out and end session">
            <span>🚪</span> Sign out
          </button>
        </div>
      </header>

      <div class="shell">
        <nav class="sidenav">
          <div class="sidenav-links">
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
          </div>

          <!-- PC Desktop Sidenav Footer: User badge & dedicated Sign Out option -->
          <div class="sidenav-pc-footer">
            <div class="sidenav-user-card" *ngIf="auth.user() as u" [title]="u.email">
              <div class="user-avatar-badge">{{ u.displayName ? u.displayName[0].toUpperCase() : 'U' }}</div>
              <div class="user-meta">
                <span class="user-name">{{ u.displayName }}</span>
                <span class="session-badge" [class.session-only]="!auth.isRemembered()">
                  {{ auth.isRemembered() ? '● Remembered' : '⏱ Session only' }}
                </span>
              </div>
            </div>
            <button class="pc-signout-btn" (click)="auth.logout()" title="Sign out of your account and end session">
              <span class="nav-ico">🚪</span>
              <span class="nav-lbl">Sign Out</span>
            </button>
          </div>
        </nav>
        <main class="content">
          <router-outlet />
        </main>
      </div>

      <!-- iOS PWA Installation Guidance Modal -->
      <div class="ios-modal-backdrop" *ngIf="pwa.showIosInstructions()" (click)="pwa.closeIosInstructions()">
        <div class="ios-modal-sheet" (click)="$event.stopPropagation()">
          <div class="ios-modal-handle"></div>
          <div class="ios-modal-header">
            <div class="ios-modal-icon">📲</div>
            <div class="ios-modal-title-wrap">
              <h3>Install ExpenseTracker</h3>
              <p class="ios-modal-subtitle">Run full-screen on your iPhone home screen</p>
            </div>
            <button class="ios-modal-close" (click)="pwa.closeIosInstructions()">✕</button>
          </div>

          <div class="ios-modal-body">
            <div class="ios-warning-banner" *ngIf="pwa.isIosChrome()">
              <span class="ios-warn-icon">ℹ️</span>
              <div>
                <strong>Using Chrome on iPhone?</strong>
                <p>Apple only allows Home Screen app installation from <strong>Safari</strong>. Open this link in Safari to install.</p>
              </div>
            </div>

            <div class="ios-copy-box" *ngIf="pwa.isIosChrome()">
              <button class="btn-copy-link" (click)="pwa.copyAppLink()">
                {{ pwa.copiedLink() ? '✓ Copied! Open Safari and paste' : '📋 Copy App Link for Safari' }}
              </button>
            </div>

            <div class="ios-steps-list">
              <div class="ios-step-item" *ngIf="pwa.isIosChrome()">
                <div class="step-num">1</div>
                <div class="step-desc">Open <strong>Safari</strong> on your iPhone and paste the link.</div>
              </div>
              <div class="ios-step-item">
                <div class="step-num">{{ pwa.isIosChrome() ? '2' : '1' }}</div>
                <div class="step-desc">Tap the <strong>Share</strong> button <span class="share-icon-badge">⎋</span> at the bottom of Safari.</div>
              </div>
              <div class="ios-step-item">
                <div class="step-num">{{ pwa.isIosChrome() ? '3' : '2' }}</div>
                <div class="step-desc">Scroll down and tap <span class="action-highlight">⊞ Add to Home Screen</span>.</div>
              </div>
              <div class="ios-step-item">
                <div class="step-num">{{ pwa.isIosChrome() ? '4' : '3' }}</div>
                <div class="step-desc">Tap <strong>Add</strong> in the top-right corner — done! 🎉</div>
              </div>
            </div>

            <div class="ios-modal-footer">
              <button class="btn-primary" style="width:100%" (click)="pwa.closeIosInstructions()">Got it</button>
            </div>
          </div>
        </div>
      </div>
    </ng-container>
    <ng-template #loginOutlet>
      <router-outlet />
    </ng-template>
  `,
  styles: [`
    .cold-start-banner {
      background: linear-gradient(90deg, #1E1B4B 0%, #312E81 50%, #1E1B4B 100%);
      color: #E0E7FF;
      border-bottom: 1px solid rgba(99, 102, 241, 0.4);
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .cold-start-icon { font-size: 14px; animation: bounce 1s infinite alternate; }
    @keyframes bounce { from { transform: scale(0.9); } to { transform: scale(1.15); } }
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
    .sidenav { width:210px; background:#111827; padding:16px 12px; display:flex;
      flex-direction:column; justify-content:space-between; position:sticky; top:56px; height:calc(100vh - 56px); flex-shrink:0; box-sizing:border-box; }
    .sidenav-links { display:flex; flex-direction:column; gap:4px; }
    .sidenav a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:#94A3B8;
      text-decoration:none; font-size:14px; }
    .sidenav a:hover { background:#1E293B; color:#E2E8F0; }
    .sidenav a.active { background:#1E1B4B; color:#A5B4FC; font-weight:600; }
    .nav-ico { font-size:16px; display:inline-block; }
    .nav-lbl { display:inline-block; }
    .sidenav-pc-footer { display:flex; flex-direction:column; gap:10px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.08); }
    .sidenav-user-card { display:flex; align-items:center; gap:10px; padding:8px 10px; background:rgba(30,41,59,0.5); border:1px solid rgba(255,255,255,0.06); border-radius:8px; }
    .user-avatar-badge { width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#6366F1,#4F46E5); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .user-meta { display:flex; flex-direction:column; min-width:0; overflow:hidden; }
    .user-name { color:#E2E8F0; font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .session-badge { font-size:10.5px; color:#10B981; font-weight:500; }
    .session-badge.session-only { color:#F59E0B; }
    .pc-signout-btn { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border-radius:8px; border:1px solid rgba(239,68,68,0.25); background:rgba(239,68,68,0.08); color:#F87171; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; text-align:left; box-sizing:border-box; }
    .pc-signout-btn:hover { background:rgba(239,68,68,0.22); border-color:#EF4444; color:#fff; }
    .btn-topbar-signout { border-color:rgba(239,68,68,0.35); color:#FCA5A5; display:inline-flex; align-items:center; gap:5px; }
    .btn-topbar-signout:hover { background:rgba(239,68,68,0.18); border-color:#EF4444; color:#fff; }
    .content { flex:1; padding:24px; background:#F1F5F9; min-width:0; }

    @media (max-width: 820px) {
      .sidenav-pc-footer { display: none !important; }
      .sidenav-links {
        display: flex !important;
        flex-direction: row !important;
        justify-content: space-around !important;
        align-items: center !important;
        width: 100% !important;
      }
      .shell {
        display: block !important;
        min-height: calc(100vh - 56px) !important;
        padding-bottom: calc(85px + env(safe-area-inset-bottom, 0px)) !important;
      }
      .sidenav {
        position: fixed !important;
        bottom: 0 !important;
        top: auto !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: auto !important;
        min-height: 56px !important;
        z-index: 100 !important;
        background: #0F172A !important;
        border-top: 1px solid #1E293B !important;
        border-bottom: none !important;
        padding: 4px 4px max(6px, env(safe-area-inset-bottom, 0px)) !important;
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

    /* iOS Install Guidance Bottom Sheet */
    .ios-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      animation: fadeIn 0.2s ease;
    }
    .ios-modal-sheet {
      background: #FFFFFF;
      width: 100%;
      max-width: 480px;
      border-radius: 20px 20px 0 0;
      padding: 16px 20px calc(24px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.25);
      animation: sheetSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
    }
    :host-context([data-theme='dark']) .ios-modal-sheet {
      background: #1E293B;
      color: #F1F5F9;
      border-top: 1px solid #334155;
    }
    @keyframes sheetSlideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .ios-modal-handle {
      width: 38px;
      height: 4px;
      background: #CBD5E1;
      border-radius: 999px;
      margin: 0 auto 14px;
    }
    .ios-modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      position: relative;
    }
    .ios-modal-icon {
      font-size: 32px;
      line-height: 1;
    }
    .ios-modal-title-wrap h3 {
      margin: 0 0 2px;
      font-size: 17px;
      font-weight: 700;
    }
    .ios-modal-subtitle {
      margin: 0;
      font-size: 12px;
      color: #64748B;
    }
    .ios-modal-close {
      margin-left: auto;
      background: #F1F5F9;
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 12px;
      cursor: pointer;
      color: #64748B;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    :host-context([data-theme='dark']) .ios-modal-close {
      background: #334155;
      color: #94A3B8;
    }
    .ios-warning-banner {
      display: flex;
      gap: 10px;
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #1E40AF;
      line-height: 1.4;
    }
    .ios-warning-banner strong {
      display: block;
      margin-bottom: 2px;
      font-size: 13px;
    }
    .ios-warning-banner p {
      margin: 0;
    }
    .ios-warn-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
    .ios-copy-box {
      margin-bottom: 14px;
    }
    .btn-copy-link {
      width: 100%;
      padding: 10px;
      background: #EEF2FF;
      border: 1px dashed #6366F1;
      border-radius: 8px;
      color: #4F46E5;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .btn-copy-link:hover {
      background: #E0E7FF;
    }
    .ios-steps-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
    }
    .ios-step-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #6366F1;
      color: #FFFFFF;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .step-desc {
      color: #334155;
      line-height: 1.4;
    }
    :host-context([data-theme='dark']) .step-desc {
      color: #CBD5E1;
    }
    .share-icon-badge {
      display: inline-block;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      border-radius: 4px;
      padding: 1px 5px;
      font-weight: bold;
      color: #2563EB;
      font-size: 14px;
    }
    .action-highlight {
      font-weight: 600;
      color: #4F46E5;
    }
  `],
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly queue = inject(OfflineQueueService);
  readonly onboarding = inject(OnboardingService);
  readonly pwa = inject(PwaService);
  readonly keepAlive = inject(KeepAliveService);
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
