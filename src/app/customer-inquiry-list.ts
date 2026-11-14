import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { CustomerInquiryRecord } from './models/customer-inquiry.model';
import { FrappeAuthService } from './services/frappe-auth.service';
import { FrappeCustomerInquiryService } from './services/frappe-customer-inquiry.service';

@Component({
  imports: [RouterLink],
  selector: 'app-customer-inquiry-list',
  styleUrl: './sales-order-list.scss',
  templateUrl: './customer-inquiry-list.html',
})
export class CustomerInquiryListPage {
  private readonly pageSize = 20;
  private readonly inquiries = inject(FrappeCustomerInquiryService);
  private readonly auth = inject(FrappeAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<CustomerInquiryRecord[]>([]);
  protected readonly searchText = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly currentPage = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly statuses = ['Open', 'RFQ Sent', 'Overdue', 'Quoted', 'Deal Created', 'Lost', 'Cancelled'];
  protected readonly filteredRecords = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const status = this.statusFilter();
    return this.records().filter((record) => {
      if (status !== 'all' && record.status !== status) {
        return false;
      }
      return !query || [
        record.name,
        record.customer,
        record.customer_name,
        record.inquiry_date,
        record.required_date,
        record.status,
        record.company,
        record.responsible,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
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

  protected setStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  protected openRecord(name: string): void {
    void this.router.navigate(['/customer-inquiry', name]);
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
    this.inquiries.getInquiries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (records) => {
        this.records.set(records);
        this.currentPage.update((page) => Math.min(page, this.pageCount()));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Could not load Customer Inquiries.');
      },
    });
  }

  protected documentStatus(record: CustomerInquiryRecord): string {
    return record.docstatus === 1 ? 'Submitted' : record.docstatus === 2 ? 'Cancelled' : 'Draft';
  }
}
