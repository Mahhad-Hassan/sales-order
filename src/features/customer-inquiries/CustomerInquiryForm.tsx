import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  applyWorkflowAction,
  cancelInquiry,
  getInquiry,
  getWorkflowTransitions,
  loadInquiryOptions,
  saveInquiry,
  submitInquiry,
} from './customerInquiryApi';
import type {
  CustomerInquiryRecord,
  InquiryDraftItem,
  InquiryFormValues,
  InquiryItemOption,
  InquiryOptions,
  WorkflowTransition,
} from './models';

const cardClass = 'rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-sm sm:p-6';
const fieldClass = 'form-field flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-[#344a42]';
const inputClass =
  'form-input min-h-11 w-full rounded-[10px] border border-[#d6e0da] bg-white px-3 text-sm font-normal text-[#263b34] outline-none focus:border-[#24765f] focus:ring-2 focus:ring-[#24765f]/20 disabled:cursor-not-allowed disabled:bg-[#f3f5f3] disabled:text-[#6d7d77]';
const sectionTitleClass =
  'm-0 mb-4 flex items-center gap-2 text-lg font-extrabold text-[#14332b] before:h-5 before:w-1 before:rounded-full before:bg-[#24765f] before:content-[""]';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const dateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function emptyItem(rowId: number, containerNo = '1', shipmentLoad = 'FCL'): InquiryDraftItem {
  return {
    rowId,
    item_code: '',
    item_description: '',
    qty: '',
    uom: '',
    container_no: containerNo,
    target_price: '',
    preferred_brand: '',
    shipment_load: shipmentLoad,
    remarks: '',
  };
}

function emptyForm(): InquiryFormValues {
  return {
    namingSeries: '',
    customer: '',
    customerName: '',
    inquiryDate: today(),
    requiredDate: dateAfterDays(2),
    status: 'Open',
    company: '',
    responsible: '',
    currency: 'USD',
    paymentTerm: '',
    amendedFrom: '',
    shipmentRequired: true,
    incoterms: '',
    port: '',
    transportType: '',
    partialShipment: '',
    transshipment: '',
    groupTotalsBy: 'Container No',
    confirmationMethod: '',
    confirmationLog: '',
    remarks: '',
  };
}

