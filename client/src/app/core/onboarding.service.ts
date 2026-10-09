import { Injectable, signal, computed } from '@angular/core';

const STEP_KEY = 'onboarding.step';       // -1 inactive, 0..4 steps, 5 done
const SKIPPED_KEY = 'onboarding.skipped';

export interface TourStep {
  title: string;
  body: string;
  target: string;                          // CSS selector to spotlight
  cta: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: '✨ 1 · Log Expenses & Income',
    body: 'Quickly record transactions with merchant, category, date, and notes. Offline mode is built-in — any transactions logged without internet sync automatically when you reconnect.',
    target: '[data-tour="add-expense"]',
    cta: 'Next',
  },
  {
    title: '📅 2 · Smart Filters & 10-Year Range',
    body: 'Filter transactions with 1-click presets ("Today", "This week", "This month") or jump across the 10-Year Period menu. Switch chart view grouping between Day, Week, and Month in real time.',
    target: '[data-tour="filter-bar"]',
    cta: 'Next',
  },
  {
    title: '📊 3 · Deep Spending Breakdown & Drill-Downs',
    body: 'Inspect cashflow by Day of Week, Week, Month, or Year. Drill down into specific weeks to inspect day-by-day sub-totals with smooth bar graphs.',
    target: '[data-tour="spending-breakdown"]',
    cta: 'Next',
  },
  {
    title: '↕️ 4 · Instant Sorting & Quick Edits',
    body: 'Sort instantly by Date (Newest/Oldest) or Amount (High/Low). Inline action buttons let you edit details or delete entries directly from the table.',
    target: '[data-tour="transactions-table"]',
    cta: 'Next',
  },
  {
    title: '◐ 5 · Smart Budget Guardrails',
    body: 'Set category spending limits. Live visual gauges alert you in yellow and red when you hit 80%, 90%, and 100% of your allocated budget.',
    target: '[data-tour="budgets-nav"]',
    cta: 'Next',
  },
  {
    title: '⤓ 6 · Instant PDF & CSV Reports',
    body: 'Export spreadsheet-ready CSV tables or download formatted PDF summaries matching your active filters anytime for tax prep or archiving.',
    target: '[data-tour="export-menu"]',
    cta: 'Next',
  },
  {
    title: '🛡️ 7 · Session Security & Auto-Logout',
    body: 'Default Session Mode automatically logs you out when you close your browser or tab for maximum privacy on shared PCs. Easily toggle Remember Me or click Sign Out anytime.',
    target: '[data-tour="session-controls"]',
    cta: 'Next',
  },
  {
    title: '⚙️ 8 · Settings, Recovery PIN & Offline PWA',
    body: 'Configure your Secret Recovery PIN for zero-dependency password resets, switch currency/timezone, toggle Dark Mode, or install as a full-screen PWA on mobile.',
    target: '[data-tour="settings-nav"]',
    cta: 'Finish tour 🎉',
  },
];

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  /** -1 = not started, 0..N-1 = active step, N = complete */
  private readonly _step = signal<number>(Number(localStorage.getItem(STEP_KEY) ?? -1));
  // Signal-backed (NOT a computed over localStorage — localStorage isn't reactive,
  // so a computed would cache `false` forever and the Skip button would appear dead).
  private readonly _skipped = signal<boolean>(localStorage.getItem(SKIPPED_KEY) === '1');

  readonly step = this._step.asReadonly();
  readonly skipped = this._skipped.asReadonly();
  readonly active = computed(() => this._step() >= 0 && this._step() < TOUR_STEPS.length);
  readonly currentStep = computed(() => TOUR_STEPS[Math.max(0, Math.min(this._step(), TOUR_STEPS.length - 1))]);
  readonly done = computed(() => this._step() >= TOUR_STEPS.length);

  start(): void {
    this._step.set(0);
    this._skipped.set(false);
    localStorage.removeItem(SKIPPED_KEY);
    this.persist();
  }

  goTo(stepIndex: number): void {
    if (stepIndex >= 0 && stepIndex < TOUR_STEPS.length) {
      this._step.set(stepIndex);
      this.persist();
    }
  }

  next(): void {
    const next = this._step() + 1;
    this._step.set(next);
    if (next >= TOUR_STEPS.length) {
      void fetch('/api/auth/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...((sessionStorage.getItem('et.token') || localStorage.getItem('et.token'))
            ? { Authorization: `Bearer ${sessionStorage.getItem('et.token') || localStorage.getItem('et.token')}` } : {}),
        },
      }).catch(() => undefined);
    }
    this.persist();
  }

  prev(): void {
    if (this._step() > 0) {
      this._step.set(this._step() - 1);
      this.persist();
    }
  }

  skip(): void {
    this._step.set(-1);
    localStorage.setItem(SKIPPED_KEY, '1');
    this._skipped.set(true);          // notify templates immediately
    this.persist();
  }

  replay(): void {
    this.start();
  }

  dismissZeroState(): void {
    localStorage.setItem(SKIPPED_KEY, '1');
    this._skipped.set(true);
  }

  private persist(): void { localStorage.setItem(STEP_KEY, String(this._step())); }
}
