import { Injectable, computed } from '@angular/core';
import { Expense } from './models';

export interface DayStreakItem {
  date: string;
  shortDay: string;
  hasLogged: boolean;
  isToday: boolean;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  loggedToday: boolean;
  tierName: string;
  tierIcon: string;
  message: string;
  weekDays: DayStreakItem[];
}

@Injectable({
  providedIn: 'root'
})
export class StreakService {
  computeStreak(expenses: Expense[]): StreakInfo {
    const dates = new Set<string>();
    for (const e of expenses) {
      if (e.localDate) {
        dates.add(e.localDate.slice(0, 10));
      }
    }

    const todayStr = this.getLocalDateString(new Date());
    const yesterdayStr = this.getOffsetDateString(new Date(), -1);

    const loggedToday = dates.has(todayStr);
    const loggedYesterday = dates.has(yesterdayStr);

    let currentStreak = 0;
    if (loggedToday) {
      currentStreak = 1;
      let checkDate = yesterdayStr;
      let offset = -2;
      while (dates.has(checkDate)) {
        currentStreak++;
        checkDate = this.getOffsetDateString(new Date(), offset);
        offset--;
      }
    } else if (loggedYesterday) {
      currentStreak = 1;
      let offset = -2;
      let checkDate = this.getOffsetDateString(new Date(), offset);
      while (dates.has(checkDate)) {
        currentStreak++;
        offset--;
        checkDate = this.getOffsetDateString(new Date(), offset);
      }
    } else {
      currentStreak = 0;
    }

    // Compute all-time longest streak
    const sortedDates = [...dates].sort();
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    for (const dStr of sortedDates) {
      const curDate = new Date(dStr + 'T00:00:00Z');
      if (prevDate) {
        const diffMs = curDate.getTime() - prevDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDate = curDate;
    }
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    // Last 7 days visual streak trail
    const weekDays: DayStreakItem[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = this.getLocalDateString(d);
      weekDays.push({
        date: str,
        shortDay: dayNames[d.getDay()],
        hasLogged: dates.has(str),
        isToday: str === todayStr
      });
    }

    // Motivational tier & message
    let tierName = 'Starter';
    let tierIcon = '⚡';
    if (currentStreak >= 30) {
      tierName = 'Monthly Legend';
      tierIcon = '👑';
    } else if (currentStreak >= 14) {
      tierName = 'Fortnight Champion';
      tierIcon = '🌟';
    } else if (currentStreak >= 7) {
      tierName = 'Week Warrior';
      tierIcon = '🚀';
    } else if (currentStreak >= 3) {
      tierName = 'Flame Starter';
      tierIcon = '🔥';
    }

    let message = '';
    if (loggedToday) {
      message = currentStreak > 1
        ? `🔥 ${currentStreak}-day streak active! Great job tracking your money today.`
        : `⚡ Day 1 tracked! Keep tracking tomorrow to build your streak.`;
    } else if (currentStreak > 0) {
      message = `⏳ Keep your ${currentStreak}-day streak alive! Log an expense or income today.`;
    } else {
      message = `🎯 Log your first transaction today to start a new tracking streak!`;
    }

    return {
      currentStreak,
      longestStreak,
      loggedToday,
      tierName,
      tierIcon,
      message,
      weekDays
    };
  }

  private getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getOffsetDateString(d: Date, dayOffset: number): string {
    const target = new Date(d);
    target.setDate(target.getDate() + dayOffset);
    return this.getLocalDateString(target);
  }
}
