import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FrappeAuthService } from './services/frappe-auth.service';
import { FrappeDeliveryNoteService } from './services/frappe-delivery-note.service';
import { DeliveryNoteRecord } from './models/delivery-note.model';

@Component({
  imports: [RouterLink],
  selector: 'app-delivery-note-list',
  styleUrl: './sales-order-list.scss',
  templateUrl: './delivery-note-list.html',
})
export class DeliveryNoteListPage {
  private readonly pageSize = 20;
  private readonly deliveryNotes = inject(FrappeDeliveryNoteService);
  private readonly auth = inject(FrappeAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<DeliveryNoteRecord[]>([]);
  protected readonly searchText = signal('');
  protected readonly currentPage = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filteredRecords = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    return this.records().filter((record) => !query || [
      record.name,
      record.customer,
      record.customer_name,
      record.company,
      record.posting_date,
      record.status,
    ].some((value) => value?.toLocaleLowerCase().includes(query)));
  });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize)),
  );
  protected readonly paginatedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredRecords().slice(start, start + this.pageSize);
  });

  constructor() {
    this.loadRecords();
  }

  protected get currentUser(): string {
    return this.auth.currentUser() ?? '';
  }

  protected setSearchText(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  protected openRecord(name: string): void {
    void this.router.navigate(['/delivery-note', name]);
  }

  protected previousPage(): void {
    this.currentPage.update((page) => Math.max(1, page - 1));
  }

  protected nextPage(): void {
    this.currentPage.update((page) => Math.min(this.pageCount(), page + 1));
  }

  protected loadRecords(): void {
    this.loading.set(true);
    this.error.set('');
    this.deliveryNotes.getDeliveryNotes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (records) => {
        this.records.set(records);
        this.currentPage.update((page) => Math.min(
          page,
          Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize)),
        ));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Could not load Delivery Notes.');
      },
    });
  }

  protected status(record: DeliveryNoteRecord): string {
    if (record.status?.trim()) {
      return record.status.trim();
    }
    return record.docstatus === 1 ? 'Submitted' : record.docstatus === 2 ? 'Cancelled' : 'Draft';
  }

  protected formatAmount(record: DeliveryNoteRecord): string {
    const amount = Number(record.grand_total);
    if (!Number.isFinite(amount)) {
      return '—';
    }
    if (record.currency && /^[A-Z]{3}$/.test(record.currency)) {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currency }).format(amount);
    }
    return amount.toLocaleString();
  }
}
