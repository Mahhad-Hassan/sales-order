import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { FrappeDocTypeMetadata } from '../models/frappe-api.model';
import {
  CustomerInquiryCompany,
  CustomerInquiryCustomer,
  CustomerInquiryItemOption,
  CustomerInquiryLinkOption,
  CustomerInquiryMetadata,
  CustomerInquiryRecord,
} from '../models/customer-inquiry.model';
import { FrappeApiService } from './frappe-api.service';

@Injectable({ providedIn: 'root' })
export class FrappeCustomerInquiryService {
  private readonly api = inject(FrappeApiService);

  loadOptions(): Observable<{
    customers: CustomerInquiryCustomer[];
    companies: CustomerInquiryCompany[];
    users: CustomerInquiryLinkOption[];
    currencies: CustomerInquiryLinkOption[];
    paymentTerms: CustomerInquiryLinkOption[];
    incoterms: CustomerInquiryLinkOption[];
    items: CustomerInquiryItemOption[];
    uoms: CustomerInquiryLinkOption[];
    metadata: CustomerInquiryMetadata;
  }> {
    return forkJoin({
      customers: this.getAllPages<CustomerInquiryCustomer>(
        'Customer',
        ['name', 'customer_name'],
        [['disabled', '=', 0]],
      ),
      companies: this.getAllPages<CustomerInquiryCompany>('Company', ['name', 'default_currency'], []),
      users: this.getAllPages<CustomerInquiryLinkOption>(
        'User',
        ['name', 'full_name', 'enabled'],
        [['enabled', '=', 1]],
      ),
      currencies: this.getAllPages<CustomerInquiryLinkOption>('Currency', ['name'], []),
      paymentTerms: this.getAllPages<CustomerInquiryLinkOption>('Indent Payment Term', ['name'], []),
      incoterms: this.getAllPages<CustomerInquiryLinkOption>('Incoterm', ['name', 'title'], []),
      items: this.getAllPages<CustomerInquiryItemOption>(
        'Item',
        ['item_code', 'item_name', 'item_group', 'stock_uom', 'brand'],
        [['disabled', '=', 0]],
      ),
      uoms: this.getAllPages<CustomerInquiryLinkOption>('UOM', ['name'], []),
      metadata: forkJoin({
        parent: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Customer Inquiry'),
        child: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Customer Inquiry Item'),
      }),
    });
  }

  getInquiries(): Observable<CustomerInquiryRecord[]> {
    return this.getAllPages<CustomerInquiryRecord>(
      'Customer Inquiry',
      [
        'name',
        'customer',
        'customer_name',
        'inquiry_date',
        'required_date',
        'status',
        'company',
        'currency',
        'responsible',
        'docstatus',
      ],
      [],
    );
  }

  getInquiry(name: string): Observable<CustomerInquiryRecord> {
    return this.api.getDocument<CustomerInquiryRecord>('Customer Inquiry', name);
  }

  saveInquiry(document: Record<string, unknown>, name?: string): Observable<CustomerInquiryRecord> {
    return name
      ? this.api.updateDocument<CustomerInquiryRecord>('Customer Inquiry', name, document)
      : this.api.createDocument<CustomerInquiryRecord>('Customer Inquiry', document);
  }

  submitInquiry(inquiry: CustomerInquiryRecord): Observable<CustomerInquiryRecord> {
    return this.api.callMethod<CustomerInquiryRecord>('frappe.client.submit', {
      doc: JSON.stringify(inquiry),
    });
  }

  cancelInquiry(inquiry: CustomerInquiryRecord): Observable<CustomerInquiryRecord> {
    return this.api.callMethod<CustomerInquiryRecord>('frappe.client.cancel', {
      doc: JSON.stringify(inquiry),
    });
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
