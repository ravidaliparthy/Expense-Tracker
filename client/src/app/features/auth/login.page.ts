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
        <h2>{{ mode() === 'login' ? 'Welcome back' : 'Create your account' }}</h2>
        <p class="hint">Budget-aware expense analytics with offline resilience.</p>

        <div class="flash err" *ngIf="error()">{{ error() }}</div>

        <form (ngSubmit)="submit()" #f="ngForm">
          <ng-container *ngIf="mode() === 'register'">
            <label>Display name</label>
            <input name="displayName" [(ngModel)]="displayName" required placeholder="Ravi" />
          </ng-container>
          <label>Email</label>
          <input name="email" type="email" [(ngModel)]="email" required placeholder="you@company.com" />
          <label>Password</label>
          <input name="password" type="password" [(ngModel)]="password" required minlength="8"
                 placeholder="At least 8 characters" />
          <ng-container *ngIf="mode() === 'register'">
            <label>Timezone</label>
            <select name="timezone" [(ngModel)]="timezone">
              <option *ngFor="let tz of timezones" [value]="tz">{{ tz }}</option>
            </select>
          </ng-container>
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="toggle()">
              {{ mode() === 'login' ? 'Need an account?' : 'Have an account?' }}
            </button>
            <button class="btn-primary" [disabled]="f.invalid || busy()">
              {{ mode() === 'login' ? 'Sign in' : 'Create account' }}
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
    .demo { margin-top:14px; font-size:12px; color:#6366F1; cursor:pointer; text-align:center; }
    .demo:hover { text-decoration:underline; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode = signal<'login' | 'register'>('login');
  busy = signal(false);
  error = signal('');

  email = ''; password = ''; displayName = '';
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  timezones = [this.timezone, 'UTC', 'America/New_York', 'America/Los_Angeles',
               'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];

  constructor() {
    if (this.route.snapshot.queryParamMap.get('expired') === '1') {
      this.error.set('Your session has expired. Please sign in again.');
    }
  }

  toggle(): void { this.mode.update((m) => (m === 'login' ? 'register' : 'login')); this.error.set(''); }

  fillDemo(): void { this.mode.set('login'); this.email = 'demo@expense.test'; this.password = 'demo1234'; }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.register(this.email, this.password, this.displayName, this.timezone);
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
      void this.router.navigateByUrl(returnUrl);
    } catch (err: unknown) {
      const e = err as { error?: { error?: string; details?: string[] } };
      const msg = e.error?.details?.join('; ') || e.error?.error || 'Authentication failed';
      if (msg.toLowerCase().includes('invalid email or password')) {
        this.error.set('Invalid email or password. Please verify your password or tap "Need an account?" to register.');
      } else {
        this.error.set(msg);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
