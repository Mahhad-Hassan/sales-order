import { Injectable, inject } from '@angular/core';
import { EMPTY, concatMap, expand, forkJoin, from, map, mergeMap, Observable, of, reduce, switchMap, tap, throwError } from 'rxjs';
import {
  CompanyOption,
  AssignmentUserGroupOption,
  AssignmentUserOption,
  EmployeeOption,
  IncotermOption,
  ItemPriceOption,
  LinkedDocumentStatus,
  PaymentTermOption,
  SalesOrderItemOption,
  SalesOrderListOption,
  SalesOrderRecord,
  SellingPriceListOption,
  WorkflowConfiguration,
  WorkflowTransition,
  WorkflowStateOption,
} from '../models/sales-order.model';
import { FrappeDocTypeMetadata, FrappeMethodResponse } from '../models/frappe-api.model';
import { FrappeApiService } from './frappe-api.service';
import { FrappeCompanyAccessService } from './frappe-company-access.service';

@Injectable({ providedIn: 'root' })
export class FrappeSalesOrderService {
  private readonly api = inject(FrappeApiService);
  private readonly companyAccess = inject(FrappeCompanyAccessService);

  loadOptions(currentUser: string): Observable<{
    companies: CompanyOption[];
    canChangeCompany: boolean;
    employees: EmployeeOption[];
    incoterms: IncotermOption[];
    items: SalesOrderItemOption[];
    paymentTerms: PaymentTermOption[];
    priceLists: SellingPriceListOption[];
    orders: SalesOrderListOption[];
    salesOrderMetadata: FrappeDocTypeMetadata;
    salesOrderWorkflow: WorkflowConfiguration | null;
    workflowStateStyles: Record<string, string>;
  }> {
    return forkJoin({
      companies: this.api.getList<CompanyOption>(
        'Company',
        ['name', 'default_currency', 'default_warehouse'],
        [],
        500,
      ),
      companyAccess: this.companyAccess.getAccess(currentUser, 'Sales Order'),
      employees: this.getAllPages<EmployeeOption>('Employee', ['name', 'employee_name', 'user_id'], []),
      incoterms: this.api.getList<IncotermOption>('Incoterm', ['name', 'title'], [], 500),
      items: this.api.getList<SalesOrderItemOption>(
        'Item',
        ['item_code', 'item_name', 'stock_uom'],
        [],
        1000,
      ),
      paymentTerms: this.api.getList<PaymentTermOption>(
        'Payment Term',
        ['name', 'payment_term_name', 'due_date_based_on', 'credit_days', 'credit_months'],
        [],
        500,
      ),
      priceLists: this.api.getList<SellingPriceListOption>(
        'Price List',
        ['name', 'currency', 'selling', 'enabled'],
        [['selling', '=', 1], ['enabled', '=', 1]],
        500,
      ),
      orders: this.api.getList<SalesOrderListOption>(
        'Sales Order',
        ['name', 'customer', 'customer_name', 'transaction_date', 'delivery_date', 'total', 'grand_total', 'currency', 'status', 'docstatus'],
        [],
        100,
      ),
      salesOrderMetadata: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Sales Order'),
      salesOrderWorkflow: this.getActiveWorkflowConfiguration('Sales Order'),
      workflowStateStyles: this.getWorkflowStateStyles(),
    }).pipe(map(({ companyAccess, ...options }) => ({
      ...options,
      companies: companyAccess.allowedCompanyNames
        ? options.companies.filter((company) => companyAccess.allowedCompanyNames?.includes(company.name))
        : options.companies,
      canChangeCompany: companyAccess.canChangeCompany,
    })));
  }

  getSalesOrder(name: string): Observable<SalesOrderRecord> {
    return this.api.getDocument<SalesOrderRecord>('Sales Order', name);
  }

  getSalesOrderWorkflowTransitions(name: string): Observable<WorkflowTransition[]> {
    if (!name.trim()) {
      return of([]);
    }
    return this.getActiveWorkflowConfiguration('Sales Order').pipe(
      switchMap((workflow) => {
        const stateField = workflow?.workflow_state_field?.trim();
        if (!workflow || workflow.is_active !== 1 || !stateField) {
          return of([]);
        }
        return this.getSalesOrder(name).pipe(
          switchMap((order) => {
            const state = order[stateField];
            if (typeof state !== 'string' || !state.trim()) {
              return of([]);
            }
            return this.api.callMethod<WorkflowTransition[]>('frappe.model.workflow.get_transitions', {
              doc: JSON.stringify(order),
            });
          }),
        );
      }),
    );
  }

