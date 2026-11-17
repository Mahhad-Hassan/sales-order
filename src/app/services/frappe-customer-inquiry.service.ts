import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, of, reduce, switchMap, throwError } from 'rxjs';
import { FrappeDocTypeMetadata } from '../models/frappe-api.model';
import {
  CustomerInquiryCompany,
  CustomerInquiryCustomer,
  CustomerInquiryItemOption,
  CustomerInquiryLinkOption,
  CustomerInquiryMetadata,
  CustomerInquiryRecord,
} from '../models/customer-inquiry.model';
import { WorkflowConfiguration, WorkflowTransition } from '../models/sales-order.model';
import { FrappeApiService } from './frappe-api.service';

@Injectable({ providedIn: 'root' })
export class FrappeCustomerInquiryService {
  private readonly api = inject(FrappeApiService);

  loadOptions(currentUser: string): Observable<{
    customers: CustomerInquiryCustomer[];
    companies: CustomerInquiryCompany[];
    users: CustomerInquiryLinkOption[];
    currencies: CustomerInquiryLinkOption[];
    paymentTerms: CustomerInquiryLinkOption[];
    incoterms: CustomerInquiryLinkOption[];
    brands: CustomerInquiryLinkOption[];
    items: CustomerInquiryItemOption[];
    uoms: CustomerInquiryLinkOption[];
    canChangeCompany: boolean;
    workflow: WorkflowConfiguration | null;
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
      brands: this.getAllPages<CustomerInquiryLinkOption>('Brand', ['name'], []),
      items: this.getAllPages<CustomerInquiryItemOption>(
        'Item',
        ['item_code', 'item_name', 'item_group', 'stock_uom', 'brand'],
        [['disabled', '=', 0]],
      ),
      uoms: this.getAllPages<CustomerInquiryLinkOption>('UOM', ['name'], []),
      userProfile: this.api.getDocument<{ roles?: Array<{ role: string }> }>('User', currentUser),
      companyMetadata: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Company'),
      workflow: this.getActiveWorkflowConfiguration(),
      metadata: forkJoin({
        parent: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Customer Inquiry'),
        child: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Customer Inquiry Item'),
      }),
    }).pipe(map(({ userProfile, companyMetadata, ...options }) => {
      const roles = new Set((userProfile.roles ?? []).map(({ role }) => role));
      const canChangeCompany = companyMetadata.permissions?.some((permission) =>
        roles.has(permission.role)
        && Number(permission.write) === 1
        && Number(permission.if_owner ?? 0) === 0
        && Number(permission.permlevel ?? 0) === 0,
      ) ?? false;
      return { ...options, canChangeCompany };
    }));
  }

  getActiveWorkflowConfiguration(): Observable<WorkflowConfiguration | null> {
    return this.api.getList<Pick<
      WorkflowConfiguration,
      'name' | 'document_type' | 'workflow_state_field' | 'is_active'
    >>(
      'Workflow',
      ['name', 'document_type', 'workflow_state_field', 'is_active'],
      [['document_type', '=', 'Customer Inquiry'], ['is_active', '=', 1]],
      100,
    ).pipe(
      switchMap((workflows) => {
        const workflow = workflows.find((candidate) =>
          candidate.document_type === 'Customer Inquiry' && Number(candidate.is_active) === 1,
        );
        return workflow
          ? this.api.getDocument<WorkflowConfiguration>('Workflow', workflow.name)
          : of(null);
      }),
      map((workflow) => workflow
        && Number(workflow.is_active) === 1
        && workflow.document_type === 'Customer Inquiry'
        ? { ...workflow, states: workflow.states ?? [], transitions: workflow.transitions ?? [] }
        : null),
    );
  }

  getWorkflowTransitions(name: string): Observable<WorkflowTransition[]> {
    if (!name.trim()) {
      return of([]);
    }
    return this.getActiveWorkflowConfiguration().pipe(
      switchMap((workflow) => {
        const stateField = workflow?.workflow_state_field?.trim();
        if (!workflow || !stateField) {
          return of([]);
        }
        return this.getInquiry(name).pipe(
          switchMap((inquiry) => {
            const state = inquiry[stateField];
            if (typeof state !== 'string' || !state.trim()) {
              return of([]);
            }
            return this.api.callMethod<WorkflowTransition[]>('frappe.model.workflow.get_transitions', {
              doc: JSON.stringify(inquiry),
            });
          }),
        );
      }),
    );
  }

  applyWorkflowAction(name: string, action: string): Observable<CustomerInquiryRecord> {
    return this.getWorkflowTransitions(name).pipe(
      switchMap((transitions) => {
        if (!transitions.some((transition) => transition.action === action)) {
          return throwError(() =>
            new Error('This workflow action is no longer available for your account. Refresh the Customer Inquiry and try again.'),
          );
        }
        return this.api.callMethod<CustomerInquiryRecord>('frappe.model.workflow.apply_workflow', {
          doc: JSON.stringify({ doctype: 'Customer Inquiry', name }),
          action,
        }).pipe(switchMap(() => this.getInquiry(name)));
      }),
    );
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
      doctype: 'Customer Inquiry',
      name: inquiry.name,
    }).pipe(switchMap(() => this.getInquiry(inquiry.name)));
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
