import { frappeApi } from '../../services/frappeApi';
import type {
  DeliveryNoteAddress,
  DeliveryNoteCompany,
  DeliveryNoteCustomer,
  DeliveryNoteDocTypeMetadata,
  DeliveryNoteItemGroup,
  DeliveryNoteItemOption,
  DeliveryNoteItemRecord,
  DeliveryNoteItemRow,
  DeliveryNoteItemPrice,
  DeliveryNoteItemUom,
  DeliveryNoteOptions,
  DeliveryNotePackageType,
  DeliveryNotePartyOption,
  DeliveryNotePriceList,
  DeliveryNoteRecord,
  DeliveryNoteTaxRow,
  DeliveryNoteTaxTemplate,
  DeliveryNoteTransporterOption,
  DeliveryNoteWarehouse,
} from './model';

type Filter = Array<string | number | boolean | null>[];
type Document = Record<string, unknown> & { name?: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected Frappe API error.';
}

async function getAllPages<T>(
  doctype: string,
  fields: string[],
  filters: Filter = [],
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const page = await frappeApi.getList<T>(doctype, fields, filters, pageSize, start);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function getOptionalFields<T>(
  doctype: string,
  fields: string[],
  optionalFields: string[],
  filters: Filter = [],
): Promise<T[]> {
  try {
    return await getAllPages<T>(doctype, [...fields, ...optionalFields], filters);
  } catch {
    return getAllPages<T>(doctype, fields, filters);
  }
}

async function optionalList<T>(work: Promise<T[]>): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await work, failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

async function companyAccess(user: string, metadata: DeliveryNoteDocTypeMetadata) {
  const [permissions, profile] = await Promise.all([
    frappeApi.getList<{
      for_value: string;
      apply_to_all_doctypes?: number;
      applicable_for?: string;
    }>(
      'User Permission',
      ['for_value', 'apply_to_all_doctypes', 'applicable_for'],
      [
        ['user', '=', user],
        ['allow', '=', 'Company'],
      ],
      500,
    ),
    frappeApi.getDocument<{ roles?: Array<{ role: string }> }>('User', user),
  ]);
  const applicable = permissions.filter(
    (permission) =>
      Number(permission.apply_to_all_doctypes) === 1 ||
      permission.applicable_for === 'Delivery Note',
  );
  const roles = new Set((profile.roles ?? []).map(({ role }) => role));
  const canChangeCompany =
    metadata.permissions?.some(
      (permission) =>
        roles.has(permission.role) &&
        Number(permission.write) === 1 &&
        Number(permission.if_owner ?? 0) === 0 &&
        Number(permission.permlevel ?? 0) === 0,
    ) ?? false;
  return {
    allowed: applicable.length ? new Set(applicable.map(({ for_value }) => for_value)) : null,
    canChangeCompany,
  };
}

export async function loadDeliveryNoteOptions(user: string): Promise<DeliveryNoteOptions> {
  const [metadata, companyMetadata] = await Promise.all([
    frappeApi.getDocument<DeliveryNoteDocTypeMetadata>('DocType', 'Delivery Note'),
    frappeApi.getDocument<DeliveryNoteDocTypeMetadata>('DocType', 'Company'),
  ]);
  const access = await companyAccess(user, companyMetadata);
  const [
    allCompanies,
    customers,
    items,
    itemGroups,
    packageTypes,
    transporters,
    priceLists,
    suppliers,
    drivers,
    warehouses,
    taxTemplates,
  ] = await Promise.all([
    getAllPages<DeliveryNoteCompany>('Company', ['name', 'default_currency', 'default_warehouse']),
    getOptionalFields<DeliveryNoteCustomer>(
      'Customer',
      ['name', 'customer_name', 'mobile_no', 'disabled', 'tax_id'],
      ['custom_urdu_name', 'customer_name_urdu'],
      [['disabled', '=', 0]],
    ),
    getOptionalFields<DeliveryNoteItemOption>(
      'Item',
      ['item_code', 'item_name', 'stock_uom', 'item_group'],
      ['custom_package_type', 'custom_urdu_name'],
      [
        ['disabled', '=', 0],
        ['is_stock_item', '=', 1],
      ],
    ),
    optionalList(
      getOptionalFields<DeliveryNoteItemGroup>(
        'Item Group',
        ['name', 'parent_item_group'],
        ['custom_urdu_name'],
      ),
    ),
    optionalList(
      getOptionalFields<DeliveryNotePackageType>(
        'Package Type',
        ['name', 'package_name'],
        ['package_name_urdu'],
      ),
    ),
    optionalList(
      getOptionalFields<DeliveryNoteTransporterOption>(
        'Transporter List',
        ['name', 'transporter_name', 'from_location'],
        [
          'transporter_name.custom_urdu_name as custom_urdu_name',
          'transporter_name.supplier_name as supplier_name',
          'from_location.city_name_urdu as from_location_urdu',
        ],
      ),
    ),
    getAllPages<DeliveryNotePriceList>(
      'Price List',
      ['name', 'currency', 'selling', 'enabled'],
      [
        ['selling', '=', 1],
        ['enabled', '=', 1],
      ],
    ),
    getAllPages<DeliveryNotePartyOption>(
      'Supplier',
      ['name', 'supplier_name'],
      [['disabled', '=', 0]],
    ),
    optionalList(getAllPages<DeliveryNotePartyOption>('Driver', ['name'])),
    getAllPages<DeliveryNoteWarehouse>(
      'Warehouse',
      ['name', 'company', 'is_group', 'disabled'],
      [
        ['is_group', '=', 0],
        ['disabled', '=', 0],
      ],
    ),
    optionalList(
      getOptionalFields<DeliveryNoteTaxTemplate>(
        'Sales Taxes and Charges Template',
        ['name', 'title'],
        ['taxes'],
        [['disabled', '=', 0]],
      ),
    ),
  ]);
  const warnings = [
    itemGroups.failed ? 'Item Group' : '',
    packageTypes.failed ? 'Package Type' : '',
    transporters.failed ? 'Transporter List' : '',
  ].filter(Boolean);
  return {
    companies: access.allowed
      ? allCompanies.filter((company) => access.allowed?.has(company.name))
      : allCompanies,
    canChangeCompany: access.canChangeCompany,
    customers,
    items,
    itemGroups: itemGroups.rows,
    packageTypes: packageTypes.rows,
    transporters: transporters.rows,
    priceLists,
    suppliers,
    drivers: drivers.rows,
    warehouses,
    taxTemplates: taxTemplates.rows,
    metadata,
    printOptionsWarning: warnings.join(', '),
    taxOptionsWarning: taxTemplates.failed
      ? 'Sales Tax Template options could not be loaded. Check Frappe read permissions if taxes are needed.'
      : '',
  };
}

export async function getDeliveryNotes(): Promise<DeliveryNoteRecord[]> {
  return getAllPages<DeliveryNoteRecord>('Delivery Note', [
    'name',
    'customer',
    'customer_name',
    'posting_date',
    'status',
    'docstatus',
    'company',
    'grand_total',
    'currency',
    'total_qty',
  ]);
}

export function getDeliveryNote(name: string): Promise<DeliveryNoteRecord> {
  return frappeApi.getDocument<DeliveryNoteRecord>('Delivery Note', name);
}

export function getTaxTemplate(name: string): Promise<DeliveryNoteTaxTemplate> {
  return frappeApi.getDocument<DeliveryNoteTaxTemplate>('Sales Taxes and Charges Template', name);
}

export function getItemUoms(itemCode: string): Promise<DeliveryNoteItemUom[]> {
  return frappeApi
    .getDocument<{ uoms?: DeliveryNoteItemUom[] }>('Item', itemCode)
    .then(({ uoms }) => uoms ?? []);
}

export async function getItemPriceRate(
  itemCode: string,
  priceList: string,
  uom: string,
  date: string,
): Promise<number | null> {
  const prices = await getAllPages<DeliveryNoteItemPrice>(
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
      ['item_code', '=', itemCode],
      ['price_list', '=', priceList],
      ['selling', '=', 1],
    ],
  );
  const candidates = prices.filter(
    (price) =>
      price.item_code === itemCode &&
      price.price_list === priceList &&
      Number(price.selling) === 1 &&
      Number.isFinite(Number(price.price_list_rate)) &&
      Number(price.price_list_rate) >= 0,
  );
  const matchingUom = candidates.filter((price) => price.uom === uom);
  const withoutUom = candidates.filter((price) => !price.uom);
  const prioritized = [...matchingUom, ...withoutUom];
  const valid = prioritized.filter(
    (price) =>
      (!price.valid_from || price.valid_from <= date) &&
      (!price.valid_upto || price.valid_upto >= date),
  );
  const newest = (rows: DeliveryNoteItemPrice[]) =>
    [...rows].sort((left, right) =>
      (right.valid_from ?? '').localeCompare(left.valid_from ?? ''),
    )[0];
  const result = newest(valid) ?? newest(prioritized);
  return result ? Number(result.price_list_rate) : null;
}

