import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from './auth';

// Salvataggio asincrono seguito da navigazione programmatica (router.navigate).
@Component({
  selector: 'app-orders',
  template: `
    <h2>Nuovo ordine</h2>
    <form (submit)="save(customer.value, product.value); $event.preventDefault()">
      <label>Nome cliente <input #customer type="text" autocomplete="off" /></label>
      <label>
        Prodotto
        <select #product>
          <option value="base">Piano base</option>
          <option value="pro">Piano pro</option>
        </select>
      </label>
      <button type="submit" [disabled]="saving()">Salva ordine</button>
    </form>
    @if (saving()) {
      <p role="status">Salvataggio in corso…</p>
    }
  `,
})
export class OrdersPage {
  private readonly router = inject(Router);
  protected readonly saving = signal(false);

  save(customer: string, product: string) {
    this.saving.set(true);
    setTimeout(() => this.router.navigate(['/orders', 42], { queryParams: { customer, product } }), 700);
  }
}

// Navigazione "dura" avviata dall'app: assegnazione di window.location.
@Component({
  selector: 'app-order-detail',
  template: `
    <h2>Ordine {{ id }}</h2>
    <p id="summary">Salvato per {{ customer }} ({{ product }})</p>
    <button type="button" (click)="openReport()">Apri report</button>
    <button type="button" (click)="preview()">Anteprima report</button>
  `,
})
export class OrderDetailPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly customer = this.route.snapshot.queryParamMap.get('customer');
  protected readonly product = this.route.snapshot.queryParamMap.get('product');

  private readonly router = inject(Router);

  openReport() {
    window.location.href = '/report';
  }

  // Cambia vista senza toccare l'URL: invisibile a chi guarda solo la barra indirizzi.
  preview() {
    this.router.navigate(['/report'], { skipLocationChange: true });
  }
}

@Component({
  selector: 'app-report',
  template: `<h2>Report</h2><p>Pagina caricata con un reload completo.</p>`,
})
export class ReportPage {}

@Component({
  selector: 'app-login',
  template: `
    <h2>Login</h2>
    <p>Destinazione dopo il login: {{ returnUrl }}</p>
    <button type="button" (click)="login()">Accedi</button>
  `,
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  protected readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl') ?? '/orders';

  login() {
    this.auth.login();
    this.router.navigateByUrl(this.returnUrl);
  }
}

// Navigazione spontanea: la sessione scade da sola e l'app torna al login.
@Component({
  selector: 'app-admin',
  template: `<h2>Area riservata</h2><p>La sessione scade dopo 2,5 secondi di permanenza.</p>`,
})
export class AdminPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly timer = setTimeout(() => {
    this.auth.logout();
    this.router.navigate(['/login'], { queryParams: { reason: 'scaduta' } });
  }, 2500);

  ngOnDestroy() {
    clearTimeout(this.timer);
  }
}
