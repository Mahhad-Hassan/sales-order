import { frappeApi } from '../../services/frappeApi';
import type {
  CustomerInquiryCompany,
  CustomerInquiryCustomer,
  CustomerInquiryRecord,
  DocTypeMetadata,
  InquiryItemOption,
  InquiryLinkOption,
  InquiryOptions,
  WorkflowConfiguration,
  WorkflowTransition,
} from './models';

interface UserCompanyPermission {
  for_value: string;
  apply_to_all_doctypes?: number;
  applicable_for?: string | null;
}

interface WorkflowListEntry {
  name: string;
  document_type: string;
  workflow_state_field: string;
  is_active: number;
}

async function getAllPages<T>(
  doctype: string,
  fields: string[],
  filters: unknown[][] = [],
): Promise<T[]> {
  const pageSize = 500;
  const results: T[] = [];
  for (let start = 0; ; start += pageSize) {
    const page = await frappeApi.getList<T>(doctype, fields, filters, pageSize, start);
    results.push(...page);
    if (page.length < pageSize) return results;
  }
}

async function getWorkflow(): Promise<WorkflowConfiguration | null> {
  const workflows = await frappeApi.getList<WorkflowListEntry>(
    'Workflow',
    ['name', 'document_type', 'workflow_state_field', 'is_active'],
    [
      ['document_type', '=', 'Customer Inquiry'],
      ['is_active', '=', 1],
    ],
    100,
  );
  const active = workflows.find(
    (workflow) => workflow.document_type === 'Customer Inquiry' && Number(workflow.is_active) === 1,
  );
  if (!active) return null;
  const workflow = await frappeApi.getDocument<WorkflowConfiguration>('Workflow', active.name);
  return Number(workflow.is_active) === 1 && workflow.document_type === 'Customer Inquiry'
    ? { ...workflow, states: workflow.states ?? [], transitions: workflow.transitions ?? [] }
    : null;
}

async function getCompanyAccess(user: string): Promise<{
  allowedCompanyNames: string[] | null;
  canChangeCompany: boolean;
}> {
  const [permissions, profile, companyMetadata] = await Promise.all([
    frappeApi.getList<UserCompanyPermission>(
      'User Permission',
      ['for_value', 'apply_to_all_doctypes', 'applicable_for'],
      [
        ['user', '=', user],
        ['allow', '=', 'Company'],
      ],
      500,
    ),
    frappeApi.getDocument<{ roles?: Array<{ role: string }> }>('User', user),
    frappeApi.getDocument<DocTypeMetadata>('DocType', 'Company'),
  ]);
  const applicable = permissions.filter(
    (permission) =>
      Number(permission.apply_to_all_doctypes) === 1 ||
      permission.applicable_for === 'Customer Inquiry',
  );
  const allowedCompanyNames = applicable.length
    ? [...new Set(applicable.map((permission) => permission.for_value))]
    : null;
  const roles = new Set((profile.roles ?? []).map(({ role }) => role));
  const canChangeCompany =
    companyMetadata.permissions?.some(
      (permission) =>
        roles.has(permission.role) &&
        Number(permission.write) === 1 &&
        Number(permission.if_owner ?? 0) === 0 &&
        Number(permission.permlevel ?? 0) === 0,
    ) ?? false;
  return { allowedCompanyNames, canChangeCompany };
}

