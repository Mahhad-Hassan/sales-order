import { frappeApi } from '../../services/frappeApi';
import type {
  AssignmentUserGroupOption,
  AssignmentUserOption,
  CompanyOption,
  CustomerOption,
  EmployeeOption,
  IncotermOption,
  ItemOption,
  ItemPriceOption,
  PartyDetails,
  PaymentTermOption,
  SalesOrderListOption,
  SalesOrderRecord,
  SellingPriceListOption,
  WorkflowConfiguration,
  WorkflowStateOption,
} from './models';

export async function getList<T>(
  doctype: string,
  fields: string[],
  filters: unknown[][] = [],
  limit = 500,
  start = 0,
): Promise<T[]> {
  return frappeApi.getList<T>(doctype, fields, filters, limit, start);
}
export async function getDocument<T>(doctype: string, name: string): Promise<T> {
  return frappeApi.getDocument<T>(doctype, name);
}
export async function createDocument<T>(doctype: string, doc: Partial<T>): Promise<T> {
  return frappeApi.createDocument<T>(doctype, doc as Record<string, unknown>);
}
export async function updateDocument<T>(
  doctype: string,
  name: string,
  doc: Partial<T>,
): Promise<T> {
  return frappeApi.updateDocument<T>(doctype, name, doc as Record<string, unknown>);
}
export async function callMethod<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return frappeApi.callMethod<T>(method, args);
}
async function callMethodResponse<T>(method: string, args: Record<string, unknown> = {}) {
  return frappeApi.callMethodResponse<T>(method, args);
}
export async function uploadFile<T>(
  file: File,
  doctype: string,
  docname: string,
  isPrivate = false,
): Promise<T> {
  return frappeApi.uploadFile<T>(file, doctype, docname, isPrivate);
}

async function allPages<T>(
  doctype: string,
  fields: string[],
  filters: unknown[][] = [],
  pageSize = 500,
): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += pageSize) {
    const page = await getList<T>(doctype, fields, filters, pageSize, start);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export async function loadOptions(user: string) {
  const [
    companies,
    permissions,
    profile,
    metadata,
    employees,
    incoterms,
    items,
    paymentTerms,
    priceLists,
    orders,
    workflow,
    styles,
  ] = await Promise.all([
    allPages<CompanyOption>('Company', ['name', 'default_currency', 'default_warehouse']),
    getList<{ for_value: string; apply_to_all_doctypes?: number; applicable_for?: string | null }>(
      'User Permission',
      ['for_value', 'apply_to_all_doctypes', 'applicable_for'],
      [
        ['user', '=', user],
        ['allow', '=', 'Company'],
      ],
      500,
    ),
    getDocument<{ roles?: Array<{ role: string }> }>('User', user),
    getDocument<{
      fields: Array<{ fieldname: string; label: string; fieldtype: string; options?: string }>;
      permissions?: Array<{ role: string; write?: number; if_owner?: number; permlevel?: number }>;
    }>('DocType', 'Sales Order'),
    allPages<EmployeeOption>('Employee', ['name', 'employee_name', 'user_id']),
    allPages<IncotermOption>('Incoterm', ['name', 'title']),
    allPages<ItemOption>('Item', ['item_code', 'item_name', 'stock_uom']),
    allPages<PaymentTermOption>('Payment Term', [
      'name',
      'payment_term_name',
      'due_date_based_on',
      'credit_days',
      'credit_months',
    ]),
    allPages<SellingPriceListOption>(
      'Price List',
      ['name', 'currency', 'selling', 'enabled'],
      [
        ['selling', '=', 1],
        ['enabled', '=', 1],
      ],
    ),
    allPages<SalesOrderListOption>('Sales Order', [
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
    ]),
    getActiveWorkflow(),
    getWorkflowStyles(),
  ]);
  const applicable = permissions.filter(
    (p) => Number(p.apply_to_all_doctypes) === 1 || p.applicable_for === 'Sales Order',
  );
  const allowed = applicable.length ? [...new Set(applicable.map((p) => p.for_value))] : null;
  const roles = new Set((profile.roles ?? []).map((r) => r.role));
  const canChangeCompany =
    metadata.permissions?.some(
      (p) =>
        roles.has(p.role) &&
        Number(p.write) === 1 &&
        Number(p.if_owner ?? 0) === 0 &&
        Number(p.permlevel ?? 0) === 0,
    ) ?? false;
  return {
    companies: allowed ? companies.filter((c) => allowed.includes(c.name)) : companies,
    canChangeCompany,
    employees,
    incoterms,
    items,
    paymentTerms,
    priceLists: priceLists.filter((p) => p.selling === 1 && p.enabled === 1),
    orders,
    metadata,
    workflow,
    styles,
  };
}

export async function getAllSalesOrders(): Promise<SalesOrderListOption[]> {
  const workflow = await getActiveWorkflow();
  const field = workflow?.workflow_state_field?.trim();
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
    ...(field ? [field] : []),
  ];
  const orders = await allPages<SalesOrderListOption>('Sales Order', fields);
  return orders.map((order) => ({
    ...order,
    salesOrderStatus:
      (field ? String((order as unknown as Record<string, unknown>)[field] ?? '').trim() : '') ||
      order.status ||
      (order.docstatus === 1 ? 'Submitted' : order.docstatus === 2 ? 'Cancelled' : 'Draft'),
  }));
}
export async function getLinkedStatusMap(names: string[]) {
  if (!names.length) return {};
  const [dns, invs] = await Promise.all([
    allPages<SalesOrderLinked>('Delivery Note', ['name', 'status', 'docstatus', 'items']),
    allPages<SalesOrderLinked>('Sales Invoice', ['name', 'status', 'docstatus', 'items']),
  ]);
  const out: Record<string, { deliveryNoteStatus: string; salesInvoiceStatus: string }> = {};
  for (const name of names) {
    const dn = dns
      .filter((d) => d.items?.some((i) => i.against_sales_order === name))
      .map((d) => d.status || (d.docstatus ? 'Submitted' : 'Draft'));
    const inv = invs
      .filter((d) => d.items?.some((i) => i.sales_order === name))
      .map((d) => d.status || (d.docstatus ? 'Submitted' : 'Draft'));
    out[name] = {
      deliveryNoteStatus: [...new Set(dn)].join(', ') || '—',
      salesInvoiceStatus: [...new Set(inv)].join(', ') || '—',
    };
  }
  return out;
}
interface SalesOrderLinked {
  name: string;
  status?: string;
  docstatus: number;
  items?: Array<{ against_sales_order?: string; sales_order?: string }>;
}

