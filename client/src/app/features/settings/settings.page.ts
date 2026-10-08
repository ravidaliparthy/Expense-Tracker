import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
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
    <p class="lede">Choose your preferred display currency and timezone. New transactions and budgets use this currency; historical rows keep their stored currency for integrity.</p>
    <div class="flash {{ f.type }}" *ngIf="flash as f">{{ f.text }}</div>
    <div class="card form">
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
        <button class="btn-primary" (click)="save()" [disabled]="saving">Save settings</button>
      </div>
    </div>
  `,
  styles: [`.lede{color:#64748B;margin-top:0;max-width:700px}.form{max-width:480px}`]
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  readonly currencies = CURRENCIES;
  readonly timezones = COMMON_TIMEZONES;
  saving = false;
  flash: { type: string; text: string } | null = null;
  displayName = this.auth.user()?.displayName || '';
  baseCurrency = this.auth.user()?.baseCurrency || 'USD';
  timezone = this.auth.user()?.timezone || 'Asia/Kolkata';

  async save(): Promise<void> {
    try {
      this.saving = true;
      await this.auth.updateProfile({
        displayName: this.displayName.trim(),
        baseCurrency: this.baseCurrency,
        timezone: this.timezone,
      });
      this.flash = { type: 'ok', text: 'Settings saved — updated across the dashboard' };
    } catch {
      this.flash = { type: 'err', text: 'Could not save settings' };
    } finally {
      this.saving = false;
    }
  }
}
