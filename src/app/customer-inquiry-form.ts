import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, map, of, switchMap } from 'rxjs';
import {
  CustomerInquiryCompany,
  CustomerInquiryCustomer,
  CustomerInquiryDraftItem,
  CustomerInquiryItemOption,
  CustomerInquiryLinkOption,
  CustomerInquiryRecord,
} from './models/customer-inquiry.model';
import { FrappeAuthService } from './services/frappe-auth.service';
import { FrappeCustomerInquiryService } from './services/frappe-customer-inquiry.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-customer-inquiry-form',
  styleUrl: 'delivery-note-form.scss',
  templateUrl: './customer-inquiry-form.html',
})
export class CustomerInquiryFormPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly inquiries = inject(FrappeCustomerInquiryService);
  private readonly auth = inject(FrappeAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private optionsLoaded = false;
  private requestedName = '';
  private nextItemRowId = 0;
  private currentRecord: CustomerInquiryRecord | null = null;
  private preserveNextLoadError = false;
  private defaults: Record<string, string | null> = {};
  private childDefaults: Record<string, string | null> = {};

  protected readonly customers = signal<CustomerInquiryCustomer[]>([]);
  protected readonly companies = signal<CustomerInquiryCompany[]>([]);
  protected readonly users = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly currencies = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly paymentTerms = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly incoterms = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly items = signal<CustomerInquiryItemOption[]>([]);
  protected readonly uoms = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly brands = signal<CustomerInquiryLinkOption[]>([]);
  protected readonly itemRows = signal<CustomerInquiryDraftItem[]>([]);
  protected readonly groupBy = signal('Container No');
  protected readonly statuses = signal<string[]>([]);
  protected readonly transportTypes = signal<string[]>([]);
  protected readonly shipmentLoads = signal<string[]>([]);
  protected readonly allowedOptions = signal<string[]>([]);
  protected readonly groupByOptions = signal<string[]>([]);
  protected readonly confirmationMethods = signal<string[]>([]);
  protected readonly optionsLoading = signal(true);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly inquiryName = signal('');
  protected readonly docstatus = signal(0);
  protected readonly status = signal('Open');
  protected readonly groupedItemTotals = computed(() => {
    const groupBy = this.groupBy();
    const groups = new Map<string, { qty: number; targetTotal: number }>();
    for (const row of this.itemRows()) {
      if (!row.item_code) {
        continue;
      }
      const key = groupBy === 'Preferred Brand'
        ? row.preferred_brand || 'No Brand'
        : row.container_no.trim() || 'No Container';
      const group = groups.get(key) ?? { qty: 0, targetTotal: 0 };
      const qty = Number(row.qty);
      const targetPrice = Number(row.target_price);
      if (Number.isFinite(qty)) {
        group.qty += qty;
        if (row.target_price.trim() && Number.isFinite(targetPrice)) {
          group.targetTotal += qty * targetPrice;
        }
      }
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, totals]) => ({ key, ...totals }));
  });
  protected readonly totalQuantity = computed(() => this.itemRows().reduce((total, row) => {
    const qty = Number(row.qty);
    return row.item_code && Number.isFinite(qty) ? total + qty : total;
  }, 0));
  protected readonly form = this.formBuilder.nonNullable.group({
    namingSeries: [''],
    customer: ['', Validators.required],
    customerName: [''],
    inquiryDate: [this.today(), Validators.required],
    requiredDate: ['', Validators.required],
    status: ['Open'],
    company: ['', Validators.required],
    responsible: [''],
    currency: ['USD', Validators.required],
    paymentTerm: [''],
    amendedFrom: [''],
    shipmentRequired: [true],
    incoterms: [''],
    port: [''],
    transportType: [''],
    partialShipment: [''],
    transshipment: [''],
    groupTotalsBy: ['Container No'],
    confirmationMethod: [''],
    confirmationLog: [''],
    remarks: [''],
    rfqEmailsSent: [false],
  });

  constructor() {
    this.inquiries.loadOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => {
        this.customers.set(options.customers);
        this.companies.set(options.companies);
        this.users.set(options.users);
        this.currencies.set(options.currencies);
        this.paymentTerms.set(options.paymentTerms);
        this.incoterms.set(options.incoterms);
        this.items.set(options.items);
        this.uoms.set(options.uoms);
        this.brands.set(options.brands);
        this.defaults = Object.fromEntries(options.metadata.parent.fields.map((field) => [
          field.fieldname,
          field.default ?? null,
        ]));
        this.childDefaults = Object.fromEntries(options.metadata.child.fields.map((field) => [
          field.fieldname,
          field.default ?? null,
        ]));
        this.statuses.set(this.fieldOptions(options.metadata.parent.fields, 'status'));
        this.transportTypes.set(this.fieldOptions(options.metadata.parent.fields, 'transport_type'));
        this.shipmentLoads.set(this.fieldOptions(options.metadata.child.fields, 'shipment_load'));
        this.allowedOptions.set(this.fieldOptions(options.metadata.parent.fields, 'partial_shipment'));
        this.groupByOptions.set(this.fieldOptions(options.metadata.parent.fields, 'group_totals_by'));
        this.confirmationMethods.set(this.fieldOptions(options.metadata.parent.fields, 'confirmation_method'));
        this.applyDefaults();
        this.optionsLoaded = true;
        if (this.requestedName) {
          this.loadRecord(this.requestedName);
        }
        this.optionsLoading.set(false);
      },
      error: (error: unknown) => {
        this.optionsLoading.set(false);
        this.error.set(`Could not load Customer Inquiry fields and options: ${this.errorMessage(error)}`);
      },
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const name = params.get('name') ?? '';
      this.requestedName = name === 'new' ? '' : name;
      if (!this.optionsLoaded) {
        return;
      }
      if (this.requestedName) {
        this.loadRecord(this.requestedName);
      } else {
        this.resetNewInquiry();
      }
    });
  }

  protected get currentUser(): string {
    return this.auth.currentUser() ?? '';
  }

  protected get isReadOnly(): boolean {
    return this.docstatus() !== 0 && Boolean(this.inquiryName());
  }

  protected get customerName(): string {
    return this.customers().find((customer) => customer.name === this.form.controls.customer.value)?.customer_name
      ?? this.form.controls.customer.value;
  }

  protected setCustomer(event: Event): void {
    const customerName = (event.target as HTMLSelectElement).value;
    this.form.controls.customer.setValue(customerName);
    this.form.controls.customerName.setValue(
      this.customers().find((customer) => customer.name === customerName)?.customer_name ?? '',
    );
    this.form.markAsDirty();
  }

  protected setGroupBy(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.groupBy.set(value);
    this.form.controls.groupTotalsBy.setValue(value);
    this.form.markAsDirty();
  }

  protected setInquiryField(
    index: number,
    field: keyof Omit<CustomerInquiryDraftItem, 'rowId'>,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    const selectedItem = field === 'item_code'
      ? this.items().find((item) => item.item_code === value)
      : undefined;
    this.itemRows.update((rows) => rows.map((row, rowIndex) => rowIndex !== index
      ? row
      : {
        ...row,
        [field]: value,
        ...(field === 'item_code' ? {
          item_description: selectedItem?.item_name ?? '',
          uom: selectedItem?.stock_uom ?? '',
        } : {}),
      }));
    this.form.markAsDirty();
  }

  protected addItem(): void {
    if (!this.isReadOnly) {
      this.itemRows.update((rows) => [...rows, this.emptyItem()]);
    }
  }

  protected removeItem(index: number): void {
    this.itemRows.update((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    this.form.markAsDirty();
  }

  protected save(submit: boolean): void {
    if (this.optionsLoading() || this.loading() || this.saving() || this.isReadOnly) {
      return;
    }
    this.error.set('');
    this.message.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Complete the required customer, inquiry date, required date, company, and currency fields.');
      return;
    }
    const validRows: Array<Record<string, unknown>> = [];
    for (const [index, row] of this.itemRows().entries()) {
      if (!row.item_code && !row.qty.trim()) {
        continue;
      }
      const item = this.items().find((option) => option.item_code === row.item_code);
      const qty = Number(row.qty);
      if (!item || !Number.isFinite(qty) || qty <= 0) {
        this.error.set(`Select an item and enter a positive quantity on row ${index + 1}.`);
        return;
      }
      const targetPrice = row.target_price.trim() ? Number(row.target_price) : null;
      if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
        this.error.set(`Enter a valid non-negative target price on row ${index + 1}.`);
        return;
      }
      validRows.push({
        doctype: 'Customer Inquiry Item',
        item_code: item.item_code,
        item_description: row.item_description || item.item_name || item.item_code,
        qty,
        uom: row.uom || item.stock_uom || null,
        container_no: row.container_no || null,
        target_price: targetPrice,
        preferred_brand: row.preferred_brand || null,
        shipment_load: row.shipment_load || null,
        remarks: row.remarks || null,
      });
    }
    if (!validRows.length) {
      this.error.set('Add at least one requested item to the Customer Inquiry.');
      return;
    }

    const value = this.form.getRawValue();
    const document: Record<string, unknown> = {
      doctype: 'Customer Inquiry',
      naming_series: value.namingSeries || this.defaults['naming_series'] || undefined,
      customer: value.customer,
      customer_name: value.customerName || this.customerName,
      inquiry_date: value.inquiryDate,
      required_date: value.requiredDate,
      status: value.status,
      company: value.company,
      responsible: value.responsible || null,
      currency: value.currency,
      payment_term: value.paymentTerm || null,
      shipment_required: value.shipmentRequired ? 1 : 0,
      incoterms: value.incoterms || null,
      port: value.port || null,
      transport_type: value.transportType || null,
      partial_shipment: value.partialShipment || null,
      transshipment: value.transshipment || null,
      group_totals_by: value.groupTotalsBy || null,
      confirmation_method: value.confirmationMethod || null,
      confirmation_log: value.confirmationLog || null,
      remarks: value.remarks || null,
      items: validRows,
    };

    this.saving.set(true);
    this.inquiries.saveInquiry(document, this.inquiryName() || undefined).pipe(
      switchMap((saved) => submit
        ? this.inquiries.submitInquiry(saved).pipe(
          map((submitted) => ({ saved: submitted, submitError: '' })),
          catchError((error: unknown) => this.inquiries.getInquiry(saved.name).pipe(
            map((draft) => ({
              saved: draft,
              submitError: `Draft was saved, but Frappe could not submit it: ${this.errorMessage(error)}`,
            })),
          )),
        )
        : of({ saved, submitError: '' })),
      map((result) => ({ ...result, wasCreated: !this.inquiryName() })),
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ saved, submitError, wasCreated }) => {
        this.currentRecord = saved;
        this.inquiryName.set(saved.name);
        this.docstatus.set(saved.docstatus);
        this.status.set(saved.status || 'Open');
        this.message.set(submitError
          ? `Customer Inquiry ${saved.name} remains a draft.`
          : submit
            ? `Customer Inquiry ${saved.name} submitted successfully.`
            : `Customer Inquiry ${saved.name} saved successfully.`);
        this.error.set(submitError);
        if (wasCreated) {
          this.preserveNextLoadError = Boolean(submitError);
          void this.router.navigate(['/customer-inquiry', saved.name], { replaceUrl: true });
        } else if (saved.docstatus !== 0 || submitError) {
          this.loadRecord(saved.name, Boolean(submitError));
        }
      },
      error: (error: unknown) => this.error.set(this.errorMessage(error)),
    });
  }

  protected cancelInquiry(): void {
    const record = this.currentRecord;
    if (!record || record.docstatus !== 1 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.inquiries.cancelInquiry(record).pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (cancelled) => {
        this.currentRecord = cancelled;
        this.docstatus.set(cancelled.docstatus);
        this.status.set(cancelled.status || 'Cancelled');
        this.message.set(`Customer Inquiry ${cancelled.name} cancelled successfully.`);
        this.form.disable({ emitEvent: false });
      },
      error: (error: unknown) => this.error.set(this.errorMessage(error)),
    });
  }

  protected statusLabel(): string {
    if (this.docstatus() === 1) {
      return `${this.status()} · Submitted`;
    }
    return this.docstatus() === 2 ? 'Cancelled' : `${this.status()} · Draft`;
  }

  protected formatCurrency(amount: number): string {
    const currency = this.form.controls.currency.value;
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  private loadRecord(name: string, preserveError = false): void {
    this.loading.set(true);
    if (preserveError || this.preserveNextLoadError) {
      this.preserveNextLoadError = false;
    } else {
      this.error.set('');
    }
    this.inquiries.getInquiry(name).pipe(
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (record) => {
        this.currentRecord = record;
        this.inquiryName.set(record.name);
        this.docstatus.set(record.docstatus);
        this.status.set(record.status || 'Open');
        if (record.customer && !this.customers().some((customer) => customer.name === record.customer)) {
          this.customers.update((customers) => [...customers, {
            name: record.customer,
            customer_name: record.customer_name,
          }]);
        }
        this.form.patchValue({
          namingSeries: record.naming_series ?? '',
          customer: record.customer,
          customerName: record.customer_name ?? '',
          inquiryDate: record.inquiry_date,
          requiredDate: record.required_date,
          status: record.status ?? 'Open',
          company: record.company,
          responsible: record.responsible ?? '',
          currency: record.currency,
          paymentTerm: record.payment_term ?? '',
          amendedFrom: record.amended_from ?? '',
          shipmentRequired: Boolean(record.shipment_required),
          incoterms: record.incoterms ?? '',
          port: record.port ?? '',
          transportType: record.transport_type ?? '',
          partialShipment: record.partial_shipment ?? '',
          transshipment: record.transshipment ?? '',
          groupTotalsBy: record.group_totals_by ?? 'Container No',
          confirmationMethod: record.confirmation_method ?? '',
          confirmationLog: record.confirmation_log ?? '',
          remarks: record.remarks ?? '',
          rfqEmailsSent: Boolean(record.rfq_emails_sent),
        }, { emitEvent: false });
        this.groupBy.set(record.group_totals_by ?? 'Container No');
        this.itemRows.set((record.items ?? []).map((item) => ({
          rowId: this.nextItemRowId++,
          item_code: item.item_code,
          item_description: item.item_description ?? '',
          qty: String(item.qty ?? ''),
          uom: item.uom ?? '',
          container_no: item.container_no ?? '',
          target_price: item.target_price === undefined || item.target_price === null
            ? ''
            : String(item.target_price),
          preferred_brand: item.preferred_brand ?? '',
          shipment_load: item.shipment_load ?? '',
          remarks: item.remarks ?? '',
        })));
        if (record.docstatus !== 0) {
          this.form.disable({ emitEvent: false });
        } else {
          this.form.enable({ emitEvent: false });
        }
        this.form.markAsPristine();
      },
      error: (error: unknown) => this.error.set(`Could not load Customer Inquiry ${name}: ${this.errorMessage(error)}`),
    });
  }

  private applyDefaults(): void {
    const defaults = this.defaults;
    const today = this.today();
    const currency = defaults['currency'] ?? 'USD';
    const responsible = defaults['responsible'] === '__user'
      ? this.currentUser
      : defaults['responsible'] ?? this.currentUser;
    this.form.patchValue({
      namingSeries: defaults['naming_series'] ?? '',
      inquiryDate: defaults['inquiry_date'] === 'Today' ? today : defaults['inquiry_date'] ?? today,
      status: defaults['status'] ?? 'Open',
      responsible,
      currency: this.currencies().some((option) => option.name === currency)
        ? currency
        : this.currencies()[0]?.name ?? '',
      paymentTerm: defaults['payment_term'] ?? '',
      shipmentRequired: defaults['shipment_required'] !== '0',
      incoterms: defaults['incoterms'] ?? '',
      port: defaults['port'] ?? '',
      transportType: defaults['transport_type'] ?? '',
      partialShipment: defaults['partial_shipment'] ?? '',
      transshipment: defaults['transshipment'] ?? '',
      groupTotalsBy: defaults['group_totals_by'] ?? 'Container No',
      confirmationMethod: defaults['confirmation_method'] ?? '',
    }, { emitEvent: false });
    this.groupBy.set(defaults['group_totals_by'] ?? 'Container No');
    if (!this.itemRows().length) {
      this.itemRows.set([this.emptyItem()]);
    }
  }

  private resetNewInquiry(): void {
    this.currentRecord = null;
    this.inquiryName.set('');
    this.docstatus.set(0);
    this.status.set('Open');
    this.message.set('');
    this.error.set('');
    this.form.enable({ emitEvent: false });
    this.form.reset({
      namingSeries: this.defaults['naming_series'] ?? '',
      customer: '',
      customerName: '',
      inquiryDate: this.today(),
      requiredDate: '',
      status: this.defaults['status'] ?? 'Open',
      company: '',
      responsible: this.defaults['responsible'] === '__user' ? this.currentUser : this.defaults['responsible'] ?? this.currentUser,
      currency: this.defaults['currency'] ?? 'USD',
      paymentTerm: this.defaults['payment_term'] ?? '',
      amendedFrom: '',
      shipmentRequired: this.defaults['shipment_required'] !== '0',
      incoterms: this.defaults['incoterms'] ?? '',
      port: this.defaults['port'] ?? '',
      transportType: this.defaults['transport_type'] ?? '',
      partialShipment: this.defaults['partial_shipment'] ?? '',
      transshipment: this.defaults['transshipment'] ?? '',
      groupTotalsBy: this.defaults['group_totals_by'] ?? 'Container No',
      confirmationMethod: '',
      confirmationLog: '',
      remarks: '',
      rfqEmailsSent: false,
    }, { emitEvent: false });
    this.groupBy.set(this.defaults['group_totals_by'] ?? 'Container No');
    this.itemRows.set([this.emptyItem()]);
  }

  private fieldOptions(
    fields: Array<{ fieldname: string; options?: string | null }>,
    fieldname: string,
  ): string[] {
    return fields.find((field) => field.fieldname === fieldname)?.options
      ?.split('\n')
      .map((option) => option.trim())
      .filter(Boolean) ?? [];
  }

  private emptyItem(): CustomerInquiryDraftItem {
    const childDefault = this.childDefaults['shipment_load'];
    return {
      rowId: this.nextItemRowId++,
      item_code: '',
      item_description: '',
      qty: '',
      uom: '',
      container_no: this.childDefaults['container_no'] ?? '1',
      target_price: '',
      preferred_brand: '',
      shipment_load: childDefault ?? 'FCL',
      remarks: '',
    };
  }

  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected Frappe error.';
  }
}
