import { ChangeDetectorRef, Component, HostListener, Input, NgZone, OnDestroy, afterNextRender, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OnboardingService, TOUR_STEPS } from '../../core/onboarding.service';

/**
 * UPGRADED GUIDED TOUR UX:
 *  - Interactive step progress indicators with clickable pills.
 *  - Full keyboard navigation (ArrowRight/Enter to advance, ArrowLeft to go back, Escape to skip).
 *  - Auto-scrolls target elements smoothly into view.
 *  - Highlighting key features: Add, Date & Chart Grouping, Spending Breakdown, Sorting, Transactions Hub, Budgets, and Exports.
 */
@Component({
  selector: 'app-onboarding-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- ZERO STATE (before tour starts) -->
    <div class="overlay" *ngIf="!tour.active() && !tour.done() && !tour.skipped() && !dismissed() && showZeroState">
      <div class="modal zero-state">
        <div class="art">◆</div>
        <h2>Your dashboard is ready — it just needs data.</h2>
        <p>
          Log your first expense, explore the breakdown drill-downs, set a budget to get 80/90/100% warnings,
          and filter anything from a single day to a full year in seconds.
        </p>
        <div class="modal-actions" style="justify-content:center">
          <button class="btn-ghost" (click)="skipAll()">Skip — I’ll explore myself</button>
          <button class="btn-primary" (click)="start()">▶ Take the guided tour</button>
        </div>
      </div>
    </div>

    <!-- UPGRADED COACH MARK TOUR -->
    <ng-container *ngIf="tour.active() && !dismissed()">
      <div class="spotlight" [ngStyle]="spotStyle()"></div>
      <div class="coach" [ngStyle]="coachStyle()">
        <!-- SVG Tooltip directional arrow -->
        <svg *ngIf="placement() === 'top'" class="coach-svg-arrow arrow-top" [ngStyle]="arrowStyle()" width="20" height="9" viewBox="0 0 20 9">
          <path d="M 0 9 L 8.5 1.5 C 9.5 0.7 10.5 0.7 11.5 1.5 L 20 9 Z" fill="#0F172A" stroke="rgba(129, 140, 248, 0.45)" stroke-width="1" />
        </svg>
        <svg *ngIf="placement() === 'bottom'" class="coach-svg-arrow arrow-bottom" [ngStyle]="arrowStyle()" width="20" height="9" viewBox="0 0 20 9">
          <path d="M 0 0 L 8.5 7.5 C 9.5 8.3 10.5 8.3 11.5 7.5 L 20 0 Z" fill="#0F172A" stroke="rgba(129, 140, 248, 0.45)" stroke-width="1" />
        </svg>
        <svg *ngIf="placement() === 'left'" class="coach-svg-arrow arrow-left" [ngStyle]="arrowStyle()" width="9" height="20" viewBox="0 0 9 20">
          <path d="M 9 0 L 1.5 8.5 C 0.7 9.5 0.7 10.5 1.5 11.5 L 9 20 Z" fill="#0F172A" stroke="rgba(129, 140, 248, 0.45)" stroke-width="1" />
        </svg>

        <!-- Header: Step badge, live dot, close button -->
        <div class="coach-header-row">
          <div class="step-pill">
            <span class="live-dot"></span>
            <span>Step {{ tour.step() + 1 }} of {{ total }}</span>
          </div>
          <button class="coach-close" (click)="skipAll()" title="Close tour (Esc)">✕</button>
        </div>

        <!-- Interactive progress bar -->
        <div class="coach-progress-track">
          <div class="coach-pill" *ngFor="let s of steps; let i = index"
               [class.active]="i === tour.step()"
               [class.passed]="i < tour.step()"
               (click)="goTo(i)"
               [title]="'Jump to step ' + (i + 1) + ': ' + s.title">
          </div>
        </div>

        <!-- Title & copy -->
        <div class="coach-body">
          <h4 class="coach-title">{{ tour.currentStep().title }}</h4>
          <p class="coach-desc">{{ tour.currentStep().body }}</p>
        </div>

        <!-- Action buttons -->
        <div class="coach-actions">
          <button class="coach-skip" (click)="skipAll()" title="Press Esc to exit">Skip tour</button>
          <div class="coach-nav">
            <button *ngIf="tour.step() > 0" class="btn-coach-back" (click)="prev()">← Back</button>
            <button class="btn-coach-next" (click)="next()">
              {{ tour.step() === total - 1 ? 'Finish tour 🎉' : 'Next →' }}
            </button>
          </div>
        </div>

        <!-- Keyboard hints -->
        <div class="coach-kbd-hint">
          <span><kbd>←</kbd> <kbd>→</kbd> Navigate</span>
          <span><kbd>Esc</kbd> Exit</span>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    .zero-state { text-align:center; }
    .zero-state .art { font-size:56px; color:#6366F1; }
    .zero-state h2 { margin:0 0 8px; }
    .zero-state p { color:#64748B; line-height:1.6; margin:0 auto 20px; max-width:440px; }
  `],
})
export class OnboardingOverlayComponent implements OnDestroy {
  readonly tour = inject(OnboardingService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly steps = TOUR_STEPS;
  readonly total = TOUR_STEPS.length;
  /** Local latch: hides every overlay instantly on Skip, even before signals propagate. */
  readonly dismissed = signal(false);

  /**
   * When false, the zero-state hero is suppressed (e.g. the dashboard already
   * has data — an overlay must never hide populated charts).
   */
  @Input() showZeroState = true;
  readonly targetRect = signal<DOMRect | null>(null);
  readonly placement = signal<'top' | 'bottom' | 'left' | 'none'>('bottom');
  readonly arrowStyle = signal<Record<string, string>>({});
  readonly coachStyle = signal<Record<string, string>>({
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  });

  private rafId: number | null = null;
  private resizeHandler = () => {
    if (!this.tour.active()) return;
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.locate(false);
    });
  };

  constructor() {
    effect(() => {
      if (this.tour.active()) {
        this.dismissed.set(false);
        setTimeout(() => this.scheduleLocate(), 0);
      }
    }, { allowSignalWrites: true });

    afterNextRender(() => {
      setTimeout(() => this.scheduleLocate(), 0);
      this.ngZone.runOutsideAngular(() => {
        window.addEventListener('resize', this.resizeHandler, { passive: true });
        window.addEventListener('scroll', this.resizeHandler, { passive: true, capture: true });
      });
    });
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('scroll', this.resizeHandler, true);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.tour.active() || this.dismissed()) return;
    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.skipAll();
    }
  }

  start(): void {
    this.dismissed.set(false);
    this.tour.start();
    this.scheduleLocate();
  }

  skipAll(): void {
    this.dismissed.set(true);
    this.tour.skip();
  }

  next(): void {
    this.tour.next();
    this.scheduleLocate();
  }

  prev(): void {
    this.tour.prev();
    this.scheduleLocate();
  }

  goTo(idx: number): void {
    this.tour.goTo(idx);
    this.scheduleLocate();
  }

  private scheduleLocate(): void {
    this.locate(true);
    const start = performance.now();
    const poll = () => {
      this.locate(false);
      if (performance.now() - start < 900) {
        requestAnimationFrame(poll);
      }
    };
    requestAnimationFrame(poll);

    if (typeof window !== 'undefined') {
      setTimeout(() => this.locate(false), 120);
      setTimeout(() => this.locate(false), 280);
      setTimeout(() => this.locate(false), 500);
      setTimeout(() => this.locate(false), 850);
    }
  }

  private locate(shouldScroll = true): void {
    if (!this.tour.active()) {
      this.targetRect.set(null);
      this.updateLayout(null);
      this.cdr.detectChanges();
      return;
    }
    const sel = this.tour.currentStep().target;
    const isMobile = window.innerWidth <= 820;
    let node: HTMLElement | null = null;

    if (sel.includes('session-controls')) {
      const pcBtn = document.querySelector('.pc-signout-btn') as HTMLElement | null;
      const topBtn = document.querySelector('.btn-topbar-signout') as HTMLElement | null;
      if (!isMobile && pcBtn && pcBtn.offsetParent !== null) {
        node = pcBtn;
      } else if (topBtn && topBtn.offsetParent !== null) {
        node = topBtn;
      }
    } else if (sel.includes('view-transactions')) {
      node = (document.querySelector('[data-tour="view-transactions"]') ||
              document.querySelector('[data-tour="transactions-nav"]')) as HTMLElement | null;
    } else if (sel.includes('categories-nav')) {
      node = (document.querySelector('[data-tour="categories-nav"]') ||
              document.querySelector('[data-tour="category-breakdown"]')) as HTMLElement | null;
    } else {
      node = document.querySelector(sel) as HTMLElement | null;
    }

    if (!node) {
      this.targetRect.set(null);
      this.updateLayout(null);
      this.cdr.detectChanges();
      return;
    }

    if (shouldScroll) {
      const isFixed = !!node.closest('.topbar') || (isMobile && !!node.closest('.sidenav'));
      if (!isFixed) {
        const rect = node.getBoundingClientRect();
        const inView = rect.top >= 75 && rect.bottom <= (window.innerHeight - 75);
        if (!inView) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }
    }

    const r = node.getBoundingClientRect();
    this.targetRect.set(r);
    this.updateLayout(r);
    this.cdr.detectChanges();
  }

  private updateLayout(r: DOMRect | null): void {
    if (!r) {
      this.placement.set('none');
      this.coachStyle.set({
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      });
      this.arrowStyle.set({ display: 'none' });
      return;
    }

    const isMobile = window.innerWidth <= 820;
    const cardWidth = Math.min(360, window.innerWidth - 24);
    const cardHeight = 220;

    // MOBILE LAYOUT (Android & iOS Safari)
    if (isMobile) {
      const isTargetAtBottom = r.top > (window.innerHeight / 2);

      if (isTargetAtBottom) {
        this.placement.set('bottom');
        this.coachStyle.set({
          position: 'fixed',
          top: '64px',
          bottom: 'auto',
          left: '12px',
          right: '12px',
          width: 'calc(100vw - 24px)',
          maxWidth: '440px',
          margin: '0 auto',
          transform: 'none',
        });
      } else {
        this.placement.set('top');
        this.coachStyle.set({
          position: 'fixed',
          top: 'auto',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
          left: '12px',
          right: '12px',
          width: 'calc(100vw - 24px)',
          maxWidth: '440px',
          margin: '0 auto',
          transform: 'none',
        });
      }
      this.arrowStyle.set({ display: 'none' });
      return;
    }

    // DESKTOP LAYOUT (PC)
    // 1. Sidebar target (e.g. left side items, r.left < 220)
    if (r.left < 220) {
      const left = Math.round(r.right + 16);
      const targetCenterY = r.top + r.height / 2;
      let top = Math.round(targetCenterY - cardHeight / 2);
      top = Math.max(68, Math.min(top, window.innerHeight - cardHeight - 20));

      this.placement.set('left');
      this.coachStyle.set({
        left: `${left}px`,
        top: `${top}px`,
        width: `${cardWidth}px`,
        transform: 'none',
      });

      const arrowTop = Math.max(16, Math.min(Math.round(targetCenterY - top - 10), cardHeight - 30));
      this.arrowStyle.set({
        top: `${arrowTop}px`,
        left: '-8px',
        display: 'block',
      });
      return;
    }

    // 2. Main content target
    const targetCenterX = r.left + r.width / 2;
    const idealLeft = Math.round(targetCenterX - cardWidth / 2);
    const left = Math.max(226, Math.min(idealLeft, window.innerWidth - cardWidth - 20));
    const arrowLeft = Math.max(24, Math.min(Math.round(targetCenterX - left - 10), cardWidth - 44));

    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top - 68;
    let top: number;

    if (spaceBelow >= cardHeight + 20) {
      top = Math.round(r.bottom + 14);
      this.placement.set('top');
      this.arrowStyle.set({
        top: '-8px',
        bottom: 'auto',
        left: `${arrowLeft}px`,
        display: 'block',
      });
    } else if (spaceAbove >= cardHeight + 20) {
      top = Math.round(r.top - cardHeight - 14);
      this.placement.set('bottom');
      this.arrowStyle.set({
        top: 'auto',
        bottom: '-8px',
        left: `${arrowLeft}px`,
        display: 'block',
      });
    } else {
      // Tall/large card filling most of screen — float card cleanly inside visible viewport
      top = window.innerHeight - cardHeight - 24;
      this.placement.set('none');
      this.arrowStyle.set({ display: 'none' });
    }

    // Hard boundary guarantee: card is NEVER cut off top or bottom
    top = Math.max(68, Math.min(top, window.innerHeight - cardHeight - 20));

    this.coachStyle.set({
      left: `${left}px`,
      top: `${top}px`,
      width: `${cardWidth}px`,
      transform: 'none',
    });
  }

  spotStyle(): Record<string, string> {
    const r = this.targetRect();
    if (!r) return { display: 'none' };
    if (r.bottom < 54 || r.top > window.innerHeight) return { display: 'none' };

    const isMobile = window.innerWidth <= 820;
    const padding = isMobile ? 4 : 8;

    return {
      left: `${Math.max(0, Math.round(r.left - padding))}px`,
      top: `${Math.max(0, Math.round(r.top - padding))}px`,
      width: `${Math.min(window.innerWidth, Math.round(r.width + padding * 2))}px`,
      height: `${Math.round(r.height + padding * 2)}px`,
    };
  }
}