  applySalesOrderWorkflowAction(name: string, action: string): Observable<SalesOrderRecord> {
    return this.getSalesOrderWorkflowTransitions(name).pipe(
      switchMap((transitions) => {
        if (!transitions.some((transition) => transition.action === action)) {
          return throwError(() =>
            new Error('This workflow action is no longer available for your account. Refresh the Sales Order and try again.'),
          );
        }
        return this.api.callMethod<SalesOrderRecord>('frappe.model.workflow.apply_workflow', {
          doc: JSON.stringify({ doctype: 'Sales Order', name }),
          action,
        }).pipe(switchMap(() => this.getSalesOrder(name)));
      }),
    );
  }

  getAssignmentOptions(): Observable<{
    users: AssignmentUserOption[];
    userGroups: AssignmentUserGroupOption[];
  }> {
    return forkJoin({
      users: this.api.getList<AssignmentUserOption>(
        'User',
        ['name', 'full_name', 'email'],
        [['enabled', '=', 1], ['user_type', '=', 'System User']],
        500,
      ),
      userGroups: this.api.getList<AssignmentUserGroupOption>('User Group', ['name'], [], 500),
    });
  }

  getUserGroupMembers(groupName: string): Observable<string[]> {
    return this.api.getDocument<{
      user_group_members?: Array<{ user?: string | null }>;
    }>('User Group', groupName).pipe(
      map((group) => [...new Set((group.user_group_members ?? [])
        .map((member) => member.user?.trim())
        .filter((user): user is string => Boolean(user)))]),
    );
  }

  getSalesOrderAttachments(name: string): Observable<Array<{ name: string; file_name: string }>> {
    return this.api.getList<{ name: string; file_name: string }>(
      'File',
      ['name', 'file_name'],
      [['attached_to_doctype', '=', 'Sales Order'], ['attached_to_name', '=', name]],
      500,
    );
  }

  getDefaultOutgoingEmailSender(): Observable<string> {
    return this.api.getList<{ email_id: string }>(
      'Email Account',
      ['email_id'],
      [['enable_outgoing', '=', 1], ['default_outgoing', '=', 1]],
      10,
    ).pipe(
      map((accounts) => {
        const senders = [...new Set(accounts
          .map((account) => account.email_id?.trim())
          .filter((email): email is string => Boolean(email)))];
        if (senders.length !== 1) {
          throw new Error(senders.length
            ? 'Frappe has more than one default outgoing email sender. Ask an administrator to configure exactly one.'
            : 'Frappe has no enabled default outgoing email sender.');
        }
        return senders[0];
      }),
    );
  }

  assignSalesOrder(
    name: string,
    assignment: {
      assignTo: string[];
      date: string;
      priority: 'Low' | 'Medium' | 'High';
      description: string;
    },
  ): Observable<FrappeMethodResponse<unknown>> {
    return this.api.callMethodResponse<unknown>('frappe.desk.form.assign_to.add', {
      doctype: 'Sales Order',
      name,
      assign_to: JSON.stringify(assignment.assignTo),
      date: assignment.date || null,
      priority: assignment.priority,
      description: assignment.description,
      notify: true,
    });
  }

  attachSalesOrderFile(name: string, file: File): Observable<{ name: string }> {
    return this.api.uploadFile<{ name: string }>(file, 'Sales Order', name);
  }

