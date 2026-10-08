import { HttpInterceptorFn } from '@angular/common/http';

/** Attaches the JWT to every API call; API-only interceptor (no /api prefix match needed). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('et.token') || localStorage.getItem('et.token');
  if (token && req.url.startsWith('/api')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
