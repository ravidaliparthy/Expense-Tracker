import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface SavingsGoal {
  id: string;
  title: string;
  icon: string;
  targetCents: number;
  currentCents: number;
  deadline?: string;
  color: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoalsService {
  private readonly auth = inject(AuthService);
  readonly goals = signal<SavingsGoal[]>([]);

  readonly createModalRequested = signal(false);

  constructor() {
    // Re-load goals when current user changes
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.loadForUser(user.id);
      } else {
        this.goals.set([]);
      }
    }, { allowSignalWrites: true });
  }

  private storageKey(userId: number): string {
    return `et.goals.${userId}`;
  }

  loadForUser(userId: number): void {
    const user = this.auth.user();
    const isDemo = user?.email === 'demo@expense.test';

    try {
      const raw = localStorage.getItem(this.storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.goals.set(parsed);
          return;
        }
      }
    } catch {
      /* ignore storage error */
    }

    if (isDemo) {
      // Default inspirational starter goals ONLY for demo user (matching picture 3)
      const initial: SavingsGoal[] = [
        {
          id: 'goal-emergency-' + Date.now(),
          title: 'Emergency Fund',
          icon: '🛡️',
          targetCents: 100000, // $1,000.00
          currentCents: 65000,  // $650.00 (65%)
          deadline: new Date(Date.now() + 88 * 86400000).toISOString().slice(0, 10),
          color: '#10B981',
          createdAt: new Date().toISOString()
        },
        {
          id: 'goal-vacation-' + Date.now(),
          title: 'Holiday Getaway',
          icon: '🏖️',
          targetCents: 60000,  // $600.00
          currentCents: 20000,  // $200.00 (33%)
          deadline: new Date(Date.now() + 148 * 86400000).toISOString().slice(0, 10),
          color: '#6366F1',
          createdAt: new Date().toISOString()
        }
      ];
      this.goals.set(initial);
      this.persist();
    } else {
      // For any new or existing non-demo user, do not seed goals
      this.goals.set([]);
    }
  }

  private persist(): void {
    const user = this.auth.user();
    if (!user) return;
    try {
      localStorage.setItem(this.storageKey(user.id), JSON.stringify(this.goals()));
    } catch {
      /* storage quota exceeded or disabled */
    }
  }

  addGoal(item: Omit<SavingsGoal, 'id' | 'createdAt'>): void {
    const newGoal: SavingsGoal = {
      ...item,
      id: 'goal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString()
    };
    this.goals.update(list => [newGoal, ...list]);
    this.persist();
  }

  updateGoal(id: string, patch: Partial<SavingsGoal>): void {
    this.goals.update(list =>
      list.map(g => (g.id === id ? { ...g, ...patch } : g))
    );
    this.persist();
  }

  deposit(id: string, addCents: number): void {
    this.goals.update(list =>
      list.map(g => {
        if (g.id !== id) return g;
        const updated = Math.max(0, g.currentCents + addCents);
        return { ...g, currentCents: updated };
      })
    );
    this.persist();
  }

  deleteGoal(id: string): void {
    this.goals.update(list => list.filter(g => g.id !== id));
    this.persist();
  }
}
