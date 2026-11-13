import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FrappeAuthService } from './services/frappe-auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-home',
  styleUrl: './home.scss',
  templateUrl: './home.html',
})
export class HomePage {
  private readonly auth = inject(FrappeAuthService);
  private readonly router = inject(Router);

  protected get currentUser(): string {
    return this.auth.currentUser() ?? '';
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
