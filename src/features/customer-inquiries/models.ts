export interface CustomerInquiryCustomer {
  name: string;
  customer_name?: string | null;
}

export interface CustomerInquiryCompany {
  name: string;
  default_currency?: string | null;
}

export interface InquiryLinkOption {
  name: string;
  title?: string;
  full_name?: string;
  enabled?: number;
}

export interface InquiryItemOption {
  item_code: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  brand?: string;
}

export interface InquiryItemRecord extends Record<string, unknown> {
  idx?: number;
  item_code: string;
  item_description?: string | null;
  qty: number;
  uom?: string | null;
  container_no?: string | null;
  target_price?: number | null;
  preferred_brand?: string | null;
  shipment_load?: string | null;
  remarks?: string | null;
}

export interface CustomerInquiryRecord extends Record<string, unknown> {
  name: string;
  naming_series?: string | null;
  customer: string;
  customer_name?: string | null;
  inquiry_date: string;
  required_date: string;
  status?: string | null;
  company: string;
  responsible?: string | null;
  currency: string;
  payment_term?: string | null;
  amended_from?: string | null;
  shipment_required?: number;
  incoterms?: string | null;
  port?: string | null;
  transport_type?: string | null;
  partial_shipment?: string | null;
  transshipment?: string | null;
  group_totals_by?: string | null;
  confirmation_method?: string | null;
  confirmation_log?: string | null;
  remarks?: string | null;
  rfq_emails_sent?: number;
  docstatus: number;
  items: InquiryItemRecord[];
}

export interface InquiryDraftItem {
  rowId: number;
  item_code: string;
  item_description: string;
  qty: string;
  uom: string;
  container_no: string;
  target_price: string;
  preferred_brand: string;
  shipment_load: string;
  remarks: string;
}

export interface DocTypeField {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | null;
  default?: string | null;
}

export interface DocTypeMetadata {
  name: string;
  fields: DocTypeField[];
  permissions?: Array<{
    role: string;
    write?: number;
    if_owner?: number;
    permlevel?: number;
  }>;
}

export interface WorkflowTransition {
  state: string;
  action: string;
  next_state: string;
  allowed: string;
  condition?: string | null;
}

export interface WorkflowConfiguration {
  name: string;
  document_type: string;
  workflow_state_field: string;
  is_active: number;
  states?: Array<{ state: string; doc_status: number | string }>;
  transitions?: WorkflowTransition[];
}

export interface InquiryOptions {
  customers: CustomerInquiryCustomer[];
  companies: CustomerInquiryCompany[];
  canChangeCompany: boolean;
  users: InquiryLinkOption[];
  currencies: InquiryLinkOption[];
  paymentTerms: InquiryLinkOption[];
  incoterms: InquiryLinkOption[];
  brands: InquiryLinkOption[];
  items: InquiryItemOption[];
  uoms: InquiryLinkOption[];
  workflow: WorkflowConfiguration | null;
  parentMetadata: DocTypeMetadata;
  childMetadata: DocTypeMetadata;
}

export interface InquiryFormValues {
  namingSeries: string;
  customer: string;
  customerName: string;
  inquiryDate: string;
  requiredDate: string;
  status: string;
  company: string;
  responsible: string;
  currency: string;
  paymentTerm: string;
  amendedFrom: string;
  shipmentRequired: boolean;
  incoterms: string;
  port: string;
  transportType: string;
  partialShipment: string;
  transshipment: string;
  groupTotalsBy: string;
  confirmationMethod: string;
  confirmationLog: string;
  remarks: string;
}
