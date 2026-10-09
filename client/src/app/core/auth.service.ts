import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'et.token';
const USER_KEY = 'et.user';
const REMEMBER_KEY = 'et.remember_me';

function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function getStoredUser(): User | null {
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(getStoredUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = signal<boolean>(!!getStoredToken());

  constructor(private http: HttpClient, private router: Router) {
    if (typeof window !== 'undefined') {
      const localTok = localStorage.getItem(TOKEN_KEY);
      const localUser = localStorage.getItem(USER_KEY);
      if (localTok && !sessionStorage.getItem(TOKEN_KEY)) {
        sessionStorage.setItem(TOKEN_KEY, localTok);
      }
      if (localUser && !sessionStorage.getItem(USER_KEY)) {
        sessionStorage.setItem(USER_KEY, localUser);
      }
    }
  }

  get token(): string | null { return getStoredToken(); }

  isRemembered(): boolean {
    return typeof window !== 'undefined' && localStorage.getItem(REMEMBER_KEY) === '1';
  }

  setRememberMe(remember: boolean): void {
    const token = this.token;
    const u = this._user();
    if (!token || !u) return;
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      localStorage.setItem(REMEMBER_KEY, '1');
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
  }

  async login(email: string, password: string, rememberMe = false): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: User }>('/api/auth/login', { email, password })
    );
    this.persist(res, rememberMe);
  }

  async register(
    email: string,
    password: string,
    displayName: string,
    timezone: string,
    recoveryPin?: string,
    rememberMe = false
  ): Promise<void> {
    const payload: { email: string; password: string; displayName: string; timezone: string; recoveryPin?: string } = {
      email,
      password,
      displayName,
      timezone,
    };
    if (recoveryPin && recoveryPin.trim()) {
      payload.recoveryPin = recoveryPin.trim();
    }
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: User }>('/api/auth/register', payload)
    );
    this.persist(res, rememberMe);
  }

  async resetPassword(email: string, recoveryPin: string, newPassword: string, rememberMe = false): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: User }>('/api/auth/reset-password',
        { email, recoveryPin, newPassword })
    );
    this.persist(res, rememberMe);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ ok: boolean; message: string }>('/api/auth/change-password',
        { currentPassword, newPassword })
    );
  }

  async setRecoveryPin(pin: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ ok: boolean; message: string }>('/api/auth/set-pin',
        { pin })
    );
    const u = this._user();
    if (u) { this.setUser({ ...u, hasRecoveryPin: true }); }
  }

  async completeOnboarding(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/onboarding/complete', {}));
    const u = this._user();
    if (u) { this.setUser({ ...u, isFirstLogin: false }); }
  }

  async updateProfile(patch: { displayName?: string; timezone?: string; baseCurrency?: string }): Promise<void> {
    const res = await firstValueFrom(
      this.http.patch<{ user: User }>('/api/auth/profile', patch)
    );
    this.setUser(res.user);
  }

  logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    try {
      localStorage.removeItem('et.cachedExpenses');
      localStorage.removeItem('et.cachedSummary');
      localStorage.removeItem('et.categories');
    } catch {}
    this._user.set(null);
    this.isLoggedIn.set(false);
    void this.router.navigate(['/login']);
  }

  private persist(res: { token: string; user: User }, rememberMe = false): void {
    sessionStorage.setItem(TOKEN_KEY, res.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.setItem(REMEMBER_KEY, '1');
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
    this._user.set(res.user);
    this.isLoggedIn.set(true);
  }

  private persistUser(u: User): void {
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    if (localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    }
    this._user.set(u);
  }

  private setUser(u: User): void { this.persistUser(u); }
}
