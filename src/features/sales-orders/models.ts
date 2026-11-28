export interface CompanyOption {
  name: string;
  default_currency: string;
  default_warehouse?: string | null;
}
export interface EmployeeOption {
  name: string;
  employee_name?: string | null;
  user_id?: string | null;
}
export interface ItemOption {
  item_code: string;
  item_name: string;
  stock_uom: string;
}
export interface PaymentTermOption {
  name: string;
  payment_term_name: string;
  due_date_based_on: string;
  credit_days: number | null;
  credit_months: number | null;
}
export interface SellingPriceListOption {
  name: string;
  currency: string;
  selling: number;
  enabled: number;
}
export interface IncotermOption {
  name: string;
  title: string;
}
export interface PartyDetails {
  name: string;
  companyName: string;
  postalAddress: string;
  phoneNo: string;
  faxNo: string;
  email: string;
  ntn: string;
}
export interface AddressOption {
  docName: string;
  label: string;
  addressType?: string;
  isPrimary?: boolean;
  isShipping?: boolean;
  details: PartyDetails;
}
export interface CustomerOption {
  docName: string;
  displayName: string;
  taxId: string;
  billTo: Partial<PartyDetails>;
  shipTo: Partial<PartyDetails>;
  billToAddresses: AddressOption[];
  shipToAddresses: AddressOption[];
  emails: string[];
}
export interface SalesOrderItem {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  delivered_qty?: number;
  uom?: string;
  stock_uom?: string;
  warehouse?: string | null;
  rate: number;
  billed_amt?: number;
  discount_amount?: number;
  amount?: number;
  net_amount?: number;
}
export interface SalesOrderTax {
  description?: string;
  account_head?: string;
  charge_type?: string;
  rate?: number;
  tax_amount?: number;
  total?: number;
}
export interface SalesOrderRecord extends Record<string, unknown> {
  name: string;
  docstatus: number;
  customer: string;
  customer_name?: string;
  company: string;
  order_type?: string;
  set_warehouse?: string | null;
  transaction_date: string;
  delivery_date?: string | null;
  currency: string;
  conversion_rate: number;
  selling_price_list: string;
  price_list_currency: string;
  plc_conversion_rate: number;
  incoterm?: string | null;
  custom_rep?: string | null;
  payment_terms_template?: string | null;
  terms?: string | null;
  status?: string;
  workflow_state?: string;
  total?: number;
  total_taxes_and_charges?: number;
  grand_total?: number;
  rounded_total?: number;
  in_words?: string;
  customer_address?: string;
  shipping_address_name?: string;
  contact_mobile?: string;
  contact_email?: string;
  taxes?: SalesOrderTax[];
  payment_schedule?: Array<{
    payment_term?: string;
    due_date?: string;
    credit_days?: number;
    credit_months?: number;
    invoice_portion?: number;
  }>;
  items: SalesOrderItem[];
}
export interface SalesOrderListOption extends Record<string, unknown> {
  name: string;
  customer: string;
  customer_name?: string;
  transaction_date: string;
  delivery_date?: string | null;
  total?: number;
  grand_total?: number;
  currency?: string;
  status?: string;
  docstatus: number;
  salesOrderStatus?: string;
  deliveryNoteStatus?: string;
  salesInvoiceStatus?: string;
}
export interface WorkflowConfiguration {
  name: string;
  document_type: string;
  workflow_state_field: string;
  is_active: number;
  states?: Array<{ state: string; doc_status: number | string }>;
  transitions?: WorkflowTransition[];
}
export interface WorkflowTransition {
  state: string;
  action: string;
  next_state: string;
  allowed: string;
  condition?: string | null;
}
export interface WorkflowStateOption {
  name: string;
  style: string;
}
export interface AssignmentUserOption {
  name: string;
  full_name?: string;
  email?: string | null;
}
export interface AssignmentUserGroupOption {
  name: string;
}
export interface ItemPriceOption {
  name: string;
  item_code: string;
  price_list: string;
  price_list_rate: number;
  uom?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  selling?: number;
}

export const EMPTY_PARTY: PartyDetails = {
  name: '',
  companyName: '',
  postalAddress: '',
  phoneNo: '',
  faxNo: '',
  email: '',
  ntn: '',
};