export async function getExchangeRate(from: string, to: string, date: string): Promise<number> {
  if (from === to) return 1;
  const rates = await frappeApi.getList<{ exchange_rate: number; date: string }>(
    'Currency Exchange',
    ['exchange_rate', 'date'],
    [
      ['from_currency', '=', from],
      ['to_currency', '=', to],
      ['date', '<=', date],
    ],
    100,
  );
  const latest = rates
    .filter(
      (record) => Number.isFinite(Number(record.exchange_rate)) && Number(record.exchange_rate) > 0,
    )
    .sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!latest) throw new Error(`No ${from} to ${to} exchange rate is configured for ${date}.`);
  return Number(latest.exchange_rate);
}

export async function saveDeliveryNote(
  document: Document,
  name?: string,
): Promise<DeliveryNoteRecord> {
  if (name) return frappeApi.updateDocument<DeliveryNoteRecord>('Delivery Note', name, document);
  return frappeApi.createDocument<DeliveryNoteRecord>('Delivery Note', document);
}

export async function submitDeliveryNote(
  document: DeliveryNoteRecord,
): Promise<DeliveryNoteRecord> {
  const response = await frappeApi.callMethodResponse<DeliveryNoteRecord>('frappe.client.submit', {
    doc: JSON.stringify(document),
  });
  return response.message;
}