export async function getWorkflowStyles(): Promise<Record<string, string>> {
  const states = await allPages<WorkflowStateOption>('Workflow State', ['name', 'style'], [], 1000);
  return Object.fromEntries(states.map((s) => [s.name, s.style?.trim() ?? '']));
}
export async function getActiveWorkflow(): Promise<WorkflowConfiguration | null> {
  const workflows = await getList<
    Pick<WorkflowConfiguration, 'name' | 'document_type' | 'workflow_state_field' | 'is_active'>
  >(
    'Workflow',
    ['name', 'document_type', 'workflow_state_field', 'is_active'],
    [
      ['document_type', '=', 'Sales Order'],
      ['is_active', '=', 1],
    ],
    100,
  );
  const workflow = workflows.find((w) => w.document_type === 'Sales Order' && w.is_active === 1);
  return workflow ? getDocument<WorkflowConfiguration>('Workflow', workflow.name) : null;
}
export async function getSalesOrder(name: string) {
  return getDocument<SalesOrderRecord>('Sales Order', name);
}
export async function saveSalesOrder(payload: Partial<SalesOrderRecord>, name?: string) {
  return name
    ? updateDocument<SalesOrderRecord>('Sales Order', name, payload)
    : createDocument<SalesOrderRecord>('Sales Order', payload);
}
export async function deleteSalesOrder(name: string): Promise<void> {
  await frappeApi.deleteDocument('Sales Order', name);
}
export async function getAssignmentOptions() {
  const [users, userGroups] = await Promise.all([
    getList<AssignmentUserOption>(
      'User',
      ['name', 'full_name', 'email'],
      [
        ['enabled', '=', 1],
        ['user_type', '=', 'System User'],
      ],
      500,
    ),
    getList<AssignmentUserGroupOption>('User Group', ['name'], [], 500),
  ]);
  return { users, userGroups };
}

export async function getUserGroupMembers(groupName: string): Promise<string[]> {
  const group = await getDocument<{
    user_group_members?: Array<{ user?: string | null }>;
  }>('User Group', groupName);
  return [
    ...new Set(
      (group.user_group_members ?? [])
        .map((member) => member.user?.trim())
        .filter((user): user is string => Boolean(user)),
    ),
  ];
}

export async function getSalesOrderAttachments(name: string) {
  return getList<{ name: string; file_name: string }>(
    'File',
    ['name', 'file_name'],
    [
      ['attached_to_doctype', '=', 'Sales Order'],
      ['attached_to_name', '=', name],
    ],
    500,
  );
}

