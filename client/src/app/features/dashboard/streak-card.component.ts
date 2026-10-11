import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DayStreakItem, StreakInfo } from '../../core/streak.service';

@Component({
  selector: 'app-streak-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card streak-card" [class.logged-today]="streak.loggedToday">
      <div class="streak-left">
        <div class="flame-badge" [class.lit]="streak.currentStreak > 0">
          <span class="flame-ico">🔥</span>
          <span class="streak-num">{{ streak.currentStreak }}</span>
        </div>
        <div class="streak-details">
          <div class="streak-title-row">
            <h4>{{ streak.currentStreak }}-Day Logging Streak</h4>
            <span class="tier-pill">{{ streak.tierIcon }} {{ streak.tierName }}</span>
            <span class="best-pill" *ngIf="streak.longestStreak > 0">Best: {{ streak.longestStreak }}d</span>
          </div>
          <p class="streak-msg">{{ streak.message }}</p>
        </div>
      </div>

      <!-- 7-Day Consistency Dot Trail -->
      <div class="streak-week-trail">
        <div
          class="day-col"
          *ngFor="let d of streak.weekDays"
          [class.today]="d.isToday"
          [class.logged]="d.hasLogged"
          [title]="d.date + (d.hasLogged ? ' (Logged)' : ' (No entry)')"
        >
          <span class="day-lbl">{{ d.shortDay }}</span>
          <div class="day-dot">
            <span class="dot-check" *ngIf="d.hasLogged">✓</span>
            <span class="dot-dash" *ngIf="!d.hasLogged">·</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .streak-card {
      margin-bottom: 16px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      background: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%);
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
    }
    :host-context([data-theme='dark']) .streak-card {
      background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
      border-color: #334155;
    }
    .streak-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .flame-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #FEF3C7;
      border: 1px solid #FDE68A;
      color: #D97706;
      border-radius: 12px;
      padding: 8px 12px;
    }
    .flame-badge.lit {
      background: linear-gradient(135deg, #FFEDD5 0%, #FEE2E2 100%);
      border-color: #FDBA74;
      color: #EA580C;
    }
    :host-context([data-theme='dark']) .flame-badge {
      background: #451A03;
      border-color: #78350F;
      color: #FBBF24;
    }
    :host-context([data-theme='dark']) .flame-badge.lit {
      background: linear-gradient(135deg, #431407 0%, #450A0A 100%);
      border-color: #9A3412;
      color: #FB923C;
    }
    .flame-ico { font-size: 22px; line-height: 1; }
    .streak-num { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }

    .streak-details { display: flex; flex-direction: column; gap: 3px; }
    .streak-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .streak-title-row h4 { margin: 0; font-size: 15px; font-weight: 700; color: #0F172A; }
    :host-context([data-theme='dark']) .streak-title-row h4 { color: #F8FAFC; }
    .tier-pill {
      font-size: 11px;
      font-weight: 700;
      background: rgba(99, 102, 241, 0.12);
      color: #4F46E5;
      padding: 2px 7px;
      border-radius: 999px;
    }
    :host-context([data-theme='dark']) .tier-pill {
      background: rgba(129, 140, 248, 0.2);
      color: #A5B4FC;
    }
    .best-pill {
      font-size: 11px;
      color: #64748B;
      font-weight: 600;
    }
    :host-context([data-theme='dark']) .best-pill { color: #94A3B8; }
    .streak-msg { margin: 0; font-size: 12px; color: #64748B; font-weight: 500; }
    :host-context([data-theme='dark']) .streak-msg { color: #94A3B8; }

    /* 7-day consistency trail */
    .streak-week-trail {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .day-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .day-lbl {
      font-size: 10px;
      font-weight: 600;
      color: #64748B;
      text-transform: uppercase;
    }
    :host-context([data-theme='dark']) .day-lbl { color: #94A3B8; }
    .day-col.today .day-lbl {
      color: #4F46E5;
      font-weight: 800;
    }
    :host-context([data-theme='dark']) .day-col.today .day-lbl { color: #818CF8; }
    .day-dot {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      color: #94A3B8;
    }
    :host-context([data-theme='dark']) .day-dot {
      background: #0F172A;
      border-color: #334155;
      color: #64748B;
    }
    .day-col.logged .day-dot {
      background: #10B981;
      border-color: #059669;
      color: #FFFFFF;
      font-weight: 800;
    }
    .day-col.today .day-dot {
      outline: 2px solid #6366F1;
      outline-offset: 1px;
    }
    .day-col.today.logged .day-dot {
      outline-color: #10B981;
    }
    .dot-check { font-size: 13px; font-weight: 800; }
    .dot-dash { font-size: 16px; line-height: 1; }

    @media (max-width: 640px) {
      .streak-card {
        flex-direction: column;
        align-items: flex-start;
      }
      .streak-week-trail {
        width: 100%;
        justify-content: space-between;
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px solid rgba(226, 232, 240, 0.6);
      }
      :host-context([data-theme='dark']) .streak-week-trail {
        border-top-color: #334155;
      }
    }
  `]
})
export class StreakCardComponent {
  @Input({ required: true }) streak!: StreakInfo;
}
