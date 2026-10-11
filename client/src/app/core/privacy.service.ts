import { Injectable, effect, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PrivacyService {
  /** Reactive signal tracking whether privacy mask / ghost mode is enabled */
  readonly isPrivate = signal<boolean>(readStoredPrivacy());

  constructor() {
    // Synchronize HTML root attribute whenever privacy toggle changes
    effect(() => {
      const active = this.isPrivate();
      if (typeof document !== 'undefined') {
        if (active) {
          document.documentElement.setAttribute('data-privacy', 'true');
        } else {
          document.documentElement.removeAttribute('data-privacy');
        }
      }
      try {
        localStorage.setItem('et.privacy', active ? '1' : '0');
      } catch {
        /* storage restricted in private browsing */
      }
    });

    // Global 'P' hotkey listener (ignores when typing in form inputs)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'p' || e.key === 'P') {
          const target = e.target as HTMLElement | null;
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable
          ) {
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            this.toggle();
          }
        }
      });
    }
  }

  toggle(): void {
    this.isPrivate.update((curr) => !curr);
  }
}

function readStoredPrivacy(): boolean {
  try {
    return localStorage.getItem('et.privacy') === '1';
  } catch {
    return false;
  }
}