export async function getDefaultOutgoingEmailSender(): Promise<string> {
  const accounts = await getList<{ email_id: string }>(
    'Email Account',
    ['email_id'],
    [
      ['enable_outgoing', '=', 1],
      ['default_outgoing', '=', 1],
    ],
    10,
  );
  const senders = [
    ...new Set(
      accounts
        .map((account) => account.email_id?.trim())
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  if (senders.length !== 1) {
    throw new Error(
      senders.length
        ? 'Frappe has more than one default outgoing email sender. Ask an administrator to configure exactly one.'
        : 'Frappe has no enabled default outgoing email sender.',
    );
  }
  return senders[0];
}

export async function assignSalesOrder(
  name: string,
  assignment: {
    assignTo: string[];
    date: string;
    priority: 'Low' | 'Medium' | 'High';
    description: string;
  },
) {
  return callMethodResponse<unknown>('frappe.desk.form.assign_to.add', {
    doctype: 'Sales Order',
    name,
    assign_to: JSON.stringify(assignment.assignTo),
    date: assignment.date || null,
    priority: assignment.priority,
    description: assignment.description,
    notify: true,
  });
}

export function attachSalesOrderFile(name: string, file: File) {
  return frappeApi.uploadFile<{ name: string }>(file, 'Sales Order', name);
}

export function emailSalesOrderAssignment(
  name: string,
  sender: string,
  recipients: string[],
  attachmentNames: string[],
  description: string,
) {
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? character,
    );
  return callMethod('frappe.core.doctype.communication.email.make', {
    doctype: 'Sales Order',
    name,
    sender,
    recipients,
    subject: `Sales Order ${name} assigned to you`,
    content: description
      ? `<p>${escapeHtml(description)}</p><p>Sales Order: ${escapeHtml(name)}</p>`
      : `<p>Sales Order ${escapeHtml(name)} has been assigned to you.</p>`,
    send_email: true,
    attachments: attachmentNames,
  });
}

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;
  const records = await getList<{ exchange_rate: number; date: string }>(
    'Currency Exchange',
    ['exchange_rate', 'date'],
    [
      ['from_currency', '=', fromCurrency],
      ['to_currency', '=', toCurrency],
      ['date', '<=', date],
    ],
    100,
  );
  const latest = records
    .filter((record) => Number.isFinite(record.exchange_rate) && record.exchange_rate > 0)
    .sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!latest) {
    throw new Error(`No ${fromCurrency} to ${toCurrency} exchange rate is configured for ${date}.`);
  }
  return latest.exchange_rate;
}
export async function submitSalesOrder(order: SalesOrderRecord) {
  return callMethod<SalesOrderRecord>('frappe.client.submit', { doc: JSON.stringify(order) });
}
export async function getWorkflowTransitions(order: SalesOrderRecord) {
  const workflow = await getActiveWorkflow();
  if (!workflow?.is_active || !workflow.workflow_state_field) return [];
  return callMethod<Array<{ state: string; action: string; next_state: string; allowed: string }>>(
    'frappe.model.workflow.get_transitions',
    { doc: JSON.stringify(order) },
  );
}
export async function applyWorkflow(order: SalesOrderRecord, action: string) {
  await callMethod('frappe.model.workflow.apply_workflow', {
    doc: JSON.stringify({ doctype: 'Sales Order', name: order.name }),
    action,
  });
  return getSalesOrder(order.name);
}
export async function getItemUoms(code: string) {
  const item = await getDocument<{ stock_uom?: string; uoms?: Array<{ uom?: string }> }>(
    'Item',
    code,
  );
  return [
    ...new Set(
      [item.stock_uom, ...(item.uoms ?? []).map((r) => r.uom)].filter((v): v is string =>
        Boolean(v?.trim()),
      ),
    ),
  ];
}
export async function getItemPrices(code: string, priceList: string) {
  return getList<ItemPriceOption>(
    'Item Price',
    [
      'name',
      'item_code',
      'price_list',
      'price_list_rate',
      'uom',
      'valid_from',
      'valid_upto',
      'selling',
    ],
    [
      ['item_code', '=', code],
      ['price_list', '=', priceList],
      ['selling', '=', 1],
    ],
    500,
  );
}

export async function searchCustomers(query: string): Promise<CustomerOption[]> {
  const metadata = await getDocument<{ fields: Array<{ fieldname: string; label: string }> }>(
    'DocType',
    'Customer',
  );
  const display = metadata.fields.find((f) => f.label === 'Customer Name')?.fieldname;
  const fields = ['name', ...(display ? [display] : [])];
  const records = await getList<Record<string, unknown>>(
    'Customer',
    fields,
    query ? [[display ?? 'customer_name', 'like', `%${query}%`]] : [],
    20,
  );
  return records.map((r) => ({
    docName: String(r.name),
    displayName: String(display ? r[display] : r.name),
    taxId: '',
    billTo: {},
    shipTo: {},
    billToAddresses: [],
    shipToAddresses: [],
    emails: [],
  }));
}