export async function getCustomerAddresses(customerName: string): Promise<DeliveryNoteAddress[]> {
  const customer = await frappeApi.getDocument<Document>('Customer', customerName);
  const refs = new Set<string>();
  const customerMeta = await frappeApi
    .getDocument<DeliveryNoteDocTypeMetadata>('DocType', 'Customer')
    .catch(() => null);
  for (const field of customerMeta?.fields ?? []) {
    if (field.fieldtype === 'Link' && field.options === 'Address') {
      const value = customer[field.fieldname];
      if (typeof value === 'string' && value) refs.add(value);
    }
  }
  try {
    const links = await frappeApi.getList<{ name: string }>(
      'Dynamic Link',
      ['name'],
      [
        ['link_doctype', '=', 'Customer'],
        ['link_name', '=', customerName],
      ],
      500,
    );
    const linkDocs = await Promise.all(
      links.map(({ name }) => frappeApi.getDocument<Document>('Dynamic Link', name)),
    );
    linkDocs.forEach((link) => {
      if (link.parenttype === 'Address' && typeof link.parent === 'string') refs.add(link.parent);
    });
  } catch {
    // Direct Customer address fields remain usable when Dynamic Link is not readable.
  }
  const addresses = await Promise.all(
    [...refs].map((name) =>
      frappeApi.getDocument<DeliveryNoteAddress>('Address', name).catch(() => null),
    ),
  );
  return addresses.filter((address): address is DeliveryNoteAddress => Boolean(address));
}

export function customerMobile(customer?: DeliveryNoteCustomer): string {
  const value = customer?.mobile_no;
  return typeof value === 'string' ? value : '';
}

export function itemAmount(row: Pick<DeliveryNoteItemRow, 'qty' | 'rate'>): number {
  const qty = Number(row.qty);
  const rate = Number(row.rate);
  return Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : 0;
}

export function normalizeTaxTemplate(
  template: DeliveryNoteTaxTemplate | undefined,
): DeliveryNoteTaxRow[] {
  return (template?.taxes ?? []).map((tax) => ({ ...tax }));
}

export function errorMessage(error: unknown): string {
  return messageOf(error);
}

export function recordItemsToDraft(items: DeliveryNoteItemRecord[]): DeliveryNoteItemRow[] {
  return items.map((item, index) => {
    const conversion = Number(item.conversion_factor) || 1;
    return {
      ...({
        id: index,
        item_code: item.item_code,
        uom: item.uom || item.stock_uom || '',
        uomOptions: [{ uom: item.uom || item.stock_uom || '', conversion_factor: conversion }],
        uomLoading: Boolean(item.item_code),
        uomError: '',
        conversion_factor: conversion,
        qty: String(item.qty ?? ''),
        totalQty: String(item.total_qty ?? Number(item.qty ?? 0) * conversion),
        warehouse: item.warehouse ?? '',
        packageCount: item.custom_package_count == null ? '' : String(item.custom_package_count),
        packageType: item.custom_package_type ?? '',
        rate: item.rate == null ? '' : String(item.rate),
        amount:
          item.amount == null
            ? String(Number(item.qty ?? 0) * Number(item.rate ?? 0))
            : String(item.amount),
        rateLoading: false,
        rateError: '',
      } satisfies DeliveryNoteItemRow),
    };
  });
}
