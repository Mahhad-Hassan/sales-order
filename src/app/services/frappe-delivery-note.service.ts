import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, of, reduce, switchMap, throwError } from 'rxjs';
import { FrappeDocTypeMetadata } from '../models/frappe-api.model';
import {
  DeliveryNoteCompany,
  DeliveryNoteCustomer,
  DeliveryNoteItemPrice,
  DeliveryNoteItemOption,
  DeliveryNotePartyOption,
  DeliveryNotePriceList,
  DeliveryNoteRecord,
  DeliveryNoteWarehouse,
} from '../models/delivery-note.model';
import { FrappeApiService } from './frappe-api.service';

@Injectable({ providedIn: 'root' })
export class FrappeDeliveryNoteService {
  private readonly api = inject(FrappeApiService);

  loadOptions(): Observable<{
    companies: DeliveryNoteCompany[];
    customers: DeliveryNoteCustomer[];
    items: DeliveryNoteItemOption[];
    priceLists: DeliveryNotePriceList[];
    suppliers: DeliveryNotePartyOption[];
    drivers: DeliveryNotePartyOption[];
    warehouses: DeliveryNoteWarehouse[];
    metadata: FrappeDocTypeMetadata;
  }> {
    return forkJoin({
      companies: this.getAllPages<DeliveryNoteCompany>('Company', ['name', 'default_currency', 'default_warehouse'], []),
      customers: this.getAllPages<DeliveryNoteCustomer>(
        'Customer',
        ['name', 'customer_name', 'disabled'],
        [['disabled', '=', 0]],
      ),
      items: this.getAllPages<DeliveryNoteItemOption>(
        'Item',
        ['item_code', 'item_name', 'stock_uom'],
        [['disabled', '=', 0], ['is_stock_item', '=', 1]],
      ),
      priceLists: this.getAllPages<DeliveryNotePriceList>(
        'Price List',
        ['name', 'currency', 'selling', 'enabled'],
        [['selling', '=', 1], ['enabled', '=', 1]],
      ),
      suppliers: this.getAllPages<DeliveryNotePartyOption>(
        'Supplier',
        ['name', 'supplier_name'],
        [['disabled', '=', 0]],
      ),
      drivers: this.getAllPages<DeliveryNotePartyOption>('Driver', ['name'], []),
      warehouses: this.getAllPages<DeliveryNoteWarehouse>(
        'Warehouse',
        ['name', 'company', 'is_group', 'disabled'],
        [['is_group', '=', 0], ['disabled', '=', 0]],
      ),
      metadata: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Delivery Note'),
    });
  }

  getDeliveryNotes(): Observable<DeliveryNoteRecord[]> {
    return this.getAllPages<DeliveryNoteRecord>(
      'Delivery Note',
      [
        'name',
        'customer',
        'customer_name',
        'posting_date',
        'status',
        'docstatus',
        'company',
        'grand_total',
        'currency',
        'total_qty',
      ],
      [],
    );
  }

  getDeliveryNote(name: string): Observable<DeliveryNoteRecord> {
    return this.api.getDocument<DeliveryNoteRecord>('Delivery Note', name);
  }

  saveDeliveryNote(document: Record<string, unknown>, name?: string): Observable<DeliveryNoteRecord> {
    return name
      ? this.api.updateDocument<DeliveryNoteRecord>('Delivery Note', name, document)
      : this.api.createDocument<DeliveryNoteRecord>('Delivery Note', document);
  }

  submitDeliveryNote(order: DeliveryNoteRecord): Observable<DeliveryNoteRecord> {
    return this.api.callMethod<DeliveryNoteRecord>('frappe.client.submit', {
      doc: JSON.stringify(order),
    });
  }

  getItemPriceRate(itemCode: string, priceList: string, unit: string, date: string): Observable<number | null> {
    return this.getAllPages<DeliveryNoteItemPrice>(
      'Item Price',
      ['name', 'item_code', 'price_list', 'price_list_rate', 'uom', 'valid_from', 'valid_upto', 'selling'],
      [['item_code', '=', itemCode], ['price_list', '=', priceList], ['selling', '=', 1]],
    ).pipe(
      map((prices) => {
        const availablePrices = prices.filter((price) =>
          price.item_code === itemCode
          && price.price_list === priceList
          && price.selling === 1
          && Number.isFinite(price.price_list_rate)
          && price.price_list_rate >= 0,
        );
        const matchingUnit = availablePrices.filter((price) => price.uom === unit);
        const defaultUnit = availablePrices.filter((price) => !price.uom);
        const candidates = [...matchingUnit, ...defaultUnit];
        const dateValidPrices = candidates.filter((price) =>
          (!price.valid_from || price.valid_from <= date)
          && (!price.valid_upto || price.valid_upto >= date),
        );
        const newestPrice = (options: DeliveryNoteItemPrice[]) => options
          .sort((left, right) => (right.valid_from ?? '').localeCompare(left.valid_from ?? ''))[0];
        const selectedPrice = newestPrice(dateValidPrices) ?? newestPrice(candidates);
        return selectedPrice?.price_list_rate ?? null;
      }),
    );
  }

  getExchangeRate(fromCurrency: string, toCurrency: string, date: string): Observable<number> {
    if (fromCurrency === toCurrency) {
      return of(1);
    }

    return this.api.getList<{ exchange_rate: number; date: string }>(
      'Currency Exchange',
      ['exchange_rate', 'date'],
      [
        ['from_currency', '=', fromCurrency],
        ['to_currency', '=', toCurrency],
        ['date', '<=', date],
      ],
      100,
    ).pipe(
      map((records) => {
        const latest = records
          .filter((record) => Number.isFinite(record.exchange_rate) && record.exchange_rate > 0)
          .sort((left, right) => right.date.localeCompare(left.date))[0];
        if (!latest) {
          throw new Error(`No ${fromCurrency} to ${toCurrency} exchange rate is configured for ${date}.`);
        }
        return latest.exchange_rate;
      }),
    );
  }

  private getAllPages<T>(doctype: string, fields: string[], filters: unknown[][]): Observable<T[]> {
    const pageSize = 500;
    return this.api.getList<T>(doctype, fields, filters, pageSize).pipe(
      expand((page, index) => page.length === pageSize
        ? this.api.getList<T>(doctype, fields, filters, pageSize, (index + 1) * pageSize)
        : EMPTY),
      reduce((records, page) => {
        records.push(...page);
        return records;
      }, [] as T[]),
    );
  }
}