export async function loadInquiryOptions(currentUser: string): Promise<InquiryOptions> {
  const [
    customers,
    allCompanies,
    companyAccess,
    users,
    currencies,
    paymentTerms,
    incoterms,
    brands,
    items,
    uoms,
    workflow,
    parentMetadata,
    childMetadata,
  ] = await Promise.all([
    getAllPages<CustomerInquiryCustomer>(
      'Customer',
      ['name', 'customer_name'],
      [['disabled', '=', 0]],
    ),
    getAllPages<CustomerInquiryCompany>('Company', ['name', 'default_currency']),
    getCompanyAccess(currentUser),
    getAllPages<InquiryLinkOption>('User', ['name', 'full_name', 'enabled'], [['enabled', '=', 1]]),
    getAllPages<InquiryLinkOption>('Currency', ['name']),
    getAllPages<InquiryLinkOption>('Indent Payment Term', ['name']),
    getAllPages<InquiryLinkOption>('Incoterm', ['name', 'title']),
    getAllPages<InquiryLinkOption>('Brand', ['name']),
    getAllPages<InquiryItemOption>(
      'Item',
      ['item_code', 'item_name', 'item_group', 'stock_uom', 'brand'],
      [['disabled', '=', 0]],
    ),
    getAllPages<InquiryLinkOption>('UOM', ['name']),
    getWorkflow(),
    frappeApi.getDocument<DocTypeMetadata>('DocType', 'Customer Inquiry'),
    frappeApi.getDocument<DocTypeMetadata>('DocType', 'Customer Inquiry Item'),
  ]);
  const companies = companyAccess.allowedCompanyNames
    ? allCompanies.filter((company) => companyAccess.allowedCompanyNames?.includes(company.name))
    : allCompanies;
  return {
    customers,
    companies,
    canChangeCompany: companyAccess.canChangeCompany,
    users,
    currencies,
    paymentTerms,
    incoterms,
    brands,
    items,
    uoms,
    workflow,
    parentMetadata,
    childMetadata,
  };
}

export async function getInquiries(): Promise<CustomerInquiryRecord[]> {
  return getAllPages<CustomerInquiryRecord>('Customer Inquiry', [
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
  ]);
}

export function getInquiry(name: string): Promise<CustomerInquiryRecord> {
  return frappeApi.getDocument<CustomerInquiryRecord>('Customer Inquiry', name);
}

export function saveInquiry(
  document: Record<string, unknown>,
  name?: string,
): Promise<CustomerInquiryRecord> {
  return name
    ? frappeApi.updateDocument<CustomerInquiryRecord>('Customer Inquiry', name, document)
    : frappeApi.createDocument<CustomerInquiryRecord>('Customer Inquiry', document);
}

export function submitInquiry(inquiry: CustomerInquiryRecord): Promise<CustomerInquiryRecord> {
  return frappeApi.callMethod<CustomerInquiryRecord>('frappe.client.submit', {
    doc: JSON.stringify(inquiry),
  });
}

export async function cancelInquiry(
  inquiry: CustomerInquiryRecord,
): Promise<CustomerInquiryRecord> {
  await frappeApi.callMethodResponse<unknown>('frappe.client.cancel', {
    doctype: 'Customer Inquiry',
    name: inquiry.name,
  });
  return getInquiry(inquiry.name);
}

export async function getWorkflowTransitions(name: string): Promise<WorkflowTransition[]> {
  const workflow = await getWorkflow();
  const stateField = workflow?.workflow_state_field?.trim();
  if (!name || !workflow || !stateField) return [];
  const document = await getInquiry(name);
  if (typeof document[stateField] !== 'string' || !String(document[stateField]).trim()) return [];
  return frappeApi.callMethod<WorkflowTransition[]>('frappe.model.workflow.get_transitions', {
    doc: JSON.stringify(document),
  });
}

export async function applyWorkflowAction(
  name: string,
  action: string,
): Promise<CustomerInquiryRecord> {
  const transitions = await getWorkflowTransitions(name);
  if (!transitions.some((transition) => transition.action === action)) {
    throw new Error(
      'This workflow action is no longer available for your account. Refresh the Customer Inquiry and try again.',
    );
  }
  await frappeApi.callMethodResponse<unknown>('frappe.model.workflow.apply_workflow', {
    doc: JSON.stringify({ doctype: 'Customer Inquiry', name }),
    action,
  });
  return getInquiry(name);
}
