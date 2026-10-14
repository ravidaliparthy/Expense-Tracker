import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { CURRENCIES } from '../../core/models';

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India - IST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Settings</h1>
    <p class="lede">Manage your regional preferences, currency, account credentials, and secret recovery key.</p>
    
    <div class="flash {{ f.type }}" *ngIf="flash as f">{{ f.text }}</div>

    <div class="settings-grid">
      <!-- General Preferences -->
      <div class="card form">
        <div class="card-header">
          <span class="card-icon">⚙️</span>
          <div>
            <h2 class="card-title">Preferences</h2>
            <p class="card-subtitle">Display currency and timezone configuration</p>
          </div>
        </div>

        <label for="settings-displayName">Display name</label>
        <input id="settings-displayName" name="displayName" [(ngModel)]="displayName" />

        <label for="settings-baseCurrency">Base currency</label>
        <select id="settings-baseCurrency" name="baseCurrency" [(ngModel)]="baseCurrency">
          <option *ngFor="let c of currencies" [value]="c">{{ c }}</option>
        </select>

        <label for="settings-timezone">Timezone</label>
        <select id="settings-timezone" name="timezone" [(ngModel)]="timezone">
          <option *ngFor="let tz of timezones" [value]="tz.value">{{ tz.label }}</option>
        </select>

        <div class="modal-actions">
          <button class="btn-primary" (click)="save()" [disabled]="saving">Save preferences</button>
        </div>
      </div>

      <!-- Security & Password -->
      <div class="card form">
        <div class="card-header">
          <span class="card-icon">🔒</span>
          <div>
            <h2 class="card-title">Change Password</h2>
            <p class="card-subtitle">Update your account login password</p>
          </div>
        </div>

        <label for="settings-currentPass">Current password</label>
        <input id="settings-currentPass" type="password" name="currentPassword" [(ngModel)]="currentPassword" placeholder="Enter current password" />

        <label for="settings-newPass">New password</label>
        <input id="settings-newPass" type="password" name="newPassword" [(ngModel)]="newPassword" placeholder="Minimum 8 characters" />

        <label for="settings-confirmPass">Confirm new password</label>
        <input id="settings-confirmPass" type="password" name="confirmPassword" [(ngModel)]="confirmPassword" placeholder="Re-enter new password" />

        <div class="modal-actions">
          <button class="btn-primary" (click)="changePassword()" [disabled]="changingPass">Update password</button>
        </div>
      </div>

      <!-- Secret Recovery PIN Setup -->
      <div class="card form">
        <div class="card-header">
          <span class="card-icon">🔑</span>
          <div>
            <h2 class="card-title">Secret Recovery PIN</h2>
            <p class="card-subtitle">Zero-dependency password recovery key</p>
          </div>
        </div>

        <div class="pin-status" [class.configured]="auth.user()?.hasRecoveryPin">
          <span *ngIf="auth.user()?.hasRecoveryPin">✔ Recovery PIN is active & secured (bcrypt hashed)</span>
          <span *ngIf="!auth.user()?.hasRecoveryPin">⚠️ No Recovery PIN set — configure one to enable self-recovery</span>
        </div>

        <p class="pin-desc">This secret PIN is required to reset your password if you are ever locked out, replacing third-party email dependencies with cryptographic privacy.</p>

        <label for="settings-recoveryPin">Secret PIN (4–16 digits or characters)</label>
        <input id="settings-recoveryPin" type="password" name="recoveryPin" [(ngModel)]="recoveryPin" placeholder="e.g. 849201 or secret-phrase" />

        <div class="modal-actions">
          <button class="btn-secondary" (click)="savePin()" [disabled]="savingPin">Save recovery PIN</button>
        </div>
      </div>

      <!-- Session & Device Security -->
      <div class="card form">
        <div class="card-header">
          <span class="card-icon">🛡️</span>
          <div>
            <h2 class="card-title">Session & Device Security</h2>
            <p class="card-subtitle">Manage browser session persistence and account logout</p>
          </div>
        </div>

        <div class="session-info-box">
          <div class="session-info-row">
            <span class="info-label">Active Account:</span>
            <span class="info-val"><strong>{{ auth.user()?.displayName }}</strong></span>
          </div>
          <div class="session-info-row">
            <span class="info-label">Email:</span>
            <span class="info-val">{{ auth.user()?.email }}</span>
          </div>
          <div class="session-info-row">
            <span class="info-label">Session Mode:</span>
            <span class="badge-status" [class.badge-session-only]="!auth.isRemembered()">
              {{ auth.isRemembered() ? '💾 Remembered on device' : '⏱ Session-only (auto-logout on close)' }}
            </span>
          </div>
        </div>

        <p class="pin-desc">
          In <strong>Session-only mode</strong>, closing your browser window or tab will automatically end your session and log you out. Recommended for shared devices and maximum privacy.
        </p>

        <div class="session-action-group">
          <button type="button" class="btn-secondary" (click)="toggleSessionPersistence()">
            {{ auth.isRemembered() ? 'Switch to Session-only mode' : 'Keep me signed in on this device' }}
          </button>
        </div>

        <div class="danger-zone">
          <button type="button" class="btn-danger" (click)="auth.logout()">
            🚪 Sign Out of ExpenseTracker
          </button>
        </div>
      </div>

      <!-- Data Portability & GDPR Archive -->
      <div class="card form">
        <div class="card-header">
          <span class="card-icon">📦</span>
          <div>
            <h2 class="card-title">Data Portability</h2>
            <p class="card-subtitle">Export your complete data archive</p>
          </div>
        </div>

        <p class="pin-desc">Download a comprehensive, machine-readable JSON backup containing all your transactions, custom categories, budgets, recurring bills, and preferences.</p>

        <div class="modal-actions">
          <button class="btn-secondary" (click)="downloadFullArchive()" [disabled]="exportingArchive">
            {{ exportingArchive ? 'Exporting...' : '⤓ Download Full Data Backup (JSON)' }}
          </button>
        </div>
      </div>

      <!-- Account Deletion Danger Zone -->
      <div class="card form danger-card">
        <div class="card-header">
          <span class="card-icon">⚠️</span>
          <div>
            <h2 class="card-title text-danger">Delete Account</h2>
            <p class="card-subtitle">Permanently erase your account and all data</p>
          </div>
        </div>

        <p class="pin-desc">Permanent deletion is irreversible. All transactions, recurring bills, budgets, and categories will be wiped in accordance with privacy regulations.</p>

        <div *ngIf="confirmingDelete" class="delete-confirm-box">
          <label for="delete-password">Confirm your password to proceed</label>
          <input id="delete-password" type="password" [(ngModel)]="deletePassword" placeholder="Enter password to confirm" />
          <div class="confirm-actions">
            <button class="btn-secondary" (click)="confirmingDelete = false; deletePassword = ''">Cancel</button>
            <button class="btn-danger" [disabled]="!deletePassword || deletingAccount" (click)="executeDeleteAccount()">
              {{ deletingAccount ? 'Deleting...' : 'Permanently Delete Everything' }}
            </button>
          </div>
        </div>

        <div *ngIf="!confirmingDelete" class="modal-actions">
          <button class="btn-danger" (click)="confirmingDelete = true">
            🗑 Delete My Account
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lede { color: #64748B; margin-top: 0; max-width: 700px; margin-bottom: 24px; font-size: 14px; }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: start; }
    .card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 232, 240, 0.85);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 6px 16px -2px rgba(15, 23, 42, 0.03);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px -4px rgba(15, 23, 42, 0.08);
    }
    .danger-card { border-color: rgba(239, 68, 68, 0.35); }
    .text-danger { color: #DC2626 !important; }
    .card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .card-icon { font-size: 24px; }
    .card-title { margin: 0; font-size: 1.15rem; font-weight: 700; color: #0F172A; }
    .card-subtitle { margin: 2px 0 0; font-size: 0.82rem; color: #64748B; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-top: 14px; margin-bottom: 6px; }
    input, select {
      width: 100%; box-sizing: border-box; padding: 10px 14px;
      background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 9px;
      color: #0F172A; font-size: 0.95rem; font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    input:focus, select:focus {
      outline: none; border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    .modal-actions { margin-top: 24px; display: flex; justify-content: flex-end; }
    .btn-primary {
      background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
      color: #FFFFFF; border: none; border-radius: 9px; padding: 10px 20px;
      font-weight: 600; cursor: pointer; transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #4F46E5 0%, #4338CA 100%);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.5);
      transform: translateY(-1.5px);
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-secondary {
      background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1;
      border-radius: 9px; padding: 10px 18px; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-secondary:hover { background: #E2E8F0; color: #0F172A; border-color: #94A3B8; }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
    .pin-status {
      padding: 10px 14px; border-radius: 9px; font-size: 0.85rem; margin-bottom: 12px;
      background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;
    }
    .pin-status.configured {
      background: #ECFDF5; color: #065F46; border-color: #6EE7B7;
    }
    .pin-desc { font-size: 0.82rem; color: #64748B; line-height: 1.45; margin: 0 0 14px; }
    .session-info-box {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;
      padding: 12px 14px; margin-bottom: 12px;
    }
    .session-info-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-bottom: 8px; }
    .session-info-row:last-child { margin-bottom: 0; }
    .info-label { color: #64748B; font-weight: 500; }
    .info-val { color: #0F172A; }
    .badge-status {
      padding: 3px 9px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      background: #DCFCE7; color: #166534; border: 1px solid #86EFAC;
    }
    .badge-status.badge-session-only {
      background: #FEF3C7; color: #92400E; border-color: #FCD34D;
    }
    .session-action-group { margin-top: 10px; margin-bottom: 16px; }
    .danger-zone { border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 16px; display: flex; justify-content: flex-end; }
    .delete-confirm-box { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
    .btn-danger {
      background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;
      border-radius: 9px; padding: 10px 18px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;
    }
    .btn-danger:hover { background: #DC2626; color: #FFFFFF; border-color: #DC2626; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .flash { padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; font-size: 0.9rem; font-weight: 500; }
    .flash.ok { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
    .flash.err { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }

    /* Dark Mode Theming */
    :host-context([data-theme='dark']) .card {
      background: rgba(17, 24, 39, 0.88);
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45);
    }
    :host-context([data-theme='dark']) .card:hover {
      border-color: rgba(255, 255, 255, 0.15);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 14px 32px rgba(0, 0, 0, 0.55);
    }
    :host-context([data-theme='dark']) .card-title { color: #F8FAFC; }
    :host-context([data-theme='dark']) .card-subtitle { color: #94A3B8; }
    :host-context([data-theme='dark']) label { color: #CBD5E1; }
    :host-context([data-theme='dark']) input,
    :host-context([data-theme='dark']) select {
      background: rgba(15, 23, 42, 0.7);
      border-color: rgba(255, 255, 255, 0.12);
      color: #F8FAFC;
    }
    :host-context([data-theme='dark']) input:focus,
    :host-context([data-theme='dark']) select:focus {
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.28);
    }
    :host-context([data-theme='dark']) .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #F8FAFC;
      border-color: rgba(255, 255, 255, 0.15);
    }
    :host-context([data-theme='dark']) .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    :host-context([data-theme='dark']) .pin-status {
      background: rgba(234, 179, 8, 0.15); color: #FDE047; border-color: rgba(234, 179, 8, 0.3);
    }
    :host-context([data-theme='dark']) .pin-status.configured {
      background: rgba(34, 197, 94, 0.15); color: #86EFAC; border-color: rgba(34, 197, 94, 0.3);
    }
    :host-context([data-theme='dark']) .pin-desc { color: #94A3B8; }
    :host-context([data-theme='dark']) .session-info-box {
      background: rgba(15, 23, 42, 0.6); border-color: rgba(255, 255, 255, 0.08);
    }
    :host-context([data-theme='dark']) .info-label { color: #94A3B8; }
    :host-context([data-theme='dark']) .info-val { color: #E2E8F0; }
    :host-context([data-theme='dark']) .badge-status {
      background: rgba(34, 197, 94, 0.2); color: #86EFAC; border-color: rgba(34, 197, 94, 0.3);
    }
    :host-context([data-theme='dark']) .badge-status.badge-session-only {
      background: rgba(234, 179, 8, 0.2); color: #FDE047; border-color: rgba(234, 179, 8, 0.3);
    }
    :host-context([data-theme='dark']) .danger-zone { border-top-color: rgba(255, 255, 255, 0.08); }
    :host-context([data-theme='dark']) .btn-danger {
      background: rgba(239, 68, 68, 0.15); color: #FCA5A5; border-color: rgba(239, 68, 68, 0.35);
    }
    :host-context([data-theme='dark']) .btn-danger:hover {
      background: #EF4444; color: #FFFFFF; border-color: #EF4444;
    }
    :host-context([data-theme='dark']) .text-danger { color: #F87171 !important; }
  `]
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly currencies = CURRENCIES;
  readonly timezones = COMMON_TIMEZONES;

  saving = false;
  changingPass = false;
  savingPin = false;
  exportingArchive = false;
  deletingAccount = false;
  confirmingDelete = false;
  deletePassword = '';
  flash: { type: string; text: string } | null = null;

  displayName = this.auth.user()?.displayName || '';
  baseCurrency = this.auth.user()?.baseCurrency || 'USD';
  timezone = this.auth.user()?.timezone || 'Asia/Kolkata';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  recoveryPin = '';

  async save(): Promise<void> {
    try {
      this.saving = true;
      await this.auth.updateProfile({
        displayName: this.displayName.trim(),
        baseCurrency: this.baseCurrency,
        timezone: this.timezone,
      });
      this.flash = { type: 'ok', text: 'Preferences saved — updated across the dashboard' };
    } catch {
      this.flash = { type: 'err', text: 'Could not save preferences' };
    } finally {
      this.saving = false;
    }
  }

  async changePassword(): Promise<void> {
    if (!this.currentPassword || !this.newPassword) {
      this.flash = { type: 'err', text: 'Please fill in current and new password' };
      return;
    }
    if (this.newPassword.length < 8) {
      this.flash = { type: 'err', text: 'New password must be at least 8 characters' };
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.flash = { type: 'err', text: 'New passwords do not match' };
      return;
    }

    try {
      this.changingPass = true;
      await this.auth.changePassword(this.currentPassword, this.newPassword);
      this.flash = { type: 'ok', text: 'Password successfully updated' };
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (err: any) {
      const msg = err?.error?.error || 'Failed to update password. Check your current password.';
      this.flash = { type: 'err', text: msg };
    } finally {
      this.changingPass = false;
    }
  }

  async savePin(): Promise<void> {
    const trimmed = this.recoveryPin.trim();
    if (trimmed.length < 4 || trimmed.length > 16) {
      this.flash = { type: 'err', text: 'Recovery PIN must be between 4 and 16 characters' };
      return;
    }

    try {
      this.savingPin = true;
      await this.auth.setRecoveryPin(trimmed);
      this.flash = { type: 'ok', text: 'Secret Recovery PIN saved and secured' };
      this.recoveryPin = '';
    } catch (err: any) {
      const msg = err?.error?.error || 'Failed to save Secret Recovery PIN';
      this.flash = { type: 'err', text: msg };
    } finally {
      this.savingPin = false;
    }
  }

  toggleSessionPersistence(): void {
    const current = this.auth.isRemembered();
    this.auth.setRememberMe(!current);
    this.flash = {
      type: 'ok',
      text: !current
        ? 'Session persistence enabled — your session will be remembered across browser restarts.'
        : 'Session-only mode active — closing your browser window or tab will log you out automatically.'
    };
  }

  async downloadFullArchive(): Promise<void> {
    try {
      this.exportingArchive = true;
      await this.api.exportFullArchive();
      this.flash = { type: 'ok', text: 'Full data backup downloaded successfully' };
    } catch {
      this.flash = { type: 'err', text: 'Failed to download data archive' };
    } finally {
      this.exportingArchive = false;
    }
  }

  executeDeleteAccount(): void {
    if (!this.deletePassword) return;
    this.deletingAccount = true;
    this.api.deleteAccount(this.deletePassword).subscribe({
      next: () => {
        this.deletingAccount = false;
        this.auth.logout();
      },
      error: (err: any) => {
        this.deletingAccount = false;
        const msg = err?.error?.error || 'Incorrect password. Account deletion aborted.';
        this.flash = { type: 'err', text: msg };
      }
    });
  }
}
