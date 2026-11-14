import { Routes } from '@angular/router';
import { authGuard, maintenanceGuard } from './auth';
import { AdminPage, LoginPage, OrderDetailPage, OrdersPage, ReportPage } from './pages';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },
  { path: 'orders', component: OrdersPage },
  { path: 'orders/:id', component: OrderDetailPage },
  { path: 'report', component: ReportPage },
  { path: 'login', component: LoginPage },
  { path: 'admin', component: AdminPage, canActivate: [authGuard] },
  { path: 'archive', component: ReportPage, canActivate: [maintenanceGuard] },
];