export async function getCustomerDetails(docName: string): Promise<CustomerOption> {
  const [addressMetadata, dynamicMetadata, customerDoc] = await Promise.all([
    getDocument<{
      fields: Array<{ fieldname: string; label: string; fieldtype: string; options?: string }>;
    }>('DocType', 'Address'),
    getDocument<{ fields: Array<{ fieldname: string; label: string; fieldtype: string }> }>(
      'DocType',
      'Dynamic Link',
    ),
    getDocument<Record<string, unknown>>('Customer', docName),
  ]);
  const linkDoctype = dynamicMetadata.fields.find((f) =>
    ['Link DocType', 'Link Document Type'].includes(f.label),
  )?.fieldname;
  const linkName = dynamicMetadata.fields.find((f) => f.label === 'Link Name')?.fieldname;
  const links =
    linkDoctype && linkName
      ? await getList<Record<string, unknown>>(
          'Dynamic Link',
          ['name'],
          [
            [linkDoctype, '=', 'Customer'],
            [linkName, '=', docName],
          ],
          100,
        )
      : [];
  const detailedLinks = await Promise.all(
    links.map((l) => getDocument<Record<string, unknown>>('Dynamic Link', String(l.name))),
  );
  const addressNames = [
    ...new Set(
      detailedLinks
        .filter((l) => l.parenttype === 'Address')
        .map((l) => String(l.parent))
        .filter(Boolean),
    ),
  ];
  const directAddressNames = addressMetadata.fields
    .filter((f) => f.fieldtype === 'Link' && f.options === 'Address')
    .map((f) => String(customerDoc[f.fieldname] ?? ''))
    .filter(Boolean);
  const names = [...new Set([...directAddressNames, ...addressNames])];
  const addresses = await Promise.all(
    names.map(async (docName) => {
      const a = await getDocument<Record<string, unknown>>('Address', docName);
      const party: PartyDetails = {
        name: String(a.address_title ?? a.name ?? ''),
        companyName: String(a.address_title ?? ''),
        postalAddress: [a.address_line1, a.address_line2, a.city, a.state, a.pincode, a.country]
          .filter(Boolean)
          .join(', '),
        phoneNo: String(a.phone ?? ''),
        faxNo: String(a.fax ?? ''),
        email: String(a.email_id ?? ''),
        ntn: '',
      };
      return {
        docName,
        label: String(a.address_title ?? docName),
        addressType: String(a.address_type ?? ''),
        isPrimary: a.is_primary_address === 1 || a.is_primary_address === true,
        isShipping: a.is_shipping_address === 1 || a.is_shipping_address === true,
        details: party,
      };
    }),
  );
  const contactNames = [
    ...new Set(
      detailedLinks
        .filter((l) => l.parenttype === 'Contact')
        .map((l) => String(l.parent))
        .filter(Boolean),
    ),
  ];
  const contacts = await Promise.all(
    contactNames.map((n) => getDocument<Record<string, unknown>>('Contact', n)),
  );
  const emails = [
    ...new Set(
      contacts.flatMap((contact) => {
        const rows = Array.isArray(contact.email_ids)
          ? (contact.email_ids as Array<Record<string, unknown>>)
          : [];
        const primary = rows.filter(
          (row) => row.is_primary === 1 || row.is_primary === true || row.is_primary_email === 1,
        );
        return [
          ...primary.map((row) => String(row.email_id ?? '')),
          String(contact.email_id ?? ''),
          ...rows.map((row) => String(row.email_id ?? '')),
          String(contact.email ?? ''),
        ].filter(Boolean);
      }),
    ),
  ];
  const displayName = String(customerDoc.customer_name ?? customerDoc.name ?? docName);
  const billToAddresses = [...addresses].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      Number(b.addressType.toLowerCase() === 'billing') -
        Number(a.addressType.toLowerCase() === 'billing'),
  );
  const shipToAddresses = [...addresses].sort(
    (a, b) =>
      Number(b.isShipping || b.addressType.toLowerCase() === 'shipping') -
        Number(a.isShipping || a.addressType.toLowerCase() === 'shipping') ||
      Number(b.isPrimary) - Number(a.isPrimary),
  );
  return {
    docName,
    displayName,
    taxId: String(customerDoc.tax_id ?? ''),
    billTo: billToAddresses[0]?.details ?? {},
    shipTo: shipToAddresses[0]?.details ?? {},
    billToAddresses,
    shipToAddresses,
    emails,
  };
}
