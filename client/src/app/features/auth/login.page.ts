import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="auth-wrap">
      <div class="card auth-card">
        <div class="brand"><span class="logo">◆</span> Expense<span>Tracker</span></div>
        <h2>
          {{ mode() === 'login' ? 'Welcome back' : (mode() === 'register' ? 'Create your account' : 'Reset password') }}
        </h2>
        <p class="hint">Budget-aware expense analytics with offline resilience.</p>

        <div class="flash err" *ngIf="error()">{{ error() }}</div>

        <form (ngSubmit)="submit()" #f="ngForm">
          <ng-container *ngIf="mode() === 'register'">
            <label>Display name</label>
            <input name="displayName" [(ngModel)]="displayName" required placeholder="Ravi" />
          </ng-container>
          <label>Email</label>
          <input name="email" type="email" [(ngModel)]="email" required placeholder="you@company.com" />
          <ng-container *ngIf="mode() === 'forgot'">
            <label>Secret Recovery PIN</label>
            <input name="recoveryPin" type="password" [(ngModel)]="recoveryPin" required
                   placeholder="PIN configured in Settings (demo: demo1234)" />
          </ng-container>
          <label>{{ mode() === 'forgot' ? 'New password' : 'Password' }}</label>
          <input name="password" type="password" [(ngModel)]="password" required minlength="8"
                 placeholder="At least 8 characters" />
          <ng-container *ngIf="mode() === 'register'">
            <label>Secret Recovery PIN <span class="opt-label">(optional, recommended)</span></label>
            <input name="recoveryPin" type="password" [(ngModel)]="recoveryPin"
                   placeholder="4–16 digits or passphrase (e.g. 849201)" />
            <p class="field-hint">Enables zero-dependency password recovery if you ever forget your password.</p>
          </ng-container>
          <ng-container *ngIf="mode() === 'register'">
            <label>Timezone</label>
            <select name="timezone" [(ngModel)]="timezone">
              <option *ngFor="let tz of timezones" [value]="tz">{{ tz }}</option>
            </select>
          </ng-container>
          <div class="session-opts-row">
            <label class="remember-label" title="Uncheck to stay in Session-only mode (logs out when closing browser/tab)">
              <input type="checkbox" [(ngModel)]="rememberMe" name="rememberMe" />
              <span>Remember me on this device</span>
            </label>
            <span *ngIf="mode() === 'login'" class="forgot-link" (click)="setMode('forgot')">Forgot password?</span>
          </div>
          <div class="session-badge-pill">
            <span *ngIf="!rememberMe">🔒 <strong>Session-only (Default):</strong> Logs out automatically when you close the browser tab.</span>
            <span *ngIf="rememberMe">💾 <strong>Remembered:</strong> Stays signed in across browser sessions on this device.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="toggle()">
              {{ mode() === 'login' ? 'Need an account?' : (mode() === 'register' ? 'Have an account?' : 'Back to sign in') }}
            </button>
            <button class="btn-primary" [disabled]="f.invalid || busy()">
              {{ mode() === 'login' ? 'Sign in' : (mode() === 'register' ? 'Create account' : 'Reset & Sign in') }}
            </button>
          </div>
        </form>

        <div class="demo" (click)="fillDemo()">Use demo account: demo&#64;expense.test / demo1234</div>
      </div>
    </div>
  `,
  styles: [`
    .auth-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#312E81 100%); padding:20px; }
    .auth-card { max-width:400px; width:100%; }
    .brand { font-weight:700; font-size:18px; color:#0F172A; margin-bottom:14px; }
    .brand .logo { color:#6366F1; }
    .brand span:last-child { color:#6366F1; }
    h2 { margin:0 0 4px; }
    .hint { color:#64748B; font-size:13px; margin:0 0 10px; }
    .opt-label { font-size:11px; color:#94A3B8; font-weight:normal; margin-left:4px; }
    .field-hint { font-size:11px; color:#64748B; margin:3px 0 10px; line-height:1.35; }
    .session-opts-row { display:flex; justify-content:space-between; align-items:center; margin:-2px 0 10px; font-size:12px; }
    .remember-label { display:flex; align-items:center; gap:6px; color:#475569; cursor:pointer; user-select:none; font-weight:500; }
    .remember-label input { width:auto; margin:0; cursor:pointer; accent-color:#6366F1; }
    .remember-label:hover { color:#1E1B4B; }
    .session-badge-pill { font-size:11.5px; padding:6px 10px; border-radius:6px; background:#F8FAFC; border:1px solid #E2E8F0; color:#64748B; margin-bottom:14px; line-height:1.4; }
    .session-badge-pill strong { color:#334155; }
    .forgot-link { font-size:12px; color:#6366F1; cursor:pointer; }
    .forgot-link:hover { text-decoration:underline; }
    .demo { margin-top:14px; font-size:12px; color:#6366F1; cursor:pointer; text-align:center; }
    .demo:hover { text-decoration:underline; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode = signal<'login' | 'register' | 'forgot'>('login');
  busy = signal(false);
  error = signal('');

  email = ''; password = ''; displayName = ''; recoveryPin = '';
  rememberMe = false;
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  timezones = [this.timezone, 'UTC', 'America/New_York', 'America/Los_Angeles',
               'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];

  constructor() {
    if (this.route.snapshot.queryParamMap.get('expired') === '1') {
      this.error.set('Your session has expired. Please sign in again.');
    }
  }

  setMode(m: 'login' | 'register' | 'forgot'): void { this.mode.set(m); this.error.set(''); }

  toggle(): void {
    if (this.mode() === 'forgot') {
      this.setMode('login');
    } else {
      this.setMode(this.mode() === 'login' ? 'register' : 'login');
    }
  }

  fillDemo(): void {
    this.setMode('login');
    this.email = 'demo@expense.test';
    this.password = 'demo1234';
    this.recoveryPin = 'demo1234';
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password, this.rememberMe);
      } else if (this.mode() === 'register') {
        await this.auth.register(this.email, this.password, this.displayName, this.timezone, this.recoveryPin, this.rememberMe);
      } else {
        await this.auth.resetPassword(this.email, this.recoveryPin, this.password, this.rememberMe);
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
      void this.router.navigateByUrl(returnUrl);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string; details?: string[] } };
      const msg = e.error?.details?.join('; ') || e.error?.error || 'Authentication failed';
      if (msg.toLowerCase().includes('invalid email or password')) {
        this.error.set('Invalid email or password. Please verify your password or tap "Forgot password?" / "Need an account?".');
      } else {
        this.error.set(msg);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
