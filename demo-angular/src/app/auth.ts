import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

const KEY = 'demo-logged';

@Injectable({ providedIn: 'root' })
export class Auth {
  readonly logged = signal(sessionStorage.getItem(KEY) === '1');

  login() {
    sessionStorage.setItem(KEY, '1');
    this.logged.set(true);
  }

  logout() {
    sessionStorage.removeItem(KEY);
    this.logged.set(false);
  }
}

// Guard che rifiuta sempre: la navigazione viene annullata e l'URL non cambia.
export const maintenanceGuard: CanActivateFn = () => false;

// Guard: senza login reindirizza a /login ricordando la destinazione.
export const authGuard: CanActivateFn = (_route, state) =>
  inject(Auth).logged()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
