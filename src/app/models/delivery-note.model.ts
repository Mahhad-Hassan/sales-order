export interface DeliveryNoteCompany {
  name: string;
  default_currency: string;
  default_warehouse?: string | null;
}

export interface DeliveryNoteCustomer {
  name: string;
  customer_name?: string | null;
  disabled?: number;
}

export interface DeliveryNoteItemOption {
  item_code: string;
  item_name: string;
  stock_uom: string;
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

export interface DeliveryNoteItemRecord extends Record<string, unknown> {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string | null;
  rate?: number;
  amount?: number;
}

export interface DeliveryNoteRecord extends Record<string, unknown> {
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
  grand_total?: number;
  total_qty?: number;
  set_warehouse?: string | null;
  terms?: string | null;
  transporter?: string | null;
  lr_no?: string | null;
  lr_date?: string | null;
  vehicle_no?: string | null;
  driver?: string | null;
  driver_name?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  items: DeliveryNoteItemRecord[];
}

export interface DeliveryNoteDraftItem {
  item_code: string;
  qty: string;
  warehouse: string;
  rate: string;
}
