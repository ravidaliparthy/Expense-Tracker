import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const token = sessionStorage.getItem('et.token') || localStorage.getItem('et.token');
  return token
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const token = sessionStorage.getItem('et.token') || localStorage.getItem('et.token');
  return token ? inject(Router).createUrlTree(['/dashboard']) : true;
};
