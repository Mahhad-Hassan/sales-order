import { CanDeactivateFn, Routes } from '@angular/router';
import { App } from './app';
import { frappeAuthGuard } from './guards/frappe-auth.guard';
import { LoginPage } from './login';
import { DeliveryNoteFormPage } from './delivery-note-form';
import { DeliveryNoteListPage } from './delivery-note-list';
import { HomePage } from './home';
import { SalesOrderListPage } from './sales-order-list';

const confirmSalesOrderNavigation: CanDeactivateFn<App> = (component) => component.canDeactivate();

export const appRoutes: Routes = [
  { path: 'login', component: LoginPage },
  { path: 'home', component: HomePage, canActivate: [frappeAuthGuard] },
  { path: 'sales-orders', component: SalesOrderListPage, canActivate: [frappeAuthGuard] },
  { path: 'delivery-notes', component: DeliveryNoteListPage, canActivate: [frappeAuthGuard] },
  { path: 'delivery-note/new', component: DeliveryNoteFormPage, canActivate: [frappeAuthGuard] },
  { path: 'delivery-note/:name', component: DeliveryNoteFormPage, canActivate: [frappeAuthGuard] },
  { path: 'sales-order/new', component: App, canActivate: [frappeAuthGuard], canDeactivate: [confirmSalesOrderNavigation] },
  { path: 'sales-order/:name', component: App, canActivate: [frappeAuthGuard], canDeactivate: [confirmSalesOrderNavigation] },
  { path: 'sales-order', component: App, canActivate: [frappeAuthGuard], canDeactivate: [confirmSalesOrderNavigation] },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];