import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, map, of, switchMap } from 'rxjs';
import {
  DeliveryNoteCompany,
  DeliveryNoteDraftItem,
  DeliveryNoteItemOption,
  DeliveryNotePriceList,
  DeliveryNoteRecord,
  DeliveryNoteWarehouse,
} from './models/delivery-note.model';
import { DeliveryNotePartyOption } from './models/delivery-note.model';
import { FrappeAuthService } from './services/frappe-auth.service';
import { FrappeDeliveryNoteService } from './services/frappe-delivery-note.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-delivery-note-form',
  styleUrl: './delivery-note-form.scss',
  templateUrl: './delivery-note-form.html',
})
export class DeliveryNoteFormPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly deliveryNotes = inject(FrappeDeliveryNoteService);
  private readonly auth = inject(FrappeAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private optionsLoaded = false;
  private requestedName = '';
  private namingSeries = '';

  protected readonly companies = signal<DeliveryNoteCompany[]>([]);
  protected readonly customers = signal<Array<{ name: string; customer_name?: string | null }>>([]);
  protected readonly items = signal<DeliveryNoteItemOption[]>([]);
  protected readonly priceLists = signal<DeliveryNotePriceList[]>([]);
  protected readonly suppliers = signal<DeliveryNotePartyOption[]>([]);
  protected readonly drivers = signal<DeliveryNotePartyOption[]>([]);
  protected readonly warehouses = signal<DeliveryNoteWarehouse[]>([]);
  protected readonly itemRows = signal<DeliveryNoteDraftItem[]>([this.emptyItem()]);
  protected readonly customerSearch = signal('');
  protected readonly optionsLoading = signal(true);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly orderName = signal('');
  protected readonly docstatus = signal(0);
  protected readonly status = signal('Draft');
  protected readonly filteredCustomers = computed(() => {
    const query = this.customerSearch().trim().toLocaleLowerCase();
    return this.customers().filter((customer) => !query
      || `${customer.customer_name ?? ''} ${customer.name}`.toLocaleLowerCase().includes(query));
  });
  protected readonly filteredWarehouses = computed(() => {
    const company = this.form.controls.company.value;
    return this.warehouses().filter((warehouse) => warehouse.company === company);
  });
  protected readonly form = this.formBuilder.nonNullable.group({
    customer: ['', Validators.required],
    postingDate: [this.today(), Validators.required],
    company: ['', Validators.required],
    warehouse: [''],
    priceList: ['', Validators.required],
    terms: [''],
    transporter: [''],
    lrNo: [''],
    lrDate: [''],
    vehicleNo: [''],
    driver: [''],
    driverName: [''],
    poNo: [''],
    poDate: [''],
  });

  constructor() {
    this.deliveryNotes.loadOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => {
        this.companies.set(options.companies);
        this.customers.set(options.customers);
        this.items.set(options.items);
        this.priceLists.set(options.priceLists);
        this.suppliers.set(options.suppliers);
        this.drivers.set(options.drivers);
        this.warehouses.set(options.warehouses);
        const seriesField = options.metadata.fields.find((field) => field.fieldname === 'naming_series');
        this.namingSeries = seriesField?.default
          || seriesField?.options?.split('\n').find((option) => option.trim())
          || '';
        this.optionsLoaded = true;
        if (this.requestedName) {
          this.loadRecord(this.requestedName);
        } else {
          this.setNewOrderDefaults();
        }
        this.optionsLoading.set(false);
      },
      error: (error: unknown) => {
        this.optionsLoading.set(false);
        this.error.set(`Could not load Delivery Note fields and options: ${this.errorMessage(error)}`);
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
        this.resetNewOrder();
      }
    });
  }

  protected get currentUser(): string {
    return this.auth.currentUser() ?? '';
  }

  protected get isReadOnly(): boolean {
    return this.docstatus() !== 0 && Boolean(this.orderName());
  }

  protected setCustomerSearch(event: Event): void {
    this.customerSearch.set((event.target as HTMLInputElement).value);
  }

  protected setCompany(event: Event): void {
    const companyName = (event.target as HTMLSelectElement).value;
    const company = this.companies().find((option) => option.name === companyName);
    this.form.controls.company.setValue(companyName);
    this.form.controls.warehouse.setValue(company?.default_warehouse ?? '');
    const defaultPriceList = this.priceLists().find((priceList) =>
      priceList.currency === company?.default_currency,
    ) ?? this.priceLists()[0];
    this.form.controls.priceList.setValue(defaultPriceList?.name ?? '');
    this.itemRows.update((rows) => rows.map((row) => ({
      ...row,
      warehouse: row.warehouse || company?.default_warehouse || '',
    })));
    this.form.markAsDirty();
  }

  protected addItem(): void {
    if (!this.isReadOnly) {
      this.itemRows.update((rows) => [...rows, this.emptyItem()]);
    }
  }

  protected removeItem(index: number): void {
    this.itemRows.update((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  protected setItemField(index: number, field: 'item_code' | 'qty' | 'warehouse' | 'rate', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.itemRows.update((rows) => rows.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      const updated = { ...row, [field]: value };
      if (field === 'item_code') {
        updated.warehouse = updated.warehouse || this.form.controls.warehouse.value;
      }
      return updated;
    }));
    this.form.markAsDirty();
  }

  protected selectedItem(itemCode: string): DeliveryNoteItemOption | undefined {
    return this.items().find((item) => item.item_code === itemCode);
  }

  protected save(submit: boolean): void {
    if (this.optionsLoading() || this.loading() || this.saving() || this.isReadOnly) {
      return;
    }
    this.error.set('');
    this.message.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Select a customer, company, posting date, and price list before saving.');
      return;
    }
    if (!this.namingSeries) {
      this.error.set('The Delivery Note naming series is not configured in Frappe.');
      return;
    }
    const company = this.companies().find((option) => option.name === this.form.controls.company.value);
    const priceList = this.priceLists().find((option) => option.name === this.form.controls.priceList.value);
    if (!company || !priceList) {
      this.error.set('Select a valid company and selling price list.');
      return;
    }
    const validRows: Array<Record<string, unknown>> = [];
    for (const [index, row] of this.itemRows().entries()) {
      if (!row.item_code && !row.qty.trim() && !row.rate.trim()) {
        continue;
      }
      const item = this.selectedItem(row.item_code);
      const quantity = Number(row.qty);
      const rateText = row.rate.trim();
      const rate = rateText ? Number(rateText) : undefined;
      if (!item || !Number.isFinite(quantity) || quantity <= 0
        || (rateText && (!Number.isFinite(rate) || Number(rate) < 0))) {
        this.error.set(`Enter a valid stock item and positive quantity on item row ${index + 1}; rate must be zero or greater.`);
        return;
      }
      validRows.push({
        item_code: item.item_code,
        item_name: item.item_name || item.item_code,
        qty: quantity,
        uom: item.stock_uom,
        stock_uom: item.stock_uom,
        conversion_factor: 1,
        warehouse: row.warehouse || this.form.controls.warehouse.value || null,
        ...(rate === undefined ? {} : { rate }),
      });
    }
    if (!validRows.length) {
      this.error.set('Add at least one stock item to the Delivery Note.');
      return;
    }

    this.saving.set(true);
    this.deliveryNotes.getExchangeRate(priceList.currency, company.default_currency, this.form.controls.postingDate.value).pipe(
      switchMap((priceListRate) => {
        const value = this.form.getRawValue();
        const document: Record<string, unknown> = {
          doctype: 'Delivery Note',
          naming_series: this.namingSeries,
          customer: value.customer,
          posting_date: value.postingDate,
          company: company.name,
          currency: company.default_currency,
          conversion_rate: 1,
          selling_price_list: priceList.name,
          price_list_currency: priceList.currency,
          plc_conversion_rate: priceListRate,
          set_warehouse: value.warehouse || null,
          items: validRows,
          terms: value.terms || null,
          transporter: value.transporter || null,
          lr_no: value.lrNo || null,
          lr_date: value.lrDate || null,
          vehicle_no: value.vehicleNo || null,
          driver: value.driver || null,
          driver_name: value.driverName || null,
          po_no: value.poNo || null,
          po_date: value.poDate || null,
        };
        return this.deliveryNotes.saveDeliveryNote(document, this.orderName() || undefined).pipe(
          switchMap((saved) => submit
            ? this.deliveryNotes.submitDeliveryNote(saved).pipe(
              map((submitted) => ({ saved: submitted, submitError: '' })),
              catchError((error: unknown) => this.deliveryNotes.getDeliveryNote(saved.name).pipe(
                map((draft) => ({
                  saved: draft,
                  submitError: `Draft was saved, but Frappe could not submit it: ${this.errorMessage(error)}`,
                })),
              )),
            )
            : of({ saved, submitError: '' })),
          map((result) => ({ ...result, wasCreated: !this.orderName() })),
        );
      }),
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ saved, submitError, wasCreated }) => {
        this.orderName.set(saved.name);
        this.docstatus.set(saved.docstatus);
        this.status.set(saved.status || (saved.docstatus === 1 ? 'Submitted' : 'Draft'));
        this.message.set(submitError
          ? `Delivery Note ${saved.name} remains a draft.`
          : submit
            ? `Delivery Note ${saved.name} submitted successfully.`
            : `Delivery Note ${saved.name} saved successfully.`);
        this.error.set(submitError);
        if (wasCreated) {
          void this.router.navigate(['/delivery-note', saved.name], { replaceUrl: true });
        } else if (saved.docstatus !== 0 || submitError) {
          this.loadRecord(saved.name);
        }
      },
      error: (error: unknown) => this.error.set(this.errorMessage(error)),
    });
  }

  protected statusLabel(): string {
    return this.status();
  }

  private loadRecord(name: string): void {
    this.loading.set(true);
    this.error.set('');
    this.deliveryNotes.getDeliveryNote(name).pipe(
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (record) => {
        this.orderName.set(record.name);
        this.docstatus.set(record.docstatus);
        this.status.set(record.status || (record.docstatus === 1 ? 'Submitted' : 'Draft'));
        const customer = this.customers().some((option) => option.name === record.customer)
          ? this.customers()
          : [...this.customers(), { name: record.customer, customer_name: record.customer_name }];
        this.customers.set(customer);
        this.form.patchValue({
          customer: record.customer,
          postingDate: record.posting_date,
          company: record.company,
          warehouse: record.set_warehouse ?? '',
          priceList: this.priceLists().find((priceList) => priceList.currency === record.currency)?.name ?? '',
          terms: record.terms ?? '',
          transporter: record.transporter ?? '',
          lrNo: record.lr_no ?? '',
          lrDate: record.lr_date ?? '',
          vehicleNo: record.vehicle_no ?? '',
          driverName: record.driver_name ?? '',
          poNo: record.po_no ?? '',
          poDate: record.po_date ?? '',
        }, { emitEvent: false });
        if (record.transporter && !this.suppliers().some((supplier) => supplier.name === record.transporter)) {
          this.suppliers.update((suppliers) => [...suppliers, { name: record.transporter as string }]);
        }
        if (record.driver && !this.drivers().some((driver) => driver.name === record.driver)) {
          this.drivers.update((drivers) => [...drivers, { name: record.driver as string }]);
        }
        this.form.controls.driver.setValue(record.driver ?? '', { emitEvent: false });
        this.itemRows.set((record.items ?? []).map((item) => ({
          item_code: item.item_code,
          qty: String(item.qty ?? ''),
          warehouse: item.warehouse ?? '',
          rate: item.rate === undefined ? '' : String(item.rate),
        })));
        if (!this.itemRows().length) {
          this.itemRows.set([this.emptyItem()]);
        }
        if (record.docstatus !== 0) {
          this.form.disable({ emitEvent: false });
        } else {
          this.form.enable({ emitEvent: false });
        }
        this.form.markAsPristine();
      },
      error: (error: unknown) => this.error.set(`Could not load Delivery Note ${name}: ${this.errorMessage(error)}`),
    });
  }

  private resetNewOrder(): void {
    this.orderName.set('');
    this.docstatus.set(0);
    this.status.set('Draft');
    this.message.set('');
    this.error.set('');
    this.form.enable({ emitEvent: false });
    this.form.reset({
      customer: '',
      postingDate: this.today(),
      company: '',
      warehouse: '',
      priceList: '',
      terms: '',
      transporter: '',
      lrNo: '',
      lrDate: '',
      vehicleNo: '',
      driver: '',
      driverName: '',
      poNo: '',
      poDate: '',
    }, { emitEvent: false });
    this.itemRows.set([this.emptyItem()]);
    this.setNewOrderDefaults();
  }

  private setNewOrderDefaults(): void {
    if (!this.companies().length) {
      return;
    }
    const company = this.companies()[0];
    const priceList = this.priceLists().find((option) =>
      option.currency === company.default_currency,
    ) ?? this.priceLists()[0];
    this.form.patchValue({
      company: company.name,
      warehouse: company.default_warehouse ?? '',
      priceList: priceList?.name ?? '',
    }, { emitEvent: false });
  }

  private emptyItem(): DeliveryNoteDraftItem {
    return { item_code: '', qty: '', warehouse: '', rate: '' };
  }

  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected Frappe error.';
  }
}
