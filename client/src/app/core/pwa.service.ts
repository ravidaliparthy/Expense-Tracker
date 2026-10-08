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
  readonly isIos = signal(false);
  readonly isIosChrome = signal(false);
  readonly showIosInstructions = signal(false);
  readonly copiedLink = signal(false);

  constructor() {
    this.detectPlatform();
    this.detectStandalone();
    this.initUpdateChecker();
    this.initInstallPrompt();
  }

  private detectPlatform(): void {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    const isIosChrome = isIos && (/crios/.test(ua) || /fxios/.test(ua));
    this.isIos.set(isIos);
    this.isIosChrome.set(isIosChrome);

    // On iOS running in normal browser (not added to home screen yet), enable install button
    if (isIos && !this.isStandalone()) {
      this.canInstall.set(true);
    }
  }

  private detectStandalone(): void {
    if (typeof window === 'undefined') return;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    this.isStandalone.set(!!isStandalone);
    if (isStandalone) {
      this.canInstall.set(false);
    }
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
    if (this.isIos()) {
      this.showIosInstructions.set(true);
      return;
    }

    if (!this.deferredPrompt) {
      this.showIosInstructions.set(true);
      return;
    }

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

  closeIosInstructions(): void {
    this.showIosInstructions.set(false);
  }

  async copyAppLink(): Promise<void> {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 3000);
    } catch {
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 3000);
    }
  }
}
