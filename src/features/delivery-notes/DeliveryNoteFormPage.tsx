import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  customerMobile,
  errorMessage,
  getCustomerAddresses,
  getDeliveryNote,
  getExchangeRate,
  getItemPriceRate,
  getItemUoms,
  getTaxTemplate,
  itemAmount,
  loadDeliveryNoteOptions,
  normalizeTaxTemplate,
  recordItemsToDraft,
  saveDeliveryNote,
  submitDeliveryNote,
} from './deliveryNoteApi';
import type {
  DeliveryNoteAddress,
  DeliveryNoteItemOption,
  DeliveryNoteItemRow,
  DeliveryNoteOptions,
  DeliveryNoteRecord,
  DeliveryNoteTaxRow,
} from './model';
import { newDeliveryNoteItem } from './model';

type FormValues = {
  customer: string;
  postingDate: string;
  company: string;
  warehouse: string;
  priceList: string;
  customerAddress: string;
  shippingAddress: string;
  adda: string;
  forTransporter: string;
  terms: string;
  remarks: string;
  transporter: string;
  lrNo: string;
  lrDate: string;
  vehicleNo: string;
  driver: string;
  driverName: string;
  poNo: string;
  poDate: string;
  contact: string;
  rentAmount: string;
  rentStatus: string;
  taxTemplate: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const blankForm = (): FormValues => ({
  customer: '',
  postingDate: today(),
  company: '',
  warehouse: '',
  priceList: '',
  customerAddress: '',
  shippingAddress: '',
  adda: '',
  forTransporter: '',
  terms: '',
  remarks: '',
  transporter: '',
  lrNo: '',
  lrDate: '',
  vehicleNo: '',
  driver: '',
  driverName: '',
  poNo: '',
  poDate: '',
  contact: '',
  rentAmount: '',
  rentStatus: '',
  taxTemplate: '',
});

function addressLabel(address: DeliveryNoteAddress): string {
  const parts = [
    address.address_title,
    address.address_type ? `(${address.address_type})` : '',
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ].filter(Boolean);
  return parts.join(', ') || address.name;
}

function addressText(address: DeliveryNoteAddress | undefined): string {
  if (!address) return '';
  return [
    address.address_title,
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ]
    .filter(Boolean)
    .join('\n');
}

function taxAmounts(
  rows: DeliveryNoteTaxRow[],
  subtotal: number,
  quantity: number,
): Array<DeliveryNoteTaxRow & { tax_amount: number; total: number }> {
  let running = subtotal;
  let previousTax = 0;
  return rows.map((row) => {
    const type = row.charge_type ?? 'On Net Total';
    const rate = Number(row.rate) || 0;
    const tax =
      type === 'Actual'
        ? Number(row.tax_amount) || 0
        : type === 'On Previous Row Amount'
          ? (previousTax * rate) / 100
          : type === 'On Previous Row Total'
            ? (running * rate) / 100
            : type === 'On Item Quantity'
              ? quantity * rate
              : (subtotal * rate) / 100;
    running += tax;
    previousTax = tax;
    return { ...row, tax_amount: tax, total: running };
  });
}

function amountText(value: number, currency = ''): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currency ? `${currency} ` : ''}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function DeliveryNoteFormPage() {
  const { name: routeName = '' } = useParams();
  const name = routeName === 'new' ? '' : routeName;
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [options, setOptions] = useState<DeliveryNoteOptions | null>(null);
  const [record, setRecord] = useState<DeliveryNoteRecord | null>(null);
  const [values, setValues] = useState<FormValues>(blankForm);
  const [rows, setRows] = useState<DeliveryNoteItemRow[]>([newDeliveryNoteItem(0)]);
  const [addresses, setAddresses] = useState<DeliveryNoteAddress[]>([]);
  const [customerInput, setCustomerInput] = useState('');
  const [taxRows, setTaxRows] = useState<DeliveryNoteTaxRow[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [recordLoading, setRecordLoading] = useState(Boolean(name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [addressesWarning, setAddressesWarning] = useState('');
  const [printWarning, setPrintWarning] = useState('');
  const [optionsRetry, setOptionsRetry] = useState(0);
  const nextRowId = useRef(1);
  const requestIds = useRef(new Map<string, number>());
  const loadedRecordName = useRef('');
  const isReadOnly = Boolean(record && record.docstatus !== 0);

  const customer = options?.customers.find((option) => option.name === values.customer);
  const company = options?.companies.find((option) => option.name === values.company);
  const priceList = options?.priceLists.find((option) => option.name === values.priceList);
  const filteredWarehouses =
    options?.warehouses.filter((warehouse) => warehouse.company === values.company) ?? [];
  const subtotal = useMemo(() => rows.reduce((total, row) => total + itemAmount(row), 0), [rows]);
  const totalQuantity = useMemo(
    () => rows.reduce((quantity, row) => quantity + (Number(row.qty) || 0), 0),
    [rows],
  );
  const displayedTaxes = useMemo(
    () => taxAmounts(taxRows, subtotal, totalQuantity),
    [taxRows, subtotal, totalQuantity],
  );
  const taxesTotal = displayedTaxes.reduce((total, row) => total + row.tax_amount, 0);
  const total = subtotal + taxesTotal;
  const selectedAddress = addresses.find((address) => address.name === values.customerAddress);
  const selectedShippingAddress = addresses.find(
    (address) => address.name === values.shippingAddress,
  );
  const standardPriceList = options?.priceLists.find((list) => list.name === 'Standard Selling');
  const selectedCustomerLabel = customer
    ? `${customer.customer_name || customer.name} (${customer.name})`
    : '';

  const logoutAndReturn = useCallback(async () => {
    await logout();
    void navigate('/login', { replace: true });
  }, [logout, navigate]);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const updateRows = (id: number, update: (row: DeliveryNoteItemRow) => DeliveryNoteItemRow) => {
    setRows((current) => current.map((row) => (row.id === id ? update(row) : row)));
  };

  const selectedItem = (itemCode: string): DeliveryNoteItemOption | undefined =>
    options?.items.find((item) => item.item_code === itemCode);

  const loadAddresses = useCallback(
    async (customerName: string, preferredBilling = '', preferredShipping = '') => {
      if (!customerName) {
        setAddresses([]);
        setValues((current) => ({ ...current, customerAddress: '', shippingAddress: '' }));
        return;
      }
      try {
        const loaded = await getCustomerAddresses(customerName);
        setAddresses(loaded);
        setAddressesWarning('');
        const billing =
          loaded.find((address) => address.name === preferredBilling) ??
          loaded.find((address) => address.address_type?.toLocaleLowerCase().includes('billing')) ??
          loaded.find((address) => Number(address.is_primary_address) === 1) ??
          loaded[0];
        const shipping =
          loaded.find((address) => address.name === preferredShipping) ??
          loaded.find((address) =>
            address.address_type?.toLocaleLowerCase().includes('shipping'),
          ) ??
          loaded.find((address) => Number(address.is_shipping_address) === 1) ??
          billing;
        setValues((current) => ({
          ...current,
          customerAddress: billing?.name ?? '',
          shippingAddress: shipping?.name ?? '',
        }));
      } catch (reason) {
        setAddresses([]);
        setAddressesWarning(
          `Customer address options could not be loaded: ${errorMessage(reason)}`,
        );
      }
    },
    [],
  );

  const applyRecord = useCallback(
    async (loaded: DeliveryNoteRecord, optionSet: DeliveryNoteOptions) => {
      setRecord(loaded);
      setValues({
        customer: loaded.customer,
        postingDate: loaded.posting_date || today(),
        company: loaded.company,
        warehouse: loaded.set_warehouse ?? '',
        priceList:
          loaded.selling_price_list ??
          optionSet.priceLists.find((item) => item.name === 'Standard Selling')?.name ??
          '',
        customerAddress: loaded.customer_address ?? '',
        shippingAddress: loaded.shipping_address_name ?? '',
        adda: loaded.custom_adda_name ?? '',
        forTransporter: loaded.custom_for_transporter ?? '',
        terms: loaded.terms ?? '',
        remarks: loaded.remarks ?? '',
        transporter: loaded.transporter ?? '',
        lrNo: loaded.lr_no ?? '',
        lrDate: loaded.lr_date ?? '',
        vehicleNo: loaded.vehicle_no ?? '',
        driver: loaded.driver ?? '',
        driverName: loaded.driver_name ?? '',
        poNo: loaded.po_no ?? '',
        poDate: loaded.po_date ?? '',
        contact: loaded.custom_contact_number ?? '',
        rentAmount: loaded.custom_rent_amount == null ? '' : String(loaded.custom_rent_amount),
        rentStatus: loaded.custom_rent_status?.toLocaleLowerCase().includes('paid')
          ? 'paid'
          : loaded.custom_rent_status?.toLocaleLowerCase().includes('pending')
            ? 'pending'
            : '',
        taxTemplate: (loaded.taxes_and_charges as string) ?? '',
      });
      const existingCustomer = optionSet.customers.find((item) => item.name === loaded.customer);
      setCustomerInput(
        existingCustomer
          ? `${existingCustomer.customer_name || existingCustomer.name} (${existingCustomer.name})`
          : `${loaded.customer_name || loaded.customer} (${loaded.customer})`,
      );
      const loadedRows = recordItemsToDraft(loaded.items ?? []).map((row, index) => ({
        ...row,
        id: nextRowId.current + index,
        packageType:
          selectedItem(loaded.items[index]?.item_code)?.custom_package_type ??
          loaded.items[index]?.custom_package_type ??
          '',
      }));
      nextRowId.current += Math.max(loadedRows.length, 1);
      setRows(loadedRows.length ? loadedRows : [newDeliveryNoteItem(nextRowId.current++)]);
      setTaxRows(loaded.taxes ?? []);
      await loadAddresses(
        loaded.customer,
        loaded.customer_address ?? '',
        loaded.shipping_address_name ?? '',
      );
    },
    [loadAddresses],
  );

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    setError('');
    loadDeliveryNoteOptions(currentUser ?? '')
      .then((result) => {
        if (!active) return;
        setOptions(result);
        const onlyCompany = result.companies.length === 1 ? result.companies[0] : undefined;
        setValues((current) => ({
          ...current,
          company: current.company || onlyCompany?.name || '',
          warehouse: current.warehouse || onlyCompany?.default_warehouse || '',
          priceList:
            current.priceList ||
            result.priceLists.find((item) => item.name === 'Standard Selling')?.name ||
            '',
        }));
        setPrintWarning(
          result.printOptionsWarning
            ? `Some Ada Parchi print lookups could not be loaded: ${result.printOptionsWarning}.`
            : '',
        );
        setOptionsLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(`Could not load Delivery Note fields and options: ${errorMessage(reason)}`);
        setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser, optionsRetry]);

  useEffect(() => {
    if (!options || !name || loadedRecordName.current === name) {
      if (!name && options) {
        setRecord(null);
        setValues(() => {
          const defaults = blankForm();
          const companyDefault = options.companies.length === 1 ? options.companies[0] : undefined;
          return {
            ...defaults,
            company: companyDefault?.name ?? '',
            warehouse: companyDefault?.default_warehouse ?? '',
            priceList: standardPriceList?.name ?? '',
          };
        });
        setRows([newDeliveryNoteItem(nextRowId.current++)]);
        setTaxRows([]);
        setCustomerInput('');
        loadedRecordName.current = '';
      }
      return;
    }
    let active = true;
    setRecordLoading(true);
    setError('');
    getDeliveryNote(name)
      .then(async (loaded) => {
        if (!active) return;
        const optionSet = options.customers.some((item) => item.name === loaded.customer)
          ? options
          : {
              ...options,
              customers: [
                ...options.customers,
                { name: loaded.customer, customer_name: loaded.customer_name },
              ],
            };
        if (optionSet !== options) setOptions(optionSet);
        loadedRecordName.current = name;
        await applyRecord(loaded, optionSet);
      })
      .catch((reason: unknown) => {
        if (active) setError(`Could not load Delivery Note ${name}: ${errorMessage(reason)}`);
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyRecord, name, options, standardPriceList?.name]);

  useEffect(() => {
    if (!record || record.docstatus !== 0 || !record.items?.length) return;
    let active = true;
    record.items.forEach((item, index) => {
      const row = rows[index];
      if (!row?.item_code) return;
      getItemUoms(row.item_code)
        .then((uoms) => {
          if (!active) return;
          const map = new Map<string, { uom: string; conversion_factor: number }>();
          const stock = selectedItem(row.item_code)?.stock_uom || item.stock_uom || row.uom;
          if (stock) map.set(stock, { uom: stock, conversion_factor: 1 });
          uoms.forEach((entry) => {
            if (entry.uom && Number(entry.conversion_factor) > 0) map.set(entry.uom, entry);
          });
          if (row.uom && !map.has(row.uom)) {
            map.set(row.uom, { uom: row.uom, conversion_factor: row.conversion_factor || 1 });
          }
          const choices = [...map.values()];
          setRows((current) =>
            current.map((currentRow) =>
              currentRow.id === row.id
                ? {
                    ...currentRow,
                    uomOptions: choices,
                    uomLoading: false,
                    conversion_factor:
                      map.get(currentRow.uom)?.conversion_factor ?? currentRow.conversion_factor,
                  }
                : currentRow,
            ),
          );
        })
        .catch((reason: unknown) => {
          if (active)
            updateRows(row.id, (current) => ({
              ...current,
              uomLoading: false,
              uomError: errorMessage(reason),
            }));
        });
    });
    return () => {
      active = false;
    };
    // The initial hydration intentionally only runs for a loaded document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.name, record?.docstatus]);

  const changeCustomer = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target.value;
    const normalized = input.trim().toLocaleLowerCase();
    const customers = options?.customers ?? [];
    const exact = customers.find(
      (option) =>
        `${option.customer_name || option.name} (${option.name})`.toLocaleLowerCase() ===
          normalized || option.name.toLocaleLowerCase() === normalized,
    );
    const nameMatches = customers.filter(
      (option) => (option.customer_name || option.name).toLocaleLowerCase() === normalized,
    );
    const selected = exact ?? (nameMatches.length === 1 ? nameMatches[0] : undefined);
    setCustomerInput(input);
    setField('customer', selected?.name ?? '');
    if (selected) {
      setField('contact', customerMobile(selected));
      void loadAddresses(selected.name);
    } else {
      setAddresses([]);
      setField('customerAddress', '');
      setField('shippingAddress', '');
    }
  };

  const changeCompany = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = options?.companies.find((item) => item.name === event.target.value);
    setValues((current) => ({
      ...current,
      company: selected?.name ?? '',
      warehouse: selected?.default_warehouse ?? '',
    }));
    setRows((current) =>
      current.map((row) => ({
        ...row,
        warehouse: row.warehouse || selected?.default_warehouse || '',
      })),
    );
  };

  const changeItem = async (
    id: number,
    field: 'item_code' | 'uom' | 'qty' | 'warehouse' | 'rate' | 'packageCount',
    value: string,
  ) => {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    if (field === 'item_code') {
      const item = selectedItem(value);
      const updated: DeliveryNoteItemRow = {
        ...newDeliveryNoteItem(id),
        item_code: value,
        uom: item?.stock_uom ?? '',
        uomOptions: item?.stock_uom ? [{ uom: item.stock_uom, conversion_factor: 1 }] : [],
        uomLoading: Boolean(item),
        warehouse: row.warehouse || values.warehouse,
        packageType: item?.custom_package_type ?? '',
        rateLoading: Boolean(value),
      };
      setRows((current) => current.map((itemRow) => (itemRow.id === id ? updated : itemRow)));
      if (!item) return;
      const uomRequest = (requestIds.current.get(`uom-${id}`) ?? 0) + 1;
      const rateRequest = (requestIds.current.get(`rate-${id}`) ?? 0) + 1;
      requestIds.current.set(`uom-${id}`, uomRequest);
      requestIds.current.set(`rate-${id}`, rateRequest);
      void getItemUoms(value)
        .then((uoms) => {
          if (requestIds.current.get(`uom-${id}`) !== uomRequest) return;
          const byUom = new Map<string, { uom: string; conversion_factor: number }>();
          if (item.stock_uom)
            byUom.set(item.stock_uom, { uom: item.stock_uom, conversion_factor: 1 });
          uoms.forEach((entry) => {
            if (entry.uom && Number(entry.conversion_factor) > 0) byUom.set(entry.uom, entry);
          });
          const choices = [...byUom.values()];
          setRows((current) =>
            current.map((itemRow) =>
              itemRow.id === id
                ? { ...itemRow, uomOptions: choices, uomLoading: false, uomError: '' }
                : itemRow,
            ),
          );
        })
        .catch((reason: unknown) => {
          if (requestIds.current.get(`uom-${id}`) === uomRequest) {
            updateRows(id, (itemRow) => ({
              ...itemRow,
              uomLoading: false,
              uomError: `Could not load UOMs: ${errorMessage(reason)}`,
            }));
          }
        });
      void getItemPriceRate(
        value,
        values.priceList || 'Standard Selling',
        item.stock_uom,
        values.postingDate,
      )
        .then((rate) => {
          if (requestIds.current.get(`rate-${id}`) !== rateRequest) return;
          updateRows(id, (itemRow) => ({
            ...itemRow,
            rate: rate === null ? itemRow.rate : String(rate),
            amount: rate === null ? itemRow.amount : String(Number(itemRow.qty || 0) * rate),
            rateLoading: false,
            rateError:
              rate === null ? `No Item Price found for ${value}; enter a rate manually.` : '',
          }));
        })
        .catch((reason: unknown) => {
          if (requestIds.current.get(`rate-${id}`) === rateRequest) {
            updateRows(id, (itemRow) => ({
              ...itemRow,
              rateLoading: false,
              rateError: `Could not fetch the Item Price: ${errorMessage(reason)} Enter a rate manually.`,
            }));
          }
        });
      return;
    }
    if (field === 'uom') {
      const selected = row.uomOptions.find((option) => option.uom === value);
      const conversion = selected?.conversion_factor ?? 1;
      const request = (requestIds.current.get(`rate-${id}`) ?? 0) + 1;
      requestIds.current.set(`rate-${id}`, request);
      updateRows(id, (itemRow) => ({
        ...itemRow,
        uom: value,
        conversion_factor: conversion,
        totalQty: String(Number(itemRow.qty || 0) * conversion || ''),
        rate: '',
        amount: '',
        rateLoading: true,
        rateError: '',
      }));
      void getItemPriceRate(
        row.item_code,
        values.priceList || 'Standard Selling',
        value,
        values.postingDate,
      )
        .then((rate) => {
          if (requestIds.current.get(`rate-${id}`) !== request) return;
          updateRows(id, (itemRow) => ({
            ...itemRow,
            rate: rate === null ? itemRow.rate : String(rate),
            amount: rate === null ? itemRow.amount : String(Number(itemRow.qty || 0) * rate),
            rateLoading: false,
            rateError:
              rate === null
                ? `No Item Price found for ${row.item_code}; enter a rate manually.`
                : '',
          }));
        })
        .catch((reason: unknown) => {
          if (requestIds.current.get(`rate-${id}`) === request) {
            updateRows(id, (itemRow) => ({
              ...itemRow,
              rateLoading: false,
              rateError: errorMessage(reason),
            }));
          }
        });
      return;
    }
    updateRows(id, (itemRow) => {
      const changed = { ...itemRow, [field]: value };
      if (field === 'qty') {
        changed.amount =
          value.trim() && itemRow.rate.trim() ? String(Number(value) * Number(itemRow.rate)) : '';
        changed.totalQty = value.trim() ? String(Number(value) * itemRow.conversion_factor) : '';
      } else if (field === 'rate') {
        changed.amount =
          value.trim() && itemRow.qty.trim() ? String(Number(value) * Number(itemRow.qty)) : '';
        changed.rateLoading = false;
        changed.rateError = '';
      }
      return changed;
    });
  };

  const addItem = () =>
    setRows((current) => [...current, newDeliveryNoteItem(nextRowId.current++)]);
  const removeItem = (id: number) =>
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));

  const selectTaxTemplate = async (templateName: string) => {
    setField('taxTemplate', templateName);
    if (!templateName) {
      setTaxRows([]);
      return;
    }
    try {
      const template = await getTaxTemplate(templateName);
      setTaxRows(normalizeTaxTemplate(template));
    } catch (reason) {
      setError(`Could not load tax template: ${errorMessage(reason)}`);
    }
  };

  const rentStatusToFrappe = (status: string) =>
    status === 'paid' ? 'Paid' : status === 'pending' ? 'Pending' : '';

  const save = async (submit = false) => {
    if (!options || optionsLoading || recordLoading || saving || isReadOnly) return;
    setError('');
    setMessage('');
    if (!values.customer || !values.postingDate || !values.company) {
      setError('Select a customer, company, and posting date before saving.');
      return;
    }
    const namingSeriesField = options.metadata.fields.find(
      (field) => field.fieldname === 'naming_series',
    );
    const namingSeries =
      namingSeriesField?.default ||
      namingSeriesField?.options?.split('\n').find((option) => option.trim()) ||
      '';
    if (!namingSeries) {
      setError('The Delivery Note naming series is not configured in Frappe.');
      return;
    }
    if (!company) {
      setError('Select a valid company.');
      return;
    }
    if (!priceList) {
      setError('The Standard Selling price list is not configured in Frappe.');
      return;
    }
    const cleanRows: Array<Record<string, unknown>> = [];
    for (const [index, row] of rows.entries()) {
      if (!row.item_code && !row.qty.trim() && !row.rate.trim()) continue;
      const item = selectedItem(row.item_code);
      const quantity = Number(row.qty);
      const rate = Number(row.rate);
      if (row.uomLoading) {
        setError(`Wait for the UOM options to load on item row ${index + 1}.`);
        return;
      }
      if (row.rateLoading) {
        setError(`Wait for the Item Price to load on item row ${index + 1}.`);
        return;
      }
      if (
        !item ||
        !row.uom ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !row.rate.trim() ||
        !Number.isFinite(rate) ||
        rate < 0
      ) {
        setError(
          `Enter a valid stock item, UOM, positive quantity, and rate on item row ${index + 1}; rate must be zero or greater.`,
        );
        return;
      }
      cleanRows.push({
        item_code: item.item_code,
        item_name: item.item_name || item.item_code,
        qty: quantity,
        uom: row.uom,
        stock_uom: item.stock_uom,
        conversion_factor: row.conversion_factor,
        total_qty: Number(row.totalQty) || quantity * row.conversion_factor,
        custom_package_count: Number(row.packageCount) || 0,
        custom_package_type: row.packageType || item.custom_package_type || null,
        warehouse: row.warehouse || values.warehouse || null,
        rate,
        amount: quantity * rate,
      });
    }
    if (!cleanRows.length) {
      setError('Add at least one stock item to the Delivery Note.');
      return;
    }
    if (
      values.rentAmount &&
      (!Number.isFinite(Number(values.rentAmount)) || Number(values.rentAmount) < 0)
    ) {
      setError('Rickshaw fare must be a non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const exchangeRate = await getExchangeRate(
        priceList.currency,
        company.default_currency,
        values.postingDate,
      );
      const document: Record<string, unknown> = {
        doctype: 'Delivery Note',
        naming_series: namingSeries,
        customer: values.customer,
        posting_date: values.postingDate,
        company: company.name,
        currency: company.default_currency,
        conversion_rate: 1,
        selling_price_list: priceList.name,
        price_list_currency: priceList.currency,
        plc_conversion_rate: exchangeRate,
        set_warehouse: values.warehouse || null,
        customer_address: values.customerAddress || null,
        shipping_address_name: values.shippingAddress || null,
        address_display: addressText(selectedAddress),
        shipping_address: addressText(selectedShippingAddress),
        custom_reference_no: record?.custom_reference_no ?? '',
        custom_adda_name: values.adda || '',
        custom_for_transporter: values.forTransporter || '',
        custom_party_name: values.customer,
        custom_contact_number: values.contact || '',
        custom_rent_amount: Number(values.rentAmount) || 0,
        custom_rent_status: rentStatusToFrappe(values.rentStatus),
        vehicle_no: values.vehicleNo || '',
        driver: values.driver || null,
        driver_name: values.driverName || '',
        lr_no: values.lrNo || '',
        lr_date: values.lrDate || null,
        po_no: values.poNo || null,
        po_date: values.poDate || null,
        items: cleanRows,
        taxes_and_charges: values.taxTemplate || null,
        taxes: displayedTaxes.map(({ tax_amount: _taxAmount, total: _total, ...tax }) => tax),
        terms: values.terms || null,
        remarks: values.remarks || '',
        transporter: values.transporter || null,
      };
      const wasCreated = !record?.name;
      let saved = await saveDeliveryNote(document, record?.name);
      let referenceWarning = '';
      if (wasCreated && saved.custom_reference_no !== saved.name) {
        try {
          saved = await saveDeliveryNote({ custom_reference_no: saved.name }, saved.name);
        } catch (reason) {
          referenceWarning = `Delivery Note ${saved.name} was saved, but its reference field could not be updated: ${errorMessage(reason)}`;
        }
      }
      if (submit) {
        try {
          saved = await submitDeliveryNote(saved);
          setMessage(`Delivery Note ${saved.name} submitted successfully.`);
          setError('');
        } catch (reason) {
          setMessage(`Delivery Note ${saved.name} remains a draft.`);
          setError(`Draft was saved, but Frappe could not submit it: ${errorMessage(reason)}`);
          try {
            saved = await getDeliveryNote(saved.name);
          } catch {
            /* Keep the saved draft response. */
          }
        }
      } else {
        setMessage(`Delivery Note ${saved.name} saved successfully.`);
      }
      if (referenceWarning) setError(referenceWarning);
      setRecord(saved);
      setValues((current) => ({ ...current, remarks: saved.remarks ?? current.remarks }));
      if (wasCreated)
        void navigate(`/delivery-note/${encodeURIComponent(saved.name)}`, { replace: true });
      if (saved.docstatus !== 0 || submit) {
        try {
          const refreshed = await getDeliveryNote(saved.name);
          setRecord(refreshed);
        } catch {
          // Keep the successful save or submit response on screen.
        }
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const printAdaParchi = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      setError('The Ada Parchi print window was blocked. Allow pop-ups and try again.');
      return;
    }
    const escapeHtml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const number = (value: unknown) => {
      if (value === null || value === undefined || value === '') return '';
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(parsed)
        : '';
    };
    const formatDate = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return year && month && day
        ? new Intl.DateTimeFormat('en-GB').format(new Date(year, month - 1, day))
        : value;
    };
    const transporterLabel = (key: string) => {
      const option = options?.transporters.find((entry) => entry.name === key);
      return option?.custom_urdu_name || option?.supplier_name || option?.transporter_name || key;
    };
    const forOption = options?.transporters.find((entry) => entry.name === values.forTransporter);
    const forPlace = forOption?.from_location_urdu || forOption?.from_location || '';
    const forLabel = forOption
      ? `${forPlace}${forPlace ? ` (${transporterLabel(values.forTransporter)})` : transporterLabel(values.forTransporter)}`
      : values.forTransporter;
    const printRows = rows.filter((row) => row.item_code || row.qty || row.packageCount);
    const totalPackages = printRows.reduce((sum, row) => sum + (Number(row.packageCount) || 0), 0);
    const totalWeight = printRows.reduce((sum, row) => sum + (Number(row.totalQty) || 0), 0);
    const bodyRows = printRows
      .map((row) => {
        const item = selectedItem(row.item_code);
        const group = options?.itemGroups.find((entry) => entry.name === item?.item_group);
        const packageTypeKey = item?.custom_package_type || row.packageType || '';
        const packageType = options?.packageTypes.find((entry) => entry.name === packageTypeKey);
        return `<tr><td class="number">${escapeHtml(number(row.packageCount))}</td><td>${escapeHtml(packageType?.package_name_urdu || packageTypeKey)}</td><td>${escapeHtml(group?.custom_urdu_name || group?.parent_item_group || group?.name || '')}</td><td class="number">${escapeHtml(number(row.totalQty))}</td></tr>`;
      })
      .join('');
    const customerName =
      customer?.customer_name_urdu ||
      customer?.custom_urdu_name ||
      customer?.customer_name ||
      values.customer;
    const rentStatus =
      values.rentStatus === 'paid'
        ? 'ادا کر دیا گیا ہے'
        : values.rentStatus === 'pending'
          ? 'ادا کرنا ہے'
          : '';
    const documentNo = record?.name || '—';
    const printHtml = `<!doctype html><html lang="ur" dir="rtl"><head><meta charset="utf-8"><title>اڈہ پرچی ${escapeHtml(documentNo)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet"><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{color:#111;font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic",serif;font-size:15px;line-height:1.7}.sheet{width:100%}h1{margin:0 0 12px;text-align:center;font-size:25px}.info{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:16px}.field{display:flex;gap:6px;min-height:28px}.label{font-weight:700;white-space:nowrap}.value{flex:1;min-height:24px;border-bottom:1px solid #111}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #111;padding:5px 8px;text-align:center}th{background:#f0f0f0}.number{direction:ltr;text-align:right;font-family:Arial,sans-serif}tfoot{font-weight:700}.totals{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}.rent{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px}.rent span{border:1px solid #111;padding:3px 8px}.note{margin:12px 0}.extra{display:flex;gap:8px}.extra .value{min-height:28px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;text-align:center}.sign-line{min-height:30px;border-bottom:2px solid #111}@media print{tr{break-inside:avoid}}</style></head>
      <body><main class="sheet"><h1>اڈہ پرچی</h1><section class="info">
      <div class="field"><span class="label">نمبر:</span><span class="value number">${escapeHtml(documentNo)}</span></div>
      <div class="field"><span class="label">تاریخ:</span><span class="value number">${escapeHtml(formatDate(values.postingDate))}</span></div>
      <div class="field"><span class="label">اڈہ کا نام:</span><span class="value">${escapeHtml(transporterLabel(values.adda))}</span></div>
      <div class="field"><span class="label">برائے:</span><span class="value">${escapeHtml(forLabel)}</span></div>
      <div class="field"><span class="label">پارٹی / لینے والا:</span><span class="value">${escapeHtml(customerName)}</span></div>
      <div class="field"><span class="label">فون نمبر:</span><span class="value number">${escapeHtml(customer?.mobile_no || values.contact)}</span></div></section>
      <table><thead><tr><th>نَگ</th><th>بھرتی</th><th>جنس</th><th>کل وزن</th></tr></thead><tbody>${bodyRows}</tbody>
      <tfoot><tr><td colspan="4"><div class="totals"><span>کل نَگ: <span class="number">${escapeHtml(number(totalPackages))}</span></span><span>کل وزن: <span class="number">${escapeHtml(number(totalWeight))}</span> کلو</span></div></td></tr></tfoot></table>
      <div class="rent"><span><strong>رکشہ کرایہ:</strong> <b class="number">${escapeHtml(number(values.rentAmount))}</b></span><span><strong>کرایہ کی حالت:</strong> ${escapeHtml(rentStatus)}</span></div>
      <p class="note">نوٹ: مال موقع پر چیک کر لیں، کمپنی بعد میں کسی نقصان کی ذمہ دار نہ ہوگی۔ شکریہ۔</p>
      <div class="extra"><strong>اضافی تفصیل:</strong><span class="value">${escapeHtml(values.remarks)}</span></div>
      <div class="signatures"><div><div class="sign-line"></div><strong>دستخط وصول کنندہ</strong></div><div><div class="sign-line"></div><strong>دستخط بھیجنے والا</strong></div></div></main></body></html>`;
    let printed = false;
    const printWhenReady = () => {
      if (printed) return;
      printed = true;
      printWindow.focus();
      printWindow.print();
    };
    printWindow.onload = () => window.setTimeout(printWhenReady, 300);
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    window.setTimeout(printWhenReady, 1500);
  };

  const inputClass =
    'min-h-11 w-full rounded-[10px] border border-[#e3eae6] bg-[#fbfdfc] px-3 py-2 text-sm text-[#1c2b26] outline-none focus:border-[#24765f] focus:ring-2 focus:ring-[#24765f]/20 disabled:bg-[#f3f6f4] disabled:text-[#6d7d77]';
  const labelClass = 'flex min-w-0 flex-col gap-[6px] text-[13px] text-[#344a42]';
  const labelTextClass = 'text-[11px] font-bold uppercase tracking-[.6px] text-[#6d7d77]';

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#1c2b26]">
      <header className="flex min-h-[72px] items-center justify-between border-b border-[#e3eae6] bg-white px-[clamp(20px,5vw,76px)] max-[580px]:px-4">
        <Link
          className="inline-flex items-center gap-3 text-[#14332b] no-underline"
          to="/home"
          aria-label="Home"
        >
          <span className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-gradient-to-br from-[#2d8a70] to-[#14332b] text-[15px] font-extrabold text-white">
            AV
          </span>
          <span className="text-left">
            <strong className="block text-lg leading-tight">AGROVISIONS</strong>
            <small className="mt-1 block text-xs text-[#6d7d77]">Delivery Note Management</small>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-semibold text-[#24765f] min-[581px]:inline">
            {currentUser}
          </span>
          <Link
            className="rounded-[10px] border border-[#d6e0da] bg-white px-3 py-2 text-sm font-bold text-[#24765f] no-underline hover:bg-[#f3f8f5]"
            to="/home"
          >
            Home
          </Link>
          <button
            className="rounded-[10px] border border-[#d6e0da] bg-white px-3 py-2 text-sm font-bold text-[#a34539] hover:bg-[#fff7f6]"
            type="button"
            onClick={() => void logoutAndReturn()}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bg-gradient-to-r from-[#14332b] to-[#24765f] px-[clamp(20px,5vw,76px)] pb-[76px] pt-7 text-white max-[700px]:px-4 max-[700px]:pb-[68px]">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="m-0 text-[13px] text-white/75">
            <Link className="text-inherit no-underline hover:text-white" to="/home">
              Home
            </Link>
            <span className="px-1">›</span>
            <Link className="text-inherit no-underline hover:text-white" to="/delivery-notes">
              Delivery Notes
            </Link>
            <span className="px-1">›</span>
            {record?.name || 'New'}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="m-0 text-[clamp(28px,4vw,36px)] font-extrabold leading-tight">
                {record?.name || 'New Delivery Note'}
              </h1>
              <p className="mb-0 mt-2 text-sm text-white/80">
                Create and manage independent Delivery Notes.
              </p>
            </div>
            {record && (
              <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
                {record.status ||
                  (record.docstatus === 1
                    ? 'Submitted'
                    : record.docstatus === 2
                      ? 'Cancelled'
                      : 'Draft')}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="w-full px-4 pb-8 max-[580px]:px-3">
        <section className="mx-auto -mt-12 w-full max-w-[1200px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3eae6] bg-white p-4 shadow-sm">
            <Link
              className="inline-flex min-h-[42px] items-center rounded-[10px] border border-[#b9dccf] bg-[#e6f3ee] px-[13px] py-2 text-sm font-semibold text-[#24765f] no-underline"
              to="/delivery-notes"
            >
              ← Back to Delivery Notes
            </Link>
            {record && <span className="text-sm text-[#6d7d77]">Delivery Note {record.name}</span>}
          </div>

          {optionsLoading || recordLoading ? (
            <p
              className="rounded-xl border border-dashed border-[#d6e0da] bg-white p-5 text-center text-sm text-[#6d7d77]"
              role="status"
            >
              {optionsLoading
                ? 'Loading Delivery Note fields and Frappe options...'
                : 'Loading Delivery Note...'}
            </p>
          ) : !options ? (
            <div
              className="rounded-xl border border-[#f1d4d0] bg-[#fff7f6] p-4 text-sm text-[#a34539]"
              role="alert"
            >
              <p className="m-0">{error || 'Delivery Note options could not be loaded.'}</p>
              <button
                className="mt-3 rounded-lg border border-[#e8bdb7] bg-white px-3 py-2 font-bold"
                type="button"
                onClick={() => setOptionsRetry((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          ) : (
            options && (
              <form
                className="grid gap-5"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void save(false);
                }}
              >
                <section
                  className="rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-[0_10px_30px_rgb(20_51_43_/_6%)] max-[580px]:p-4"
                  aria-label="Delivery Note details"
                >
                  <h2 className="mb-[18px] mt-0 flex items-center gap-[10px] text-[17px] font-extrabold text-[#14332b]">
                    <i className="h-5 w-[5px] rounded bg-[#2d8a70]" aria-hidden="true" />
                    Delivery Note Details
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={`${labelClass} sm:col-span-2 lg:col-span-1`}>
                      <span className={labelTextClass}>Customer *</span>
                      <input
                        className={inputClass}
                        type="search"
                        aria-label="Customer"
                        placeholder="Search or select customer..."
                        list="delivery-note-customers"
                        value={customerInput || selectedCustomerLabel}
                        disabled={isReadOnly}
                        required={!values.customer}
                        onChange={changeCustomer}
                      />
                      <datalist id="delivery-note-customers">
                        {(options.customers ?? [])
                          .filter((entry) => !entry.disabled)
                          .map((entry) => (
                            <option
                              key={entry.name}
                              value={`${entry.customer_name || entry.name} (${entry.name})`}
                            />
                          ))}
                      </datalist>
                      {values.customer && (
                        <span className="text-xs text-[#6d7d77]">
                          Frappe customer: {values.customer}
                        </span>
                      )}
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Date *</span>
                      <input
                        className={inputClass}
                        type="date"
                        value={values.postingDate}
                        disabled={isReadOnly}
                        required
                        onChange={(event) => setField('postingDate', event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Company *</span>
                      {isReadOnly || options.companies.length <= 1 || !options.canChangeCompany ? (
                        <input
                          className={inputClass}
                          value={values.company}
                          readOnly
                          aria-label="Company"
                        />
                      ) : (
                        <select
                          className={inputClass}
                          value={values.company}
                          onChange={changeCompany}
                          required
                        >
                          <option value="">Select company...</option>
                          {options.companies.map((entry) => (
                            <option key={entry.name} value={entry.name}>
                              {entry.name} ({entry.default_currency})
                            </option>
                          ))}
                        </select>
                      )}
                      {!isReadOnly && options.companies.length === 1 && (
                        <small className="text-xs text-[#6d7d77]">
                          Only one company is available for your account.
                        </small>
                      )}
                      {!isReadOnly && options.companies.length > 1 && !options.canChangeCompany && (
                        <small className="text-xs text-[#6d7d77]">
                          Company is read-only for your account.
                        </small>
                      )}
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Source Warehouse</span>
                      <select
                        className={inputClass}
                        value={values.warehouse}
                        disabled={isReadOnly}
                        onChange={(event) => setField('warehouse', event.target.value)}
                      >
                        <option value="">Select source warehouse...</option>
                        {filteredWarehouses.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Tax Template</span>
                      <select
                        className={inputClass}
                        value={values.taxTemplate}
                        disabled={isReadOnly}
                        onChange={(event) => void selectTaxTemplate(event.target.value)}
                      >
                        <option value="">No tax template</option>
                        {options.taxTemplates.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.title || entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Billing Address</span>
                      <select
                        className={inputClass}
                        value={values.customerAddress}
                        disabled={isReadOnly || !values.customer}
                        onChange={(event) => setField('customerAddress', event.target.value)}
                      >
                        <option value="">Select billing address...</option>
                        {addresses.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {addressLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Shipping Address</span>
                      <select
                        className={inputClass}
                        value={values.shippingAddress}
                        disabled={isReadOnly || !values.customer}
                        onChange={(event) => setField('shippingAddress', event.target.value)}
                      >
                        <option value="">Select shipping address...</option>
                        {addresses.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {addressLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Customer Contact</span>
                      <input
                        className={inputClass}
                        type="tel"
                        inputMode="tel"
                        value={values.contact}
                        disabled={isReadOnly}
                        onChange={(event) => setField('contact', event.target.value)}
                      />
                    </label>
                  </div>
                  {addressesWarning && (
                    <p
                      className="mb-0 mt-3 rounded-lg border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-sm text-[#a34539]"
                      role="alert"
                    >
                      {addressesWarning}
                    </p>
                  )}
                  {(selectedAddress || selectedShippingAddress) && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {selectedAddress && (
                        <div className="rounded-xl border border-[#e3eae6] bg-[#fbfdfc] p-3">
                          <strong className="block text-xs uppercase tracking-wide text-[#6d7d77]">
                            Billing address
                          </strong>
                          <p className="mb-0 mt-1 whitespace-pre-line text-sm">
                            {addressText(selectedAddress)}
                          </p>
                        </div>
                      )}
                      {selectedShippingAddress && (
                        <div className="rounded-xl border border-[#e3eae6] bg-[#fbfdfc] p-3">
                          <strong className="block text-xs uppercase tracking-wide text-[#6d7d77]">
                            Shipping address
                          </strong>
                          <p className="mb-0 mt-1 whitespace-pre-line text-sm">
                            {addressText(selectedShippingAddress)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section
                  className="rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-[0_10px_30px_rgb(20_51_43_/_6%)] max-[580px]:p-4"
                  aria-label="Delivery Note items"
                >
                  <h2 className="mb-[18px] mt-0 flex items-center gap-[10px] text-[17px] font-extrabold text-[#14332b]">
                    <i className="h-5 w-[5px] rounded bg-[#2d8a70]" aria-hidden="true" />
                    Items
                  </h2>
                  <div className="grid gap-3">
                    {rows.map((row) => (
                      <div className="rounded-xl border border-[#e3eae6] p-3" key={row.id}>
                        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(90px,0.7fr)_minmax(100px,0.8fr)_minmax(110px,1fr)_minmax(110px,0.8fr)_minmax(120px,0.9fr)_auto]">
                          <label className={labelClass}>
                            <span className={labelTextClass}>Item *</span>
                            <select
                              className={inputClass}
                              value={row.item_code}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                void changeItem(row.id, 'item_code', event.target.value)
                              }
                            >
                              <option value="">Select stock item...</option>
                              {options.items.map((item) => (
                                <option key={item.item_code} value={item.item_code}>
                                  {item.item_name} ({item.item_code})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={labelClass}>
                            <span className={labelTextClass}>Quantity *</span>
                            <input
                              className={inputClass}
                              type="number"
                              min="0.001"
                              step="any"
                              value={row.qty}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                void changeItem(row.id, 'qty', event.target.value)
                              }
                            />
                          </label>
                          <label className={labelClass}>
                            <span className={labelTextClass}>Packages (Nag)</span>
                            <input
                              className={inputClass}
                              type="number"
                              min="0"
                              step="any"
                              value={row.packageCount}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                void changeItem(row.id, 'packageCount', event.target.value)
                              }
                            />
                          </label>
                          <label className={labelClass}>
                            <span className={labelTextClass}>UOM</span>
                            <select
                              className={inputClass}
                              value={row.uom}
                              disabled={isReadOnly || !row.item_code || row.uomLoading}
                              onChange={(event) =>
                                void changeItem(row.id, 'uom', event.target.value)
                              }
                            >
                              <option value="">Select UOM...</option>
                              {row.uomOptions.map((entry) => (
                                <option key={entry.uom} value={entry.uom}>
                                  {entry.uom}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={labelClass}>
                            <span className={labelTextClass}>Rate</span>
                            <input
                              className={inputClass}
                              type="number"
                              min="0"
                              step="any"
                              value={row.rate}
                              disabled={isReadOnly}
                              placeholder={row.rateLoading ? 'Loading...' : 'Auto'}
                              onChange={(event) =>
                                void changeItem(row.id, 'rate', event.target.value)
                              }
                            />
                          </label>
                          <label className={labelClass}>
                            <span className={labelTextClass}>Total</span>
                            <output className={`${inputClass} flex items-center`}>
                              {row.amount || '—'}
                            </output>
                          </label>
                          {!isReadOnly && (
                            <button
                              className="min-h-[42px] rounded-[10px] border border-[#e8bdb7] bg-[#fff7f6] px-3 text-[13px] font-bold text-[#a34539] disabled:opacity-50"
                              type="button"
                              disabled={rows.length === 1}
                              onClick={() => removeItem(row.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {row.item_code && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <label className={labelClass}>
                              <span className={labelTextClass}>Delivery Warehouse</span>
                              <select
                                className={inputClass}
                                value={row.warehouse}
                                disabled={isReadOnly}
                                onChange={(event) =>
                                  void changeItem(row.id, 'warehouse', event.target.value)
                                }
                              >
                                <option value="">Use source warehouse</option>
                                {filteredWarehouses.map((entry) => (
                                  <option key={entry.name} value={entry.name}>
                                    {entry.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className={labelClass}>
                              <span className={labelTextClass}>Stock Quantity</span>
                              <output className={`${inputClass} flex items-center`}>
                                {row.totalQty || '—'}
                              </output>
                            </label>
                            <label className={labelClass}>
                              <span className={labelTextClass}>Package Type</span>
                              <input className={inputClass} value={row.packageType} readOnly />
                            </label>
                          </div>
                        )}
                        {row.rateError && (
                          <p className="mb-0 mt-2 text-xs text-[#9b2c2c]" role="alert">
                            {row.rateError}
                          </p>
                        )}
                        {row.uomError && (
                          <p className="mb-0 mt-2 text-xs text-[#9b2c2c]" role="alert">
                            {row.uomError}
                          </p>
                        )}
                        {row.item_code && (
                          <p className="mb-0 mt-2 text-xs text-[#6d7d77]">
                            Item {row.item_code} will be delivered from the selected warehouse.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {!isReadOnly && (
                    <button
                      className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#9fcdbd] bg-[#f3f9f6] text-sm font-bold text-[#24765f] hover:bg-[#e6f3ee]"
                      type="button"
                      onClick={addItem}
                    >
                      <span aria-hidden="true">+</span> Add Item
                    </button>
                  )}
                  {taxRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-[#e3eae6]">
                      <table className="w-full min-w-[400px] text-left text-sm">
                        <thead className="bg-[#f3f8f5] text-xs uppercase text-[#6d7d77]">
                          <tr>
                            <th className="px-3 py-2">Tax / Charge</th>
                            <th className="px-3 py-2">Rate</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedTaxes.map((tax, index) => (
                            <tr
                              className="border-t border-[#e3eae6]"
                              key={`${tax.account_head || tax.description || 'tax'}-${index}`}
                            >
                              <td className="px-3 py-2">
                                {tax.description || tax.account_head || 'Tax'}
                              </td>
                              <td className="px-3 py-2">{Number(tax.rate) || 0}%</td>
                              <td className="px-3 py-2 text-right">
                                {amountText(tax.tax_amount, company?.default_currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-stretch justify-start gap-3">
                    <div className="flex min-w-[min(360px,100%)] items-center justify-between gap-5 rounded-2xl bg-gradient-to-r from-[#14332b] to-[#24765f] px-6 py-[18px] text-white max-[420px]:min-w-0 max-[420px]:flex-col max-[420px]:items-start">
                      <span>
                        <span className="block text-[11px] font-bold uppercase tracking-[.6px] text-white/80">
                          Items subtotal
                        </span>
                        <span className="mt-1 block text-xs text-white/70">
                          Tax: {amountText(taxesTotal, company?.default_currency)}
                        </span>
                      </span>
                      <output
                        className="min-w-[150px] bg-transparent text-right text-2xl font-extrabold max-[420px]:text-left"
                        aria-label="Total including tax"
                      >
                        {amountText(total, company?.default_currency)}
                      </output>
                    </div>
                    {record?.grand_total != null && (
                      <div className="flex min-w-[min(260px,100%)] items-center justify-between gap-4 rounded-2xl border border-[#e3eae6] bg-[#fbfdfc] px-5 py-4">
                        <span className="text-[11px] font-bold uppercase tracking-[.6px] text-[#6d7d77]">
                          Frappe total
                        </span>
                        <strong className="text-lg">
                          {amountText(
                            Number(record.grand_total),
                            record.currency || company?.default_currency,
                          )}
                        </strong>
                      </div>
                    )}
                  </div>
                  <p className="mb-0 mt-3 text-xs text-[#6d7d77]">
                    Items are standalone Delivery Note rows; they are not automatically linked to a
                    Sales Order. Tax amounts are estimates until Frappe validates the document.
                  </p>
                </section>

                <section
                  className="rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-[0_10px_30px_rgb(20_51_43_/_6%)] max-[580px]:p-4"
                  aria-label="Transport and reference details"
                >
                  <h2 className="mb-[18px] mt-0 flex items-center gap-[10px] text-[17px] font-extrabold text-[#14332b]">
                    <i className="h-5 w-[5px] rounded bg-[#2d8a70]" aria-hidden="true" />
                    Transport &amp; Reference
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={labelClass}>
                      <span className={labelTextClass}>Ada</span>
                      <select
                        className={inputClass}
                        value={values.adda}
                        disabled={isReadOnly}
                        onChange={(event) => setField('adda', event.target.value)}
                      >
                        <option value="">Select Ada...</option>
                        {options.transporters.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.supplier_name || entry.transporter_name || entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>For (Transporter / Destination)</span>
                      <select
                        className={inputClass}
                        value={values.forTransporter}
                        disabled={isReadOnly}
                        onChange={(event) => setField('forTransporter', event.target.value)}
                      >
                        <option value="">Select destination...</option>
                        {options.transporters.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.supplier_name || entry.transporter_name || entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Transporter</span>
                      <select
                        className={inputClass}
                        value={values.transporter}
                        disabled={isReadOnly}
                        onChange={(event) => setField('transporter', event.target.value)}
                      >
                        <option value="">Select transporter...</option>
                        {options.suppliers.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.supplier_name || entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Vehicle No</span>
                      <input
                        className={inputClass}
                        value={values.vehicleNo}
                        disabled={isReadOnly}
                        onChange={(event) => setField('vehicleNo', event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Contact Number</span>
                      <input
                        className={inputClass}
                        type="tel"
                        inputMode="tel"
                        value={values.contact}
                        disabled={isReadOnly}
                        onChange={(event) => setField('contact', event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Rickshaw Fare</span>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="any"
                        value={values.rentAmount}
                        disabled={isReadOnly}
                        onChange={(event) => setField('rentAmount', event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Rickshaw Payment Status</span>
                      <select
                        className={inputClass}
                        value={values.rentStatus}
                        disabled={isReadOnly}
                        onChange={(event) => setField('rentStatus', event.target.value)}
                      >
                        <option value="">Select status...</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                      </select>
                    </label>
                    <label className={`${labelClass} hidden`}>
                      <span className={labelTextClass}>Driver</span>
                      <select
                        className={inputClass}
                        value={values.driver}
                        disabled={isReadOnly}
                        onChange={(event) => setField('driver', event.target.value)}
                      >
                        <option value="">Select driver...</option>
                        {options.drivers.map((entry) => (
                          <option key={entry.name} value={entry.name}>
                            {entry.full_name || entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Driver Name</span>
                      <input
                        className={inputClass}
                        value={values.driverName}
                        disabled={isReadOnly}
                        onChange={(event) => setField('driverName', event.target.value)}
                      />
                    </label>
                    <label className={`${labelClass} hidden`}>
                      <span className={labelTextClass}>LR / Transport Receipt No</span>
                      <input
                        className={inputClass}
                        value={values.lrNo}
                        disabled={isReadOnly}
                        onChange={(event) => setField('lrNo', event.target.value)}
                      />
                    </label>
                    <label className={`${labelClass} hidden`}>
                      <span className={labelTextClass}>LR Date</span>
                      <input
                        className={inputClass}
                        type="date"
                        value={values.lrDate}
                        disabled={isReadOnly}
                        onChange={(event) => setField('lrDate', event.target.value)}
                      />
                    </label>
                    <label className={`${labelClass} hidden`}>
                      <span className={labelTextClass}>Customer PO No</span>
                      <input
                        className={inputClass}
                        value={values.poNo}
                        disabled={isReadOnly}
                        onChange={(event) => setField('poNo', event.target.value)}
                      />
                    </label>
                    <label className={`${labelClass} hidden`}>
                      <span className={labelTextClass}>Customer PO Date</span>
                      <input
                        className={inputClass}
                        type="date"
                        value={values.poDate}
                        disabled={isReadOnly}
                        onChange={(event) => setField('poDate', event.target.value)}
                      />
                    </label>
                  </div>
                  <label className={`${labelClass} mt-4`}>
                    <span className={labelTextClass}>Terms and Conditions</span>
                    <textarea
                      className={`${inputClass} min-h-28 resize-y`}
                      rows={4}
                      value={values.terms}
                      disabled={isReadOnly}
                      placeholder="Enter delivery terms and conditions..."
                      onChange={(event) => setField('terms', event.target.value)}
                    />
                  </label>
                  <label className={`${labelClass} mt-4`}>
                    <span className={labelTextClass}>Additional Details (Ada Parchi)</span>
                    <textarea
                      className={`${inputClass} min-h-20 resize-y`}
                      rows={3}
                      value={values.remarks}
                      disabled={isReadOnly}
                      placeholder="Enter additional print details..."
                      onChange={(event) => setField('remarks', event.target.value)}
                    />
                  </label>
                </section>

                {printWarning && (
                  <p
                    className="m-0 rounded-lg border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-sm text-[#a34539]"
                    role="alert"
                  >
                    {printWarning} Check read access to these Frappe DocTypes before printing.
                  </p>
                )}
                {options.taxOptionsWarning && (
                  <p
                    className="m-0 rounded-lg border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-sm text-[#a34539]"
                    role="alert"
                  >
                    {options.taxOptionsWarning}
                  </p>
                )}
                {error && (
                  <p
                    className="m-0 rounded-lg border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-sm text-[#a34539]"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                {message && (
                  <p
                    className="m-0 rounded-lg border border-[#cce7db] bg-[#f3f9f6] px-3 py-2 text-sm text-[#24765f]"
                    role="status"
                  >
                    {message}
                  </p>
                )}

                <section className="rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-[0_10px_30px_rgb(20_51_43_/_6%)]">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link
                      className="inline-flex min-h-11 items-center rounded-[10px] border border-[#b9dccf] bg-[#e6f3ee] px-5 py-2 text-sm font-semibold text-[#24765f] no-underline"
                      to="/delivery-notes"
                    >
                      Cancel
                    </Link>
                    <button
                      className="min-h-11 rounded-[10px] border border-[#b9dccf] bg-[#e6f3ee] px-5 py-2 text-sm font-semibold text-[#24765f]"
                      type="button"
                      onClick={printAdaParchi}
                    >
                      Print Ada Parchi
                    </button>
                    {!isReadOnly && (
                      <button
                        className="min-h-11 rounded-[10px] bg-[#24765f] px-[18px] py-2 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
                        type="submit"
                        disabled={saving || optionsLoading}
                      >
                        {saving ? 'Saving...' : 'Save Draft'}
                      </button>
                    )}
                    {!isReadOnly && record && record.docstatus === 0 && (
                      <button
                        className="min-h-11 rounded-[10px] bg-[#14332b] px-[18px] py-2 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
                        type="button"
                        disabled={saving}
                        onClick={() => void save(true)}
                      >
                        {saving ? 'Submitting...' : 'Submit Delivery Note'}
                      </button>
                    )}
                  </div>
                  {!isReadOnly && record && (
                    <p className="mb-0 mt-3 text-center text-xs text-[#6d7d77]">
                      Submitting runs Frappe's stock and permission validations.
                    </p>
                  )}
                </section>
              </form>
            )
          )}
        </section>
      </main>
    </div>
  );
}