  emailSalesOrderAssignment(
    name: string,
    sender: string,
    recipients: string[],
    attachmentNames: string[],
    description: string,
  ): Observable<unknown> {
    return this.api.callMethod<unknown>('frappe.core.doctype.communication.email.make', {
      doctype: 'Sales Order',
      name,
      sender,
      recipients,
      subject: `Sales Order ${name} assigned to you`,
      content: description
        ? `<p>${this.escapeHtml(description)}</p><p>Sales Order: ${this.escapeHtml(name)}</p>`
        : `<p>Sales Order ${this.escapeHtml(name)} has been assigned to you.</p>`,
      send_email: true,
      attachments: attachmentNames,
    });
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character);
  }

  getItemUoms(itemCode: string): Observable<string[]> {
    return this.api.getDocument<{
      stock_uom?: string;
      uoms?: Array<{ uom?: string | null }>;
    }>('Item', itemCode).pipe(
      map((item) => [...new Set([
        item.stock_uom,
        ...(item.uoms ?? []).map((row) => row.uom),
      ].filter((uom): uom is string => typeof uom === 'string' && Boolean(uom.trim())))]),
    );
  }

  getAllSalesOrders(): Observable<SalesOrderListOption[]> {
    return this.getActiveWorkflowConfiguration('Sales Order').pipe(
      switchMap((workflow) => {
        const workflowStateField = workflow?.workflow_state_field?.trim();
        const fields = [
          'name',
          'customer',
          'customer_name',
          'transaction_date',
          'delivery_date',
          'total',
          'grand_total',
          'currency',
          'status',
          'docstatus',
          ...(workflowStateField ? [workflowStateField] : []),
        ];
        return this.getAllPages<SalesOrderListOption>('Sales Order', fields, []).pipe(
          map((orders) => orders.map((order) => ({
            ...order,
            salesOrderStatus: (workflowStateField
              ? this.readStringField(order, workflowStateField)
              : '')
              || order.status
              || this.documentStatus(order.docstatus),
          }))),
        );
      }),
    );
  }

  getSalesOrderStatuses(salesOrderNames: string[]): Observable<Record<string, string>> {
    if (!salesOrderNames.length) {
      return of({});
    }

    return this.getActiveWorkflowConfiguration('Sales Order').pipe(
      switchMap((workflow) => {
        const workflowStateField = workflow?.workflow_state_field?.trim();
        return from(this.chunks(salesOrderNames, 50)).pipe(
          concatMap((chunk) => this.getAllPages<SalesOrderListOption>(
            'Sales Order',
            ['name', 'status', 'docstatus', ...(workflowStateField ? [workflowStateField] : [])],
            [['name', 'in', chunk]],
          )),
          reduce((documents, page) => {
            documents.push(...page);
            return documents;
          }, [] as SalesOrderListOption[]),
          map((documents) => Object.fromEntries(documents.map((order) => [
            order.name,
            (workflowStateField ? this.readStringField(order, workflowStateField) : '')
              || order.status
              || this.documentStatus(order.docstatus),
          ]))),
        );
      }),
    );
  }

  getWorkflowStateStyles(): Observable<Record<string, string>> {
    return this.api.getList<WorkflowStateOption>(
      'Workflow State',
      ['name', 'style'],
      [],
      1000,
    ).pipe(
      map((states) => Object.fromEntries(states.map((state) => [
        state.name,
        state.style?.trim() ?? '',
      ]))),
    );
  }

  private readStringField(record: Record<string, unknown>, fieldName: string): string {
    const value = record[fieldName];
    return typeof value === 'string' ? value.trim() : '';
  }

  getActiveWorkflowConfiguration(doctype: string): Observable<WorkflowConfiguration | null> {
    return this.api.getList<Pick<WorkflowConfiguration, 'name' | 'document_type' | 'workflow_state_field' | 'is_active'>>(
      'Workflow',
      ['name', 'document_type', 'workflow_state_field', 'is_active'],
      [['document_type', '=', doctype], ['is_active', '=', 1]],
      100,
    ).pipe(
      switchMap((workflows) => {
        const activeWorkflows = workflows.filter((workflow) =>
          workflow.is_active === 1 && workflow.document_type === doctype,
        );
        const stateFields = [...new Set(activeWorkflows
          .map((workflow) => workflow.workflow_state_field?.trim())
          .filter((field): field is string => Boolean(field)))];
        if (stateFields.length > 1) {
          return throwError(() => new Error(`Active ${doctype} workflows use different state fields.`));
        }
        const workflow = activeWorkflows[0];
        return workflow
          ? this.api.getDocument<WorkflowConfiguration>('Workflow', workflow.name)
          : of(null);
      }),
      map((workflow) => {
        if (!workflow || workflow.is_active !== 1 || workflow.document_type !== doctype) {
          return null;
        }
        return {
          ...workflow,
          states: workflow.states ?? [],
          transitions: workflow.transitions ?? [],
        };
      }),
    );
  }

  getLinkedDocumentStatuses(
    salesOrderNames: string[],
  ): Observable<Record<string, {
    deliveryNoteStatus: string;
    salesInvoiceStatus: string;
  }>> {
    if (!salesOrderNames.length) {
      return of({});
    }

    return forkJoin({
      deliveryNotes: this.getStatusesForLinkedDocuments(
        'Delivery Note',
        'against_sales_order',
        salesOrderNames,
        true,
      ),
      salesInvoices: this.getStatusesForLinkedDocuments(
        'Sales Invoice',
        'sales_order',
        salesOrderNames,
      ),
    }).pipe(
      map(({ deliveryNotes, salesInvoices }) => {
        const statuses: Record<string, {
          deliveryNoteStatus: string;
          salesInvoiceStatus: string;
        }> = {};
        for (const name of salesOrderNames) {
          statuses[name] = {
            deliveryNoteStatus: deliveryNotes[name] ?? '—',
            salesInvoiceStatus: salesInvoices[name] ?? '—',
          };
        }
        return statuses;
      }),
    );
  }

  private getStatusesForLinkedDocuments(
    parentDocType: string,
    salesOrderField: 'against_sales_order' | 'sales_order',
    salesOrderNames: string[],
    includeStatusCounts = false,
  ): Observable<Record<string, string>> {
    return this.getAllPages<LinkedDocumentStatus>(
      parentDocType,
      ['name', 'status', 'docstatus'],
      [],
    ).pipe(
      switchMap((documents) => from(documents).pipe(
        mergeMap((document) => this.api.getDocument<LinkedDocumentStatus>(parentDocType, document.name), 8),
        reduce((items, item) => {
          items.push(item);
          return items;
        }, [] as LinkedDocumentStatus[]),
      )),
      map((documents) => {
        const requestedOrders = new Set(salesOrderNames);
        const statusBySalesOrder = new Map<string, Map<string, number>>();
        for (const document of documents) {
          const status = document.docstatus === 0 || document.docstatus === 2
            ? this.documentStatus(document.docstatus)
            : document.status || this.documentStatus(document.docstatus);
          const linkedOrders = new Set((document.items ?? [])
            .map((item) => item[salesOrderField])
            .filter((name): name is string => Boolean(name && requestedOrders.has(name))));
          for (const salesOrderName of linkedOrders) {
            const statuses = statusBySalesOrder.get(salesOrderName) ?? new Map<string, number>();
            statuses.set(
              status,
              includeStatusCounts ? (statuses.get(status) ?? 0) + 1 : 1,
            );
            statusBySalesOrder.set(salesOrderName, statuses);
          }
        }
        return Object.fromEntries([...statusBySalesOrder].map(([name, statuses]) => [
          name,
          [...statuses].map(([status, count]) => includeStatusCounts
            ? `${status} (${count})`
            : status).join(', '),
        ]));
      }),
    );
  }

  private getAllPages<T>(
    doctype: string,
    fields: string[],
    filters: unknown[][],
  ): Observable<T[]> {
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

  private chunks<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
      chunks.push(values.slice(index, index + size));
    }
    return chunks;
  }

  private documentStatus(docstatus: number): string {
    return docstatus === 1 ? 'Submitted' : docstatus === 2 ? 'Cancelled' : 'Draft';
  }

  getPaymentTerm(name: string): Observable<PaymentTermOption> {
    return this.api.getDocument<PaymentTermOption>('Payment Term', name);
  }

  getIncoterm(name: string): Observable<IncotermOption> {
    return this.api.getDocument<IncotermOption>('Incoterm', name);
  }

  getItemPrices(itemCode: string, priceList: string): Observable<ItemPriceOption[]> {
    return this.getAllPages<ItemPriceOption>(
      'Item Price',
      ['name', 'item_code', 'price_list', 'price_list_rate', 'uom', 'valid_from', 'valid_upto', 'selling'],
      [['item_code', '=', itemCode], ['price_list', '=', priceList], ['selling', '=', 1]],
    );
  }

  submitSalesOrder(order: SalesOrderRecord): Observable<SalesOrderRecord> {
    return this.api.callMethod<SalesOrderRecord>('frappe.client.submit', {
      doc: JSON.stringify(order),
    });
  }

  saveSalesOrder(
    document: Record<string, unknown>,
    name?: string,
  ): Observable<SalesOrderRecord> {
    return name
      ? this.api.updateDocument<SalesOrderRecord>('Sales Order', name, document)
      : this.api.createDocument<SalesOrderRecord>('Sales Order', document);
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
}