function valuesFromRecord(record: CustomerInquiryRecord): InquiryFormValues {
  return {
    namingSeries: record.naming_series ?? '',
    customer: record.customer,
    customerName: record.customer_name ?? '',
    inquiryDate: record.inquiry_date,
    requiredDate: record.required_date,
    status: record.status ?? 'Open',
    company: record.company,
    responsible: record.responsible ?? '',
    currency: record.currency,
    paymentTerm: record.payment_term ?? '',
    amendedFrom: record.amended_from ?? '',
    shipmentRequired: Boolean(record.shipment_required),
    incoterms: record.incoterms ?? '',
    port: record.port ?? '',
    transportType: record.transport_type ?? '',
    partialShipment: record.partial_shipment ?? '',
    transshipment: record.transshipment ?? '',
    groupTotalsBy: record.group_totals_by ?? 'Container No',
    confirmationMethod: record.confirmation_method ?? '',
    confirmationLog: record.confirmation_log ?? '',
    remarks: record.remarks ?? '',
  };
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`${fieldClass} ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function optionValues(options: InquiryOptions | null, fieldname: string, child = false): string[] {
  const fields = child ? options?.childMetadata.fields : options?.parentMetadata.fields;
  return (
    fields
      ?.find((field) => field.fieldname === fieldname)
      ?.options?.split('\n')
      .map((option) => option.trim())
      .filter(Boolean) ?? []
  );
}

function documentStatus(docstatus: number, status: string): string {
  if (docstatus === 1) return `${status} · Submitted`;
  if (docstatus === 2) return 'Cancelled';
  return `${status} · Draft`;
}

export function CustomerInquiryFormPage() {
  const { name: routeName = '' } = useParams();
  const name = routeName === 'new' ? '' : routeName;
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [options, setOptions] = useState<InquiryOptions | null>(null);
  const [values, setValues] = useState<InquiryFormValues>(emptyForm);
  const [rows, setRows] = useState<InquiryDraftItem[]>([]);
  const [record, setRecord] = useState<CustomerInquiryRecord | null>(null);
  const [docstatus, setDocstatus] = useState(0);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([]);
  const [transitionsLoading, setTransitionsLoading] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemDropdown, setItemDropdown] = useState<{
    rowId: number;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [editingItemRowId, setEditingItemRowId] = useState<number | null>(null);
  const nextRowId = useRef(0);
  const itemAnchor = useRef<HTMLElement | null>(null);

  const isReadOnly = Boolean(record && docstatus !== 0);
  const workflow = options?.workflow ?? null;
  const workflowActive = Boolean(
    workflow && Number(workflow.is_active) === 1 && workflow.workflow_state_field.trim(),
  );
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase();
    return (options?.customers ?? []).filter((customer) => {
      const customerName = customer.customer_name || customer.name;
      return (
        !query ||
        customerName.toLocaleLowerCase().includes(query) ||
        customer.name.toLocaleLowerCase().includes(query)
      );
    });
  }, [customerSearch, options?.customers]);
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLocaleLowerCase();
    return (options?.items ?? []).filter(
      (item) =>
        !query ||
        item.item_name?.toLocaleLowerCase().includes(query) ||
        item.item_code.toLocaleLowerCase().includes(query) ||
        item.item_group?.toLocaleLowerCase().includes(query),
    );
  }, [itemSearch, options?.items]);
  const groupedTotals = useMemo(() => {
    const grouped = new Map<
      string,
      { groupValue: string; shipmentLoad: string; qty: number; uom: string }
    >();
    for (const row of rows) {
      if (!row.item_code) continue;
      const item = options?.items.find((option) => option.item_code === row.item_code);
      const groupValue =
        values.groupTotalsBy === 'Preferred Brand'
          ? row.preferred_brand.trim() || item?.brand || ''
          : row.container_no.trim();
      const shipmentLoad = row.shipment_load.trim();
      const uom = row.uom.trim();
      const key = JSON.stringify([groupValue, shipmentLoad, uom]);
      const group = grouped.get(key) ?? { groupValue, shipmentLoad, qty: 0, uom };
      const qty = Number(row.qty);
      if (Number.isFinite(qty)) group.qty += qty;
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [options?.items, rows, values.groupTotalsBy]);

  const refreshItemDropdownPosition = useCallback(() => {
    const anchor = itemAnchor.current;
    if (!anchor || !itemDropdown) return;
    const rect = anchor.getBoundingClientRect();
    setItemDropdown((current) =>
      current
        ? {
            ...current,
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
            width: rect.width,
          }
        : null,
    );
  }, [itemDropdown]);

  useEffect(() => {
    window.addEventListener('resize', refreshItemDropdownPosition);
    window.addEventListener('scroll', refreshItemDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', refreshItemDropdownPosition);
      window.removeEventListener('scroll', refreshItemDropdownPosition, true);
    };
  }, [refreshItemDropdownPosition]);

  useEffect(() => {
    if (!itemDropdown) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeItemDropdown();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [itemDropdown]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      setLoadingOptions(true);
      setError('');
      try {
        const loaded = await loadInquiryOptions(currentUser ?? '');
        if (!active) return;
        setOptions(loaded);
        const parentDefaults = Object.fromEntries(
          loaded.parentMetadata.fields.map((field) => [field.fieldname, field.default ?? null]),
        );
        const childDefaults = Object.fromEntries(
          loaded.childMetadata.fields.map((field) => [field.fieldname, field.default ?? null]),
        );
        const defaultCurrency = String(parentDefaults.currency ?? 'USD');
        const initialized: InquiryFormValues = {
          ...emptyForm(),
          namingSeries: String(parentDefaults.naming_series ?? ''),
          inquiryDate:
            parentDefaults.inquiry_date === 'Today'
              ? today()
              : String(parentDefaults.inquiry_date ?? today()),
          requiredDate: dateAfterDays(2),
          status: String(parentDefaults.status ?? 'Open'),
          company:
            loaded.companies.length === 1
              ? loaded.companies[0].name
              : String(parentDefaults.company ?? ''),
          responsible:
            parentDefaults.responsible === '__user' || !parentDefaults.responsible
              ? (currentUser ?? '')
              : String(parentDefaults.responsible),
          currency: loaded.currencies.some((currency) => currency.name === defaultCurrency)
            ? defaultCurrency
            : (loaded.currencies[0]?.name ?? ''),
          paymentTerm: String(parentDefaults.payment_term ?? ''),
          shipmentRequired: parentDefaults.shipment_required !== '0',
          incoterms: String(parentDefaults.incoterms ?? ''),
          port: String(parentDefaults.port ?? ''),
          transportType: String(parentDefaults.transport_type ?? ''),
          partialShipment: String(parentDefaults.partial_shipment ?? ''),
          transshipment: String(parentDefaults.transshipment ?? ''),
          groupTotalsBy: String(parentDefaults.group_totals_by ?? 'Container No'),
          confirmationMethod: String(parentDefaults.confirmation_method ?? ''),
        };
        const row = () =>
          emptyItem(
            nextRowId.current++,
            String(childDefaults.container_no ?? '1'),
            String(childDefaults.shipment_load ?? 'FCL'),
          );
        if (!name) {
          setValues(initialized);
          setRows([row()]);
          setRecord(null);
          setDocstatus(0);
          setTransitions([]);
          return;
        }

        setLoading(true);
        const loadedRecord = await getInquiry(name);
        if (!active) return;
        setRecord(loadedRecord);
        setDocstatus(loadedRecord.docstatus);
        setValues(valuesFromRecord(loadedRecord));
        if (
          loadedRecord.customer &&
          !loaded.customers.some((customer) => customer.name === loadedRecord.customer)
        ) {
          loaded.customers.push({
            name: loadedRecord.customer,
            customer_name: loadedRecord.customer_name,
          });
          setOptions({ ...loaded, customers: [...loaded.customers] });
        }
        setRows(
          (loadedRecord.items ?? []).map((item) => ({
            rowId: nextRowId.current++,
            item_code: item.item_code,
            item_description: item.item_description ?? '',
            qty: String(item.qty ?? ''),
            uom:
              item.uom ||
              loaded.items.find((option) => option.item_code === item.item_code)?.stock_uom ||
              '',
            container_no: item.container_no ?? '',
            target_price:
              item.target_price === undefined || item.target_price === null
                ? ''
                : String(item.target_price),
            preferred_brand:
              item.preferred_brand ||
              loaded.items.find((option) => option.item_code === item.item_code)?.brand ||
              '',
            shipment_load: item.shipment_load ?? '',
            remarks: item.remarks ?? '',
          })),
        );
        const hasWorkflow = Boolean(
          loaded.workflow &&
          Number(loaded.workflow.is_active) === 1 &&
          loaded.workflow.workflow_state_field.trim(),
        );
        if (hasWorkflow && Number(loadedRecord.docstatus) !== 2) {
          setTransitionsLoading(true);
          try {
            setTransitions(await getWorkflowTransitions(name));
          } catch (cause) {
            setWorkflowError(`Could not load workflow actions: ${errorText(cause)}`);
          } finally {
            setTransitionsLoading(false);
          }
        } else {
          setTransitions([]);
        }
      } catch (cause) {
        if (active)
          setError(
            `Could not load Customer Inquiry${name ? ` ${name}` : ' fields and options'}: ${errorText(cause)}`,
          );
      } finally {
        if (active) {
          setLoadingOptions(false);
          setLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [currentUser, name]);

  function errorText(cause: unknown): string {
    return cause instanceof Error ? cause.message : 'Unexpected Frappe error.';
  }

  function setField<K extends keyof InquiryFormValues>(field: K, value: InquiryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function setRowField<K extends Exclude<keyof InquiryDraftItem, 'rowId'>>(
    rowId: number,
    field: K,
    value: InquiryDraftItem[K],
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.rowId !== rowId) return row;
        if (field === 'item_code') {
          const selected = options?.items.find((item) => item.item_code === value);
          return {
            ...row,
            item_code: String(value),
            item_description: selected?.item_name ?? '',
            uom: selected?.stock_uom ?? '',
            preferred_brand: selected?.brand ?? '',
          };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function openItemDropdown(rowId: number, anchor: HTMLElement) {
    if (isReadOnly) return;
    const rect = anchor.getBoundingClientRect();
    itemAnchor.current = anchor;
    setItemSearch('');
    setItemDropdown({
      rowId,
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
    });
  }

  function closeItemDropdown() {
    setItemDropdown(null);
    setItemSearch('');
    itemAnchor.current = null;
  }

  function selectItem(item: InquiryItemOption) {
    if (itemDropdown) setRowField(itemDropdown.rowId, 'item_code', item.item_code);
    closeItemDropdown();
  }

  function appendItem() {
    const childDefaults = Object.fromEntries(
      (options?.childMetadata.fields ?? []).map((field) => [
        field.fieldname,
        field.default ?? null,
      ]),
    );
    setRows((current) => [
      ...current,
      emptyItem(
        nextRowId.current++,
        String(childDefaults.container_no ?? '1'),
        String(childDefaults.shipment_load ?? 'FCL'),
      ),
    ]);
  }

  function removeItem(rowId: number) {
    if (rows.length <= 1) return;
    setRows((current) => current.filter((row) => row.rowId !== rowId));
    closeItemDropdown();
    if (editingItemRowId === rowId) setEditingItemRowId(null);
  }

  function selectCustomer(customer: { name: string; customer_name?: string | null }) {
    setValues((current) => ({
      ...current,
      customer: customer.name,
      customerName: customer.customer_name || customer.name,
    }));
    setCustomerDropdownOpen(false);
    setCustomerSearch('');
  }

  async function completeSave(submit: boolean, workflowAction = false, existingAction?: string) {
    if (loadingOptions || loading || saving || isReadOnly) return;
    setError('');
    setMessage('');
    const requiredMissing =
      !values.customer ||
      !values.inquiryDate ||
      !values.requiredDate ||
      !values.company ||
      !values.currency;
    if (requiredMissing) {
      setError(
        'Complete the required customer, inquiry date, required date, company, and currency fields.',
      );
      return;
    }
    const validRows: Array<Record<string, unknown>> = [];
    for (const [index, row] of rows.entries()) {
      if (!row.item_code && !row.qty.trim()) continue;
      const item = options?.items.find((option) => option.item_code === row.item_code);
      const qty = Number(row.qty);
      if (!item || !Number.isFinite(qty) || qty <= 0) {
        setError(`Select an item and enter a positive quantity on row ${index + 1}.`);
        return;
      }
      const targetPrice = row.target_price.trim() ? Number(row.target_price) : null;
      if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
        setError(`Enter a valid non-negative target price on row ${index + 1}.`);
        return;
      }
      validRows.push({
        doctype: 'Customer Inquiry Item',
        item_code: item.item_code,
        item_description: row.item_description || item.item_name || item.item_code,
        qty,
        uom: row.uom.trim() || item.stock_uom || null,
        container_no: row.container_no || null,
        target_price: targetPrice,
        preferred_brand: row.preferred_brand || null,
        shipment_load: row.shipment_load || null,
        remarks: row.remarks || null,
      });
    }
    if (!validRows.length) {
      setError('Add at least one requested item to the Customer Inquiry.');
      return;
    }

    const parentDefaults = Object.fromEntries(
      (options?.parentMetadata.fields ?? []).map((field) => [
        field.fieldname,
        field.default ?? null,
      ]),
    );
    const document: Record<string, unknown> = {
      doctype: 'Customer Inquiry',
      naming_series: values.namingSeries || parentDefaults.naming_series || undefined,
      customer: values.customer,
      customer_name: values.customerName || values.customer,
      inquiry_date: values.inquiryDate,
      required_date: values.requiredDate,
      status: values.status,
      company: values.company,
      responsible: values.responsible || null,
      currency: values.currency,
      payment_term: values.paymentTerm || null,
      shipment_required: values.shipmentRequired ? 1 : 0,
      incoterms: values.incoterms || null,
      port: values.port || null,
      transport_type: values.transportType || null,
      partial_shipment: values.partialShipment || null,
      transshipment: values.transshipment || null,
      group_totals_by: values.groupTotalsBy || null,
      confirmation_method: values.confirmationMethod || null,
      confirmation_log: values.confirmationLog || null,
      remarks: values.remarks || null,
      items: validRows,
    };

    setSaving(true);
    try {
      let saved = await saveInquiry(document, record?.name);
      let submitError = '';
      if (workflowAction) {
        const action = existingAction ?? (await getWorkflowTransitions(saved.name))[0]?.action;
        if (!action)
          throw new Error('No workflow action is currently available for this Customer Inquiry.');
        try {
          saved = await applyWorkflowAction(saved.name, action);
        } catch (cause) {
          saved = await getInquiry(saved.name);
          submitError = `Draft was saved, but its workflow action could not be applied: ${errorText(cause)}`;
        }
      } else if (submit) {
        try {
          saved = await submitInquiry(saved);
        } catch (cause) {
          saved = await getInquiry(saved.name);
          submitError = `Draft was saved, but Frappe could not submit it: ${errorText(cause)}`;
        }
      }
      setRecord(saved);
      setDocstatus(saved.docstatus);
      setValues(valuesFromRecord(saved));
      setRows(
        (saved.items ?? []).map((item) => ({
          rowId: nextRowId.current++,
          item_code: item.item_code,
          item_description: item.item_description ?? '',
          qty: String(item.qty ?? ''),
          uom: item.uom ?? '',
          container_no: item.container_no ?? '',
          target_price: item.target_price == null ? '' : String(item.target_price),
          preferred_brand: item.preferred_brand ?? '',
          shipment_load: item.shipment_load ?? '',
          remarks: item.remarks ?? '',
        })),
      );
      setError(submitError);
      setMessage(
        submitError
          ? `Customer Inquiry ${saved.name} remains a draft.`
          : submit
            ? `Customer Inquiry ${saved.name} submitted successfully.`
            : workflowAction
              ? `Customer Inquiry ${saved.name} workflow action completed.`
              : `Customer Inquiry ${saved.name} saved successfully.`,
      );
      if (saved.name !== name)
        void navigate(`/customer-inquiry/${encodeURIComponent(saved.name)}`, { replace: true });
      if (workflowActive && saved.docstatus !== 2) {
        try {
          setTransitions(await getWorkflowTransitions(saved.name));
        } catch (cause) {
          setWorkflowError(`Could not load workflow actions: ${errorText(cause)}`);
        }
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflowAction(action: string) {
    if (!record || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    setWorkflowError('');
    try {
      const updated = await applyWorkflowAction(record.name, action);
      setRecord(updated);
      setDocstatus(updated.docstatus);
      setValues(valuesFromRecord(updated));
      setRows(
        (updated.items ?? []).map((item) => ({
          rowId: nextRowId.current++,
          item_code: item.item_code,
          item_description: item.item_description ?? '',
          qty: String(item.qty ?? ''),
          uom: item.uom ?? '',
          container_no: item.container_no ?? '',
          target_price: item.target_price == null ? '' : String(item.target_price),
          preferred_brand: item.preferred_brand ?? '',
          shipment_load: item.shipment_load ?? '',
          remarks: item.remarks ?? '',
        })),
      );
      setMessage(`Customer Inquiry ${updated.name}: ${action} completed.`);
      setTransitions(await getWorkflowTransitions(updated.name));
    } catch (cause) {
      setWorkflowError(`Could not apply workflow action: ${errorText(cause)}`);
    } finally {
      setSaving(false);
    }
  }

  async function cancelDocument() {
    if (!record || record.docstatus !== 1 || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const cancelled = await cancelInquiry(record);
      setRecord(cancelled);
      setDocstatus(cancelled.docstatus);
      setValues(valuesFromRecord(cancelled));
      setMessage(`Customer Inquiry ${cancelled.name} cancelled successfully.`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await logout();
    void navigate('/login', { replace: true });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void completeSave(false);
  }

  const isCompanyDisabled =
    isReadOnly || !options?.canChangeCompany || (options?.companies.length ?? 0) <= 1;
  const statusLabel = documentStatus(docstatus, values.status || 'Open');

  return (
    <div className="min-h-screen bg-[#eef1eb]">
      <header className="relative flex min-h-[72px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#d6e0da] bg-white px-[clamp(20px,5vw,76px)] py-2 max-[580px]:px-3 print:hidden">
        <Link
          className="inline-flex items-center gap-3 text-[#14332b] no-underline"
          to="/home"
          aria-label="Home"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#24765f] text-sm font-extrabold text-white"
            aria-hidden="true"
          >
            AV
          </span>
          <span className="text-left">
            <strong className="block text-[18px] font-extrabold leading-tight">AGROVISIONS</strong>
            <small className="mt-1 block text-xs text-[#6d7d77]">Customer Inquiry Management</small>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-3 max-[380px]:gap-1.5">
          <span className="text-sm font-semibold text-[#24765f] max-[580px]:hidden">
            {currentUser}
          </span>
          <Link
            className="rounded-lg border border-[#d6e0da] bg-white px-3 py-1 text-sm font-bold text-[#24765f] no-underline hover:bg-[#f3f8f5] max-[380px]:px-2 max-[380px]:text-xs"
            to="/home"
          >
            Home
          </Link>
          <button
            className="rounded-lg border border-[#e0e8e4] bg-white px-3 py-1 text-sm font-bold text-[#a34539] hover:bg-[#fff7f6] max-[380px]:px-2 max-[380px]:text-xs"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bg-[linear-gradient(120deg,#14332b,#24765f)] px-[clamp(20px,5vw,76px)] pt-7 pb-[76px] text-white max-[700px]:px-4 max-[700px]:pt-6 max-[700px]:pb-[68px] print:hidden">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="m-0 text-[13px] text-white/75">
            <Link className="text-white/75 no-underline hover:text-white" to="/home">
              Home
            </Link>
            <span className="px-1" aria-hidden="true">
              ›
            </span>
            <Link className="text-white/75 no-underline hover:text-white" to="/customer-inquiries">
              Customer Inquiries
            </Link>
            <span className="px-1" aria-hidden="true">
              ›
            </span>
            {name || 'New'}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="m-0 text-[clamp(28px,4vw,36px)] font-extrabold leading-tight">
                {name || 'New Customer Inquiry'}
              </h1>
              <p className="mt-2 mb-0 text-sm text-white/80">
                Capture customer requirements and shipment details.
              </p>
            </div>
            {name && (
              <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="w-full px-4 pb-8 max-[580px]:px-3">
        <section className="mx-auto -mt-12 w-full max-w-[1200px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3eae6] bg-white p-4 shadow-sm print:hidden">
            <Link
              className="inline-flex min-h-[42px] items-center rounded-[10px] border border-[#d6e0da] px-[13px] py-2 text-sm font-semibold text-[#24765f] no-underline hover:bg-[#f3f8f5]"
              to="/customer-inquiries"
            >
              ← Back to Customer Inquiries
            </Link>
            {name && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-[#6d7d77]">
                <span>Customer Inquiry {name}</span>
                <button
                  className="rounded-lg border border-[#d6e0da] px-3 py-2 font-semibold text-[#24765f] hover:bg-[#f3f8f5]"
                  type="button"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              </div>
            )}
          </div>

          {loadingOptions || loading ? (
            <p
              className="rounded-xl border border-dashed border-[#d6e0da] bg-white p-5 text-center text-sm text-[#6d7d77]"
              role="status"
            >
              {loadingOptions
                ? 'Loading Customer Inquiry fields and Frappe options...'
                : 'Loading Customer Inquiry...'}
            </p>
          ) : !options ? (
            <div
              className="rounded-xl border border-[#f1d4d0] bg-[#fff7f6] p-4 text-sm text-[#a34539]"
              role="alert"
            >
              <p className="m-0">
                {error || 'Could not load Customer Inquiry fields and options.'}
              </p>
              <button
                className="mt-3 rounded-lg border border-[#e8bdb7] bg-white px-3 py-2 font-bold"
                type="button"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : (
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <section className={cardClass} aria-label="Inquiry document information">
                <h2 className={sectionTitleClass}>Document Information</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Series">
                    <input className={inputClass} value={values.namingSeries} readOnly />
                  </Field>
                  <Field label="Status">
                    <input className={inputClass} value={values.status} readOnly />
                  </Field>
                  <Field label="Company *">
                    {options.companies.length === 1 || !options.canChangeCompany ? (
                      <input className={inputClass} value={values.company} readOnly />
                    ) : (
                      <select
                        className={inputClass}
                        value={values.company}
                        disabled={isCompanyDisabled}
                        onChange={(event) => setField('company', event.target.value)}
                      >
                        <option value="">Select company...</option>
                        {options.companies.map((company) => (
                          <option key={company.name} value={company.name}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {!isReadOnly &&
                      (options.companies.length === 1 || !options.canChangeCompany) && (
                        <small className="text-xs font-normal text-[#6d7d77]">
                          {options.companies.length === 1
                            ? 'Only one company is available for your account.'
                            : 'Company is read-only for your account.'}
                        </small>
                      )}
                  </Field>
                </div>
              </section>

              <section className={cardClass} aria-label="Inquiry details">
                <h2 className={sectionTitleClass}>Inquiry Details</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Customer *">
                    <div className="relative">
                      <button
                        className={`${inputClass} relative flex items-center justify-between text-left`}
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={customerDropdownOpen}
                        aria-invalid={!values.customer}
                        disabled={isReadOnly}
                        onClick={() => {
                          setCustomerDropdownOpen((open) => !open);
                          setCustomerSearch('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setCustomerDropdownOpen(false);
                        }}
                      >
                        <span className="truncate">
                          {values.customer
                            ? values.customerName || values.customer
                            : 'Select customer...'}
                        </span>
                        <span
                          aria-hidden="true"
                          className="ml-3 border-x-[5px] border-x-transparent border-t-[6px] border-t-current"
                        />
                      </button>
                      {customerDropdownOpen && (
                        <div
                          className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-80 overflow-hidden rounded-xl border border-[#d6e0da] bg-white shadow-xl"
                          role="region"
                          aria-label="Customer search"
                        >
                          <input
                            className="w-full border-0 border-b border-[#d6e0da] bg-white px-3 py-2 text-sm outline-none"
                            type="search"
                            autoFocus
                            placeholder="Search customers"
                            aria-label="Search customers"
                            value={customerSearch}
                            onChange={(event) => setCustomerSearch(event.target.value)}
                          />
                          <div
                            className="max-h-64 overflow-y-auto"
                            role="listbox"
                            aria-label="Customer options"
                          >
                            {filteredCustomers.length ? (
                              filteredCustomers.map((customer) => (
                                <button
                                  className="block w-full border-0 bg-white px-3 py-2 text-left text-sm hover:bg-[#f3f8f5]"
                                  key={customer.name}
                                  type="button"
                                  role="option"
                                  aria-selected={values.customer === customer.name}
                                  onClick={() => selectCustomer(customer)}
                                >
                                  {customer.customer_name || customer.name}
                                </button>
                              ))
                            ) : (
                              <p className="m-0 px-3 py-3 text-sm text-[#6d7d77]" role="status">
                                No matching customers.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {!values.customer && (
                      <small className="text-xs font-normal text-[#a34539]">Required field</small>
                    )}
                  </Field>
                  <Field label="Inquiry Date *">
                    <input
                      className={inputClass}
                      type="date"
                      required
                      value={values.inquiryDate}
                      disabled={isReadOnly}
                      onChange={(event) => setField('inquiryDate', event.target.value)}
                    />
                  </Field>
                  <Field label="Required Date *">
                    <input
                      className={inputClass}
                      type="date"
                      required
                      value={values.requiredDate}
                      disabled={isReadOnly}
                      onChange={(event) => setField('requiredDate', event.target.value)}
                    />
                  </Field>
                  <Field label="Responsible">
                    <select
                      className={inputClass}
                      value={values.responsible}
                      disabled={isReadOnly}
                      onChange={(event) => setField('responsible', event.target.value)}
                    >
                      <option value="">Select responsible user...</option>
                      {options.users.map((user) => (
                        <option key={user.name} value={user.name}>
                          {user.full_name || user.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Currency *">
                    <select
                      className={inputClass}
                      required
                      value={values.currency}
                      disabled={isReadOnly}
                      onChange={(event) => setField('currency', event.target.value)}
                    >
                      <option value="">Select currency...</option>
                      {options.currencies.map((currency) => (
                        <option key={currency.name} value={currency.name}>
                          {currency.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {values.amendedFrom && (
                    <Field label="Amended From">
                      <input className={inputClass} value={values.amendedFrom} readOnly />
                    </Field>
                  )}
                  {Boolean(record?.rfq_emails_sent) && (
                    <Field label="RFQ Emails Sent">
                      <input className={inputClass} value="Yes" readOnly />
                    </Field>
                  )}
                </div>
              </section>

              <section className={cardClass} aria-label="Requested items">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className={`${sectionTitleClass} mb-0`}>Requested Items</h2>
                  {!isReadOnly && (
                    <button
                      className="rounded-xl border border-[#b8d5c8] bg-[#e6f3ee] px-4 py-2 text-sm font-bold text-[#24765f] hover:bg-[#d9eee5]"
                      type="button"
                      onClick={appendItem}
                    >
                      + Add Item
                    </button>
                  )}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-[#d6e0da] lg:block">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead className="bg-[#f3f8f5] text-[#344a42]">
                      <tr>
                        {[
                          'Item *',
                          'Description',
                          'Qty *',
                          'UOM',
                          'Container No',
                          'Preferred Brand',
                          'Shipment Load',
                          ...(!isReadOnly ? ['Action'] : []),
                        ].map((label) => (
                          <th
                            className="border-r border-[#d6e0da] p-2 font-bold last:border-r-0"
                            key={label}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr className="align-top" key={row.rowId}>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <button
                              className="relative flex min-h-[40px] w-full items-center justify-between rounded px-2 text-left text-sm disabled:cursor-not-allowed"
                              type="button"
                              aria-haspopup="listbox"
                              aria-expanded={itemDropdown?.rowId === row.rowId}
                              disabled={isReadOnly}
                              onClick={(event) => openItemDropdown(row.rowId, event.currentTarget)}
                            >
                              <span className="truncate">
                                {row.item_code
                                  ? row.item_description || row.item_code
                                  : 'Select item...'}
                              </span>
                              <span
                                className="ml-2 border-x-[5px] border-x-transparent border-t-[6px] border-t-current"
                                aria-hidden="true"
                              />
                            </button>
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <input
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs disabled:bg-transparent"
                              value={row.item_description}
                              disabled
                            />
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <input
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs"
                              type="number"
                              min="0.001"
                              step="any"
                              value={row.qty}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                setRowField(row.rowId, 'qty', event.target.value)
                              }
                            />
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <select
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs"
                              value={row.uom}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                setRowField(row.rowId, 'uom', event.target.value)
                              }
                            >
                              <option value="">Select UOM...</option>
                              {options.uoms.map((uom) => (
                                <option key={uom.name} value={uom.name}>
                                  {uom.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <input
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs"
                              value={row.container_no}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                setRowField(row.rowId, 'container_no', event.target.value)
                              }
                            />
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <select
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs"
                              value={row.preferred_brand}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                setRowField(row.rowId, 'preferred_brand', event.target.value)
                              }
                            >
                              <option value="">Select brand...</option>
                              {options.brands.map((brand) => (
                                <option key={brand.name} value={brand.name}>
                                  {brand.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-t border-r border-[#d6e0da] p-1">
                            <select
                              className="min-h-10 w-full min-w-0 bg-transparent px-1 text-xs"
                              value={row.shipment_load}
                              disabled={isReadOnly}
                              onChange={(event) =>
                                setRowField(row.rowId, 'shipment_load', event.target.value)
                              }
                            >
                              <option value="">Select shipment load...</option>
                              {optionValues(options, 'shipment_load', true).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          {!isReadOnly && (
                            <td className="border-t border-[#d6e0da] p-1 text-center align-middle">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                <button
                                  className="h-9 rounded-lg border border-[#cbd9d1] px-3 font-bold text-[#24765f] hover:bg-[#f3f8f5]"
                                  type="button"
                                  aria-label={`Edit item row ${index + 1}`}
                                  onClick={() => setEditingItemRowId(row.rowId)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="h-9 rounded-lg border border-[#e8bdb7] px-3 font-bold text-[#a34539] hover:bg-[#fff7f6] disabled:opacity-50"
                                  type="button"
                                  aria-label={`Remove item row ${index + 1}`}
                                  disabled={rows.length === 1}
                                  onClick={() => removeItem(row.rowId)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 lg:hidden">
                  {rows.map((row, index) => (
                    <article
                      className="rounded-xl border border-[#d6e0da] bg-white p-3 shadow-sm sm:p-4"
                      key={row.rowId}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="m-0 text-sm font-extrabold text-[#14332b]">
                            Item {index + 1}
                          </h3>
                          <p className="mb-0 mt-1 break-words text-sm font-semibold text-[#344a42]">
                            {row.item_description || row.item_code || 'No item selected'}
                          </p>
                          {row.item_code && row.item_description !== row.item_code && (
                            <p className="mb-0 mt-0.5 break-all text-xs text-[#6d7d77]">
                              {row.item_code}
                            </p>
                          )}
                        </div>
                        {!isReadOnly && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              className="min-h-9 rounded-lg border border-[#cbd9d1] px-3 text-sm font-bold text-[#24765f]"
                              type="button"
                              onClick={() => setEditingItemRowId(row.rowId)}
                            >
                              Edit
                            </button>
                            <button
                              className="min-h-9 rounded-lg border border-[#e8bdb7] px-3 text-sm font-bold text-[#a34539] disabled:opacity-50"
                              type="button"
                              disabled={rows.length === 1}
                              onClick={() => removeItem(row.rowId)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <Info label="Qty" value={row.qty} />
                        <Info label="UOM" value={row.uom} />
                        <Info label="Container No" value={row.container_no} />
                        <Info label="Preferred Brand" value={row.preferred_brand} />
                        <Info label="Shipment Load" value={row.shipment_load} />
                        <Info label="Target Price" value={row.target_price} />
                        <Info label="Remarks" value={row.remarks} />
                      </dl>
                    </article>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(220px,360px)_1fr]">
                  <Field label="Group Totals By">
                    <select
                      className={inputClass}
                      value={values.groupTotalsBy}
                      disabled={isReadOnly}
                      onChange={(event) => setField('groupTotalsBy', event.target.value)}
                    >
                      {optionValues(options, 'group_totals_by').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <section
                  className="mt-5 rounded-xl border border-[#e3eae6] bg-[#fbfdfc] p-4"
                  aria-label="Container group totals"
                >
                  <h3 className="m-0 mb-3 text-sm font-extrabold text-[#14332b]">Group Totals</h3>
                  <div className="overflow-x-auto rounded-xl border border-[#e3eae6]">
                    <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                      <thead className="bg-[#f3f8f5] text-[#344a42]">
                        <tr>
                          <th className="border border-[#d6e0da] p-3 font-bold">
                            {values.groupTotalsBy}
                          </th>
                          <th className="border border-[#d6e0da] p-3 font-bold">Shipment Load</th>
                          <th className="border border-[#d6e0da] p-3 text-right font-bold">Qty</th>
                          <th className="border border-[#d6e0da] p-3 font-bold">UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedTotals.length ? (
                          groupedTotals.map((group, index) => (
                            <tr
                              key={`${group.groupValue}-${group.shipmentLoad}-${group.uom}-${index}`}
                            >
                              <td className="border border-[#d6e0da] p-3 text-[#344a42]">
                                {group.groupValue || '—'}
                              </td>
                              <td className="border border-[#d6e0da] p-3 text-[#344a42]">
                                {group.shipmentLoad || '—'}
                              </td>
                              <td className="border border-[#d6e0da] p-3 text-right text-[#344a42]">
                                {group.qty}
                              </td>
                              <td className="border border-[#d6e0da] p-3 text-[#344a42]">
                                {group.uom || '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              className="border border-[#d6e0da] p-3 text-center text-[#6d7d77]"
                              colSpan={4}
                            >
                              Select items above to populate group totals.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>

              <section className={cardClass} aria-label="Shipment details">
                <h2 className={sectionTitleClass}>Shipment Details</h2>
                <label className="mb-4 inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-[#344a42]">
                  <input
                    className="h-4 w-4 accent-[#24765f]"
                    type="checkbox"
                    checked={values.shipmentRequired}
                    disabled={isReadOnly}
                    onChange={(event) => setField('shipmentRequired', event.target.checked)}
                  />
                  Shipment Required
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Payment Term">
                    <select
                      className={inputClass}
                      value={values.paymentTerm}
                      disabled={isReadOnly}
                      onChange={(event) => setField('paymentTerm', event.target.value)}
                    >
                      <option value="">Select payment term...</option>
                      {options.paymentTerms.map((term) => (
                        <option key={term.name} value={term.name}>
                          {term.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Incoterm">
                    <select
                      className={inputClass}
                      value={values.incoterms}
                      disabled={isReadOnly}
                      onChange={(event) => setField('incoterms', event.target.value)}
                    >
                      <option value="">Select Incoterm...</option>
                      {options.incoterms.map((incoterm) => (
                        <option key={incoterm.name} value={incoterm.name}>
                          {incoterm.name}
                          {incoterm.title ? ` - ${incoterm.title}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Port">
                    <input
                      className={inputClass}
                      value={values.port}
                      disabled={isReadOnly}
                      onChange={(event) => setField('port', event.target.value)}
                    />
                  </Field>
                  <Field label="Transport Type">
                    <select
                      className={inputClass}
                      value={values.transportType}
                      disabled={isReadOnly}
                      onChange={(event) => setField('transportType', event.target.value)}
                    >
                      <option value="">Select transport type...</option>
                      {optionValues(options, 'transport_type').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Partial Shipment">
                    <select
                      className={inputClass}
                      value={values.partialShipment}
                      disabled={isReadOnly}
                      onChange={(event) => setField('partialShipment', event.target.value)}
                    >
                      <option value="">Select option...</option>
                      {optionValues(options, 'partial_shipment').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Trans-shipment">
                    <select
                      className={inputClass}
                      value={values.transshipment}
                      disabled={isReadOnly}
                      onChange={(event) => setField('transshipment', event.target.value)}
                    >
                      <option value="">Select option...</option>
                      {optionValues(options, 'partial_shipment').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              <section className={cardClass} aria-label="Customer confirmation">
                <h2 className={sectionTitleClass}>Customer Confirmation</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Confirmation Method">
                    <select
                      className={inputClass}
                      value={values.confirmationMethod}
                      disabled={isReadOnly}
                      onChange={(event) => setField('confirmationMethod', event.target.value)}
                    >
                      <option value="">Select confirmation method...</option>
                      {optionValues(options, 'confirmation_method').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Confirmation Log">
                    <textarea
                      className={`${inputClass} min-h-28 py-2`}
                      value={values.confirmationLog}
                      disabled={isReadOnly}
                      onChange={(event) => setField('confirmationLog', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className={cardClass} aria-label="Inquiry notes">
                <h2 className={sectionTitleClass}>Notes</h2>
                <Field label="Notes">
                  <textarea
                    className={`${inputClass} min-h-36 resize-y py-2`}
                    value={values.remarks}
                    disabled={isReadOnly}
                    onChange={(event) => setField('remarks', event.target.value)}
                  />
                </Field>
              </section>

              {message && (
                <p
                  className="m-0 rounded-xl border border-[#b9dccf] bg-[#e6f3ee] px-4 py-3 text-sm font-semibold text-[#24765f]"
                  role="status"
                >
                  {message}
                </p>
              )}
              {error && (
                <p
                  className="m-0 rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-4 py-3 text-sm text-[#a34539]"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[#e3eae6] bg-white p-4 shadow-sm print:hidden">
                {workflowActive ? (
                  <>
                    {!isReadOnly && (
                      <button
                        className="min-h-11 rounded-[10px] border border-[#d6e0da] px-5 py-2 text-sm font-bold text-[#24765f] disabled:opacity-60"
                        type="submit"
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save Draft'}
                      </button>
                    )}
                    {transitionsLoading ? (
                      <button
                        className="min-h-11 rounded-xl bg-[#24765f] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                        type="button"
                        disabled
                      >
                        Loading workflow...
                      </button>
                    ) : transitions.length ? (
                      <button
                        className="min-h-11 rounded-xl bg-[#24765f] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          isReadOnly
                            ? void runWorkflowAction(transitions[0].action)
                            : void completeSave(false, true, transitions[0].action)
                        }
                      >
                        {saving ? 'Applying...' : transitions[0].action}
                      </button>
                    ) : !name ? (
                      <button
                        className="min-h-11 rounded-xl bg-[#24765f] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                        type="button"
                        disabled={saving}
                        onClick={() => void completeSave(false, true)}
                      >
                        {saving ? 'Saving...' : 'Save & Continue'}
                      </button>
                    ) : (
                      !workflowError && (
                        <p className="m-0 text-sm text-[#6d7d77]" role="status">
                          No workflow actions are currently available.
                        </p>
                      )
                    )}
                  </>
                ) : docstatus === 1 ? (
                  <button
                    className="min-h-11 rounded-[10px] border border-[#e8bdb7] px-5 text-sm font-bold text-[#a34539] disabled:opacity-60"
                    type="button"
                    disabled={saving}
                    onClick={() => void cancelDocument()}
                  >
                    {saving ? 'Cancelling...' : 'Cancel Inquiry'}
                  </button>
                ) : docstatus === 0 ? (
                  <>
                    <button
                      className="min-h-11 rounded-[10px] border border-[#d6e0da] px-5 py-2 text-sm font-bold text-[#24765f] disabled:opacity-60"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button
                      className="min-h-11 rounded-xl bg-[#24765f] px-5 text-sm font-bold text-white hover:bg-[#195b48] disabled:opacity-60"
                      type="button"
                      disabled={saving}
                      onClick={() => void completeSave(true)}
                    >
                      {saving ? 'Submitting...' : 'Submit Inquiry'}
                    </button>
                  </>
                ) : null}
                {workflowError && (
                  <p className="m-0 w-full text-sm text-[#8b3c2c]" role="alert">
                    {workflowError}
                  </p>
                )}
              </div>
            </form>
          )}
        </section>
      </main>

      {editingItemRowId !== null &&
        !isReadOnly &&
        (() => {
          const row = rows.find((item) => item.rowId === editingItemRowId);
          if (!row) return null;
          return (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#10251f]/45 p-4"
              onClick={() => {
                setEditingItemRowId(null);
                closeItemDropdown();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setEditingItemRowId(null);
                  closeItemDropdown();
                }
              }}
            >
              <section
                className="my-auto w-full max-w-3xl rounded-2xl border border-[#e3eae6] bg-white p-5 shadow-2xl sm:p-6"
                role="dialog"
                aria-modal="true"
                aria-labelledby="requested-item-editor-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2
                      className="m-0 text-lg font-extrabold text-[#14332b]"
                      id="requested-item-editor-title"
                    >
                      Edit Requested Item
                    </h2>
                    <p className="mb-0 mt-1 text-sm text-[#6d7d77]">
                      Update all fields for this item row.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e3eae6] bg-white text-xl text-[#344a42] hover:bg-[#f3f8f5]"
                    type="button"
                    aria-label="Close item editor"
                    onClick={() => {
                      setEditingItemRowId(null);
                      closeItemDropdown();
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Item *" className="sm:col-span-2">
                    <button
                      className={`${inputClass} flex items-center justify-between text-left`}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={itemDropdown?.rowId === row.rowId}
                      onClick={(event) => openItemDropdown(row.rowId, event.currentTarget)}
                    >
                      <span className="truncate">
                        {row.item_code ? row.item_description || row.item_code : 'Select item...'}
                      </span>
                      <span
                        className="ml-3 border-x-[5px] border-x-transparent border-t-[6px] border-t-current"
                        aria-hidden="true"
                      />
                    </button>
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <input
                      className={inputClass}
                      value={row.item_description}
                      onChange={(event) =>
                        setRowField(row.rowId, 'item_description', event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Qty *">
                    <input
                      className={inputClass}
                      type="number"
                      min="0.001"
                      step="any"
                      value={row.qty}
                      onChange={(event) => setRowField(row.rowId, 'qty', event.target.value)}
                    />
                  </Field>
                  <Field label="UOM">
                    <select
                      className={inputClass}
                      value={row.uom}
                      onChange={(event) => setRowField(row.rowId, 'uom', event.target.value)}
                    >
                      <option value="">Select UOM...</option>
                      {options?.uoms.map((uom) => (
                        <option key={uom.name} value={uom.name}>
                          {uom.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Container No">
                    <input
                      className={inputClass}
                      value={row.container_no}
                      onChange={(event) =>
                        setRowField(row.rowId, 'container_no', event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Target Price">
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="any"
                      value={row.target_price}
                      onChange={(event) =>
                        setRowField(row.rowId, 'target_price', event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Preferred Brand">
                    <select
                      className={inputClass}
                      value={row.preferred_brand}
                      onChange={(event) =>
                        setRowField(row.rowId, 'preferred_brand', event.target.value)
                      }
                    >
                      <option value="">Select brand...</option>
                      {options?.brands.map((brand) => (
                        <option key={brand.name} value={brand.name}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Shipment Load">
                    <select
                      className={inputClass}
                      value={row.shipment_load}
                      onChange={(event) =>
                        setRowField(row.rowId, 'shipment_load', event.target.value)
                      }
                    >
                      <option value="">Select shipment load...</option>
                      {optionValues(options, 'shipment_load', true).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Remarks" className="sm:col-span-2">
                    <textarea
                      className={`${inputClass} min-h-24 resize-y py-2`}
                      value={row.remarks}
                      onChange={(event) => setRowField(row.rowId, 'remarks', event.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    className="rounded-xl bg-[#24765f] px-5 py-2 text-sm font-bold text-white hover:bg-[#195b48]"
                    type="button"
                    onClick={() => {
                      setEditingItemRowId(null);
                      closeItemDropdown();
                    }}
                  >
                    Done
                  </button>
                </div>
              </section>
            </div>
          );
        })()}

      {itemDropdown &&
        createPortal(
          <div
            className="fixed z-[60] overflow-hidden rounded-xl border border-[#d6e0da] bg-white shadow-xl"
            style={{
              top: itemDropdown.top,
              left: itemDropdown.left,
              width: itemDropdown.width,
              maxWidth: 'calc(100vw - 16px)',
            }}
            role="region"
            aria-label="Item search"
          >
            <input
              className="w-full border-0 border-b border-[#d6e0da] bg-white px-3 py-2 text-sm outline-none"
              type="search"
              autoFocus
              placeholder="Search items by name, code, or group"
              aria-label="Search items"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
            />
            <div className="max-h-64 overflow-y-auto" role="listbox" aria-label="Item options">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <button
                    className="block w-full border-0 bg-white px-3 py-2 text-left text-sm hover:bg-[#f3f8f5]"
                    key={item.item_code}
                    type="button"
                    role="option"
                    aria-selected={
                      rows.find((row) => row.rowId === itemDropdown.rowId)?.item_code ===
                      item.item_code
                    }
                    onClick={() => selectItem(item)}
                  >
                    <span className="block font-semibold text-[#14332b]">
                      {item.item_name || item.item_code}
                    </span>
                    <span className="block text-xs text-[#6d7d77]">
                      {item.item_code}
                      {item.item_group ? ` · ${item.item_group}` : ''}
                    </span>
                  </button>
                ))
              ) : (
                <p className="m-0 px-3 py-3 text-sm text-[#6d7d77]" role="status">
                  No matching items.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-[#6d7d77]">{label}</dt>
      <dd className="m-0 break-words text-[#344a42]">{value || '—'}</dd>
    </div>
  );
}

export default CustomerInquiryFormPage;
