import { FrappeDocTypeMetadata } from './frappe-api.model';

export interface CustomerInquiryCustomer {
  name: string;
  customer_name?: string | null;
}

export interface CustomerInquiryCompany {
  name: string;
  default_currency?: string | null;
}

export interface CustomerInquiryLinkOption {
  name: string;
  title?: string;
  full_name?: string;
  payment_term_name?: string;
}

export interface CustomerInquiryItemOption {
  item_code: string;
  item_name?: string;
  stock_uom?: string;
  brand?: string;
}

export interface CustomerInquiryItemRecord extends Record<string, unknown> {
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
  items: CustomerInquiryItemRecord[];
}

export interface CustomerInquiryDraftItem {
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

export interface CustomerInquiryMetadata {
  parent: FrappeDocTypeMetadata;
  child: FrappeDocTypeMetadata;
}
