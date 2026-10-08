import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly appRef = inject(ApplicationRef);

  /** True when a new production build has been downloaded by the service worker */
  readonly updateAvailable = signal(false);

  /** Deferred BeforeInstallPromptEvent for Android/Chromium */
  private deferredPrompt: any = null;
  readonly canInstall = signal(false);
  readonly isStandalone = signal(false);

  constructor() {
    this.detectStandalone();
    this.initUpdateChecker();
    this.initInstallPrompt();
  }

  private detectStandalone(): void {
    if (typeof window === 'undefined') return;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    this.isStandalone.set(!!isStandalone);
  }

  private initUpdateChecker(): void {
    if (!this.swUpdate || !this.swUpdate.isEnabled) return;

    // Listen for new version downloaded
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable.set(true);
      });

    // When app is stable, poll for updates and also check when user returns to app tab
    this.appRef.isStable.pipe(first((isStable) => isStable)).subscribe(() => {
      // Check immediately after app becomes stable
      void this.check();

      // Check on window focus / visibility change
      if (typeof window !== 'undefined') {
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void this.check();
          }
        });
      }

      // Check every 2 hours
      setInterval(() => {
        void this.check();
      }, 2 * 60 * 60 * 1000);
    });
  }

  private initInstallPrompt(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile Chrome
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
    });
  }

  async check(): Promise<void> {
    if (!this.swUpdate || !this.swUpdate.isEnabled) return;
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      // Ignore network errors when offline
    }
  }

  /** Reload the application to apply the latest downloaded version */
  async activateUpdate(): Promise<void> {
    if (!this.swUpdate || !this.swUpdate.isEnabled) {
      window.location.reload();
      return;
    }
    try {
      await this.swUpdate.activateUpdate();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  /** Prompt the user to install the app on their home screen */
  async installApp(): Promise<void> {
    if (!this.deferredPrompt) return;
    try {
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        this.canInstall.set(false);
      }
      this.deferredPrompt = null;
    } catch {
      this.canInstall.set(false);
    }
  }
}
