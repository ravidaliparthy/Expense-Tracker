import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/**
 * KeepAliveService
 * 
 * Prevents backend cold-starts and eliminating the 15-minute inactivity lag:
 * 1. Sends a lightweight ping to /api/health every 10 minutes (Render sleeps after 15 min of zero traffic).
 * 2. Immediately sends a pre-warming ping whenever the user unlocks their phone, switches back to the tab,
 *    or reconnects to the network.
 */
@Injectable({ providedIn: 'root' })
export class KeepAliveService {
  private readonly http = inject(HttpClient);
  private heartbeatTimer: any = null;
  private lastPingTime = Date.now();

  init(): void {
    if (typeof window === 'undefined') return;

    // 1. Initial warm-up ping
    this.ping();

    // 2. Heartbeat ping every 10 minutes (prevents Render from spinning down after 15 min)
    this.heartbeatTimer = setInterval(() => {
      this.ping();
    }, 10 * 60 * 1000);

    // 3. Tab focus / phone unlock / visibility change: warm up if idle
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const idleMs = Date.now() - this.lastPingTime;
        // If more than 4 minutes since last activity, warm up immediately
        if (idleMs > 4 * 60 * 1000) {
          this.ping();
        }
      }
    });

    window.addEventListener('focus', () => {
      const idleMs = Date.now() - this.lastPingTime;
      if (idleMs > 4 * 60 * 1000) {
        this.ping();
      }
    });

    window.addEventListener('online', () => {
      this.ping();
    });
  }

  ping(): void {
    this.lastPingTime = Date.now();
    this.http.get('/api/health').subscribe({
      next: () => {},
      error: () => {},
    });
  }
}
