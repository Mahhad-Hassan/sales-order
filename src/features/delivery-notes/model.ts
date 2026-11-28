export interface DeliveryNoteRecord {
  name: string;
  customer: string;
  customer_name?: string;
  company: string;
  posting_date: string;
  posting_time?: string;
  status?: string;
  docstatus: number;
  currency?: string;
  selling_price_list?: string | null;
  price_list_currency?: string;
  plc_conversion_rate?: number;
  grand_total?: number;
  total_qty?: number;
  total_taxes_and_charges?: number;
  set_warehouse?: string | null;
  customer_address?: string | null;
  shipping_address_name?: string | null;
  address_display?: string | null;
  shipping_address?: string | null;
  terms?: string | null;
  transporter?: string | null;
  lr_no?: string | null;
  lr_date?: string | null;
  vehicle_no?: string | null;
  driver?: string | null;
  driver_name?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  remarks?: string | null;
  custom_reference_no?: string | null;
  custom_adda_name?: string | null;
  custom_for_transporter?: string | null;
  custom_party_name?: string | null;
  custom_contact_number?: string | null;
  custom_rent_amount?: number | string | null;
  custom_rent_status?: string | null;
  items: DeliveryNoteItemRecord[];
  taxes?: DeliveryNoteTaxRow[];
  [key: string]: unknown;
}

export interface DeliveryNoteItemRecord {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string | null;
  rate?: number;
  amount?: number;
  total_qty?: number;
  custom_package_count?: number | string | null;
  custom_package_type?: string | null;
  [key: string]: unknown;
}

export interface DeliveryNoteItemRow {
  id: number;
  item_code: string;
  uom: string;
  uomOptions: Array<{ uom: string; conversion_factor: number }>;
  uomLoading: boolean;
  uomError: string;
  conversion_factor: number;
  qty: string;
  totalQty: string;
  warehouse: string;
  packageCount: string;
  packageType: string;
  rate: string;
  amount: string;
  rateLoading: boolean;
  rateError: string;
}

export interface DeliveryNoteCompany {
  name: string;
  default_currency: string;
  default_warehouse?: string | null;
}

export interface DeliveryNoteCustomer {
  name: string;
  customer_name?: string | null;
  customer_name_urdu?: string | null;
  custom_urdu_name?: string | null;
  mobile_no?: string | null;
  disabled?: number;
  tax_id?: string | null;
  [key: string]: unknown;
}

export interface DeliveryNoteItemOption {
  item_code: string;
  item_name: string;
  stock_uom: string;
  custom_urdu_name?: string | null;
  item_group?: string | null;
  custom_package_type?: string | null;
}

export interface DeliveryNoteItemUom {
  uom: string;
  conversion_factor: number;
}

export interface DeliveryNoteItemPrice {
  name: string;
  item_code: string;
  price_list: string;
  price_list_rate: number;
  uom?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  selling?: number;
}

export interface DeliveryNoteItemGroup {
  name: string;
  parent_item_group?: string | null;
  custom_urdu_name?: string | null;
}

export interface DeliveryNotePackageType {
  name: string;
  package_name?: string | null;
  package_name_urdu?: string | null;
}

export interface DeliveryNoteTransporterOption {
  name: string;
  transporter_name?: string | null;
  supplier_name?: string | null;
  custom_urdu_name?: string | null;
  from_location?: string | null;
  from_location_urdu?: string | null;
}

export interface DeliveryNoteWarehouse {
  name: string;
  company: string;
  is_group: number;
  disabled: number;
}

export interface DeliveryNotePartyOption {
  name: string;
  supplier_name?: string;
  full_name?: string;
}

export interface DeliveryNotePriceList {
  name: string;
  currency: string;
  selling: number;
  enabled: number;
}

export interface DeliveryNoteTaxRow {
  charge_type?: string;
  account_head?: string;
  description?: string;
  rate?: number;
  tax_amount?: number;
  total?: number;
  [key: string]: unknown;
}

export interface DeliveryNoteTaxTemplate {
  name: string;
  title?: string;
  taxes?: DeliveryNoteTaxRow[];
}

export interface DeliveryNoteAddress {
  name: string;
  address_title?: string;
  address_type?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  email_id?: string;
  is_primary_address?: number;
  is_shipping_address?: number;
  [key: string]: unknown;
}

export interface DeliveryNoteDocTypeMetadata {
  name: string;
  fields: Array<{
    fieldname: string;
    label: string;
    fieldtype: string;
    options?: string | null;
    default?: string | null;
  }>;
  permissions?: Array<{
    role: string;
    write?: number;
    if_owner?: number;
    permlevel?: number;
  }>;
}

export interface DeliveryNoteOptions {
  companies: DeliveryNoteCompany[];
  canChangeCompany: boolean;
  customers: DeliveryNoteCustomer[];
  items: DeliveryNoteItemOption[];
  itemGroups: DeliveryNoteItemGroup[];
  packageTypes: DeliveryNotePackageType[];
  transporters: DeliveryNoteTransporterOption[];
  priceLists: DeliveryNotePriceList[];
  suppliers: DeliveryNotePartyOption[];
  drivers: DeliveryNotePartyOption[];
  warehouses: DeliveryNoteWarehouse[];
  taxTemplates: DeliveryNoteTaxTemplate[];
  metadata: DeliveryNoteDocTypeMetadata;
  printOptionsWarning: string;
  taxOptionsWarning: string;
}

export function newDeliveryNoteItem(id: number): DeliveryNoteItemRow {
  return {
    id,
    item_code: '',
    uom: '',
    uomOptions: [],
    uomLoading: false,
    uomError: '',
    conversion_factor: 1,
    qty: '',
    totalQty: '',
    warehouse: '',
    packageCount: '',
    packageType: '',
    rate: '',
    amount: '',
    rateLoading: false,
    rateError: '',
  };
}
