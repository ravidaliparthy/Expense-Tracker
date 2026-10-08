import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'et.token';
const USER_KEY = 'et.user';

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
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

  constructor(private http: HttpClient, private router: Router) {}

  get token(): string | null { return getStoredToken(); }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: User }>('/api/auth/login', { email, password })
    );
    this.persist(res);
  }

  async register(email: string, password: string, displayName: string, timezone: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: User }>('/api/auth/register',
        { email, password, displayName, timezone })
    );
    this.persist(res);
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
    this._user.set(null);
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  private persist(res: { token: string; user: User }): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    sessionStorage.setItem(TOKEN_KEY, res.token);
    this.persistUser(res.user);
    this.isLoggedIn.set(true);
  }

  private persistUser(u: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    this._user.set(u);
  }

  private setUser(u: User): void { this.persistUser(u); }
}
