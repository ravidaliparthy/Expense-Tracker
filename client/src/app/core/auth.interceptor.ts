import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, throwError } from 'rxjs';
import { KeepAliveService } from './keep-alive.service';

/** Attaches the JWT to every API call, tracks cold-start latency, and cleans up expired sessions on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const keepAlive = inject(KeepAliveService);
  const finishReq = req.url.startsWith('/api') && req.url !== '/api/health' ? keepAlive.startRequest() : () => {};

  const token = sessionStorage.getItem('et.token') || localStorage.getItem('et.token');
  if (token && req.url.startsWith('/api')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // If login or register itself fails with 401, let the component show the error
        if (!req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/register')) {
          console.warn('Session expired or unauthorized (401) — clearing local credentials and redirecting to login');
          sessionStorage.removeItem('et.token');
          sessionStorage.removeItem('et.user');
          localStorage.removeItem('et.token');
          localStorage.removeItem('et.user');
          void router.navigate(['/login'], { queryParams: { expired: '1' } });
        }
      }
      return throwError(() => err);
    }),
    finalize(() => finishReq())
  );
};

