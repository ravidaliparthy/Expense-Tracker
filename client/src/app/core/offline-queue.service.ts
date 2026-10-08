import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface QueuedMutation {
  clientUuid: string;
  op: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
}

const QUEUE_KEY = 'et.offlineQueue';

/**
 * OFFLINE RESILIENCE: mutations are written to localStorage immediately,
 * then flushed to POST /api/sync/batch (idempotent via clientUuid) whenever
 * connectivity returns. A crash or refresh never loses an entry.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly _pending = signal<number>(this.read().length);
  readonly pending = this._pending.asReadonly();
  readonly online = signal<boolean>(navigator.onLine);

  constructor(private http: HttpClient) {
    window.addEventListener('online', () => { this.online.set(true); void this.flush(); });
    window.addEventListener('offline', () => this.online.set(false));
    if (navigator.onLine) void this.flush();
  }

  enqueue(m: QueuedMutation): void {
    const q = this.read();
    // de-dupe by clientUuid (double-click / retry safety)
    const next = [...q.filter((x) => x.clientUuid !== m.clientUuid), m];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    this._pending.set(next.length);
  }

  async flush(): Promise<void> {
    const q = this.read();
    if (!q.length) return;
    try {
      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...((sessionStorage.getItem('et.token') || localStorage.getItem('et.token'))
            ? { Authorization: `Bearer ${sessionStorage.getItem('et.token') || localStorage.getItem('et.token')}` } : {}),
        },
        body: JSON.stringify({ deviceId: 'web', mutations: q }),
      });
      if (!res.ok && res.status !== 207) return;             // keep queue, retry later
      const { results } = (await res.json()) as { results: { clientUuid: string; status: string }[] };
      const failed = results.filter((r) => r.status === 'error' || r.status === 'conflict');
      const remaining = q.filter((m) => failed.some((f) => f.clientUuid === m.clientUuid));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      this._pending.set(remaining.length);
      if (failed.length) console.warn('Sync conflicts/errors kept in queue:', failed);
      window.dispatchEvent(new CustomEvent('et:synced'));     // dashboard reloads on this
    } catch {
      // offline again — queue persists for next 'online' event
    }
  }

  private read(): QueuedMutation[] {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedMutation[]; }
    catch { return []; }
  }
}
