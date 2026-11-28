import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type {
  AddressOption,
  CompanyOption,
  CustomerOption,
  EmployeeOption,
  IncotermOption,
  ItemOption,
  AssignmentUserGroupOption,
  AssignmentUserOption,
  PartyDetails,
  PaymentTermOption,
  SalesOrderRecord,
  SellingPriceListOption,
  WorkflowTransition,
} from './models';
import {
  applyWorkflow,
  assignSalesOrder,
  attachSalesOrderFile,
  deleteSalesOrder,
  emailSalesOrderAssignment,
  getAssignmentOptions,
  getCustomerDetails,
  getDefaultOutgoingEmailSender,
  getItemPrices,
  getItemUoms,
  getLinkedStatusMap,
  getSalesOrderAttachments,
  getSalesOrder,
  getUserGroupMembers,
  getExchangeRate,
  getWorkflowTransitions,
  loadOptions,
  saveSalesOrder,
  searchCustomers,
  submitSalesOrder,
} from './salesOrderApi';
import { calculatePaymentDueDate } from './paymentTermDate';

interface Row {
  productName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const completeParty = (party: Partial<PartyDetails>, name = ''): PartyDetails => ({
  name: party.name ?? name,
  companyName: party.companyName ?? '',
  postalAddress: party.postalAddress ?? '',
  phoneNo: party.phoneNo ?? '',
  faxNo: party.faxNo ?? '',
  email: party.email ?? '',
  ntn: party.ntn ?? '',
});
function getDuplicateAssignmentMessage(rawMessages: unknown): string {
  let messages: unknown[];
  if (Array.isArray(rawMessages)) {
    messages = rawMessages;
  } else if (typeof rawMessages === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawMessages);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      messages = [rawMessages];
    }
  } else {
    return '';
  }
  for (const entry of messages) {
    let message = '';
    if (typeof entry === 'string') {
      try {
        const parsed: unknown = JSON.parse(entry);
        if (
          parsed &&
          typeof parsed === 'object' &&
          'message' in parsed &&
          typeof parsed.message === 'string'
        )
          message = parsed.message;
      } catch {
        message = entry;
      }
    } else if (
      entry &&
      typeof entry === 'object' &&
      'message' in entry &&
      typeof entry.message === 'string'
    ) {
      message = entry.message;
    }
    if (message.includes('Already in the following Users ToDo list')) {
      return message
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:li|p|div)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*/g, '\n')
        .trim();
    }
  }
  return '';
}

export default function SalesOrderFormPage() {
  const { name } = useParams();
  const existingName = name && name !== 'new' ? decodeURIComponent(name) : '';
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]),
    [canChangeCompany, setCanChangeCompany] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]),
    [items, setItems] = useState<ItemOption[]>([]);
  const [terms, setTerms] = useState<PaymentTermOption[]>([]),
    [priceLists, setPriceLists] = useState<SellingPriceListOption[]>([]);
  const [incoterms, setIncoterms] = useState<IncotermOption[]>([]);
  const [customer, setCustomer] = useState(''),
    [customerLabel, setCustomerLabel] = useState('');
  const [customerSearch, setCustomerSearch] = useState(''),
    [customerOpen, setCustomerOpen] = useState(false),
    [customerSearchLoading, setCustomerSearchLoading] = useState(false),
    [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [billAddresses, setBillAddresses] = useState<AddressOption[]>([]),
    [shipAddresses, setShipAddresses] = useState<AddressOption[]>([]);
  const [billAddress, setBillAddress] = useState(''),
    [shipAddress, setShipAddress] = useState('');
  const [emails, setEmails] = useState<string[]>([]),
    [billEmail, setBillEmail] = useState('');
  const [bill, setBill] = useState<PartyDetails>({
    name: '',
    companyName: '',
    postalAddress: '',
    phoneNo: '',
    faxNo: '',
    email: '',
    ntn: '',
  });
  const [ship, setShip] = useState<PartyDetails>({
    name: '',
    companyName: '',
    postalAddress: '',
    phoneNo: '',
    faxNo: '',
    email: '',
    ntn: '',
  });
  const [company, setCompany] = useState(''),
    [salesRep, setSalesRep] = useState(''),
    [priceList, setPriceList] = useState('');
  const [date, setDate] = useState(today()),
    [deliveryDate, setDeliveryDate] = useState(today()),
    [dueDate, setDueDate] = useState(today());
  const [paymentTerm, setPaymentTerm] = useState(''),
    [incoterm, setIncoterm] = useState(''),
    [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { productName: '', quantity: '', unit: '', unitPrice: '' },
  ]);
  const [uoms, setUoms] = useState<Record<number, string[]>>({});
  const [taxes, setTaxes] = useState<SalesOrderRecord['taxes']>([]);
  const [docstatus, setDocstatus] = useState(0),
    [transitions, setTransitions] = useState<WorkflowTransition[]>([]),
    [loaded, setLoaded] = useState<SalesOrderRecord | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false),
    [assignmentText, setAssignmentText] = useState(''),
    [assignmentUsers, setAssignmentUsers] = useState<AssignmentUserOption[]>([]),
    [assignmentGroups, setAssignmentGroups] = useState<AssignmentUserGroupOption[]>([]),
    [assignmentGroup, setAssignmentGroup] = useState(''),
    [groupAssignedUsers, setGroupAssignedUsers] = useState<string[]>([]),
    [selectedAssignees, setSelectedAssignees] = useState<string[]>([]),
    [assignmentDate, setAssignmentDate] = useState(''),
    [assignmentPriority, setAssignmentPriority] = useState<'Low' | 'Medium' | 'High'>('Medium'),
    [assignmentFiles, setAssignmentFiles] = useState<File[]>([]),
    [assignmentLoading, setAssignmentLoading] = useState(false),
    [assignmentSaving, setAssignmentSaving] = useState(false);
  const [linkedStatuses, setLinkedStatuses] = useState<{
    deliveryNotes: string;
    invoices: string;
  } | null>(null);
  const readOnly = docstatus !== 0;
  const total = money(
    rows.reduce((sum, r) => sum + (Number(r.quantity || 0) * Number(r.unitPrice || 0) || 0), 0),
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const o = await loadOptions(currentUser ?? '');
        if (!active) return;
        setCompanies(o.companies);
        setCanChangeCompany(o.canChangeCompany);
        setEmployees(o.employees);
        setItems(o.items);
        setTerms(o.paymentTerms);
        setPriceLists(o.priceLists);
        setIncoterms(o.incoterms);
        if (o.companies.length === 1) {
          setCompany(o.companies[0].name);
          const pl =
            o.priceLists.find(
              (p) =>
                p.currency === o.companies[0].default_currency &&
                p.name.toLowerCase() === 'standard selling',
            ) || o.priceLists.find((p) => p.currency === o.companies[0].default_currency);
          if (pl) setPriceList(pl.name);
        }
        const rep = o.employees.find(
          (e) => e.user_id?.toLowerCase() === currentUser?.toLowerCase(),
        );
        if (rep && !existingName) setSalesRep(rep.name);
        if (existingName) {
          setLoading(true);
          const order = await getSalesOrder(existingName);
          if (!active) return;
          setLoaded(order);
          setDocstatus(order.docstatus);
          setCustomer(order.customer);
          setCustomerLabel(order.customer_name || order.customer);
          setCompany(order.company);
          setPriceList(order.selling_price_list);
          setSalesRep(typeof order.custom_rep === 'string' ? order.custom_rep : '');
          setDate(order.transaction_date);
          setDeliveryDate(order.delivery_date || today());
          setPaymentTerm(order.payment_terms_template || '');
          setDueDate(order.payment_schedule?.[0]?.due_date || today());
          setIncoterm(order.incoterm || '');
          setRemarks(order.terms || '');
          setBillAddress(order.customer_address || '');
          setShipAddress(order.shipping_address_name || '');
          setBillEmail(order.contact_email || '');
          setTaxes(order.taxes ?? []);
          setRows(
            (order.items ?? []).length
              ? order.items.map((i) => ({
                  productName: i.item_name || i.item_code,
                  quantity: String(i.qty),
                  unit: i.uom || i.stock_uom || '',
                  unitPrice: String(i.rate),
                }))
              : [{ productName: '', quantity: '', unit: '', unitPrice: '' }],
          );
          const customerDetails = await getCustomerDetails(order.customer);
          if (!active) return;
          setBillAddresses(customerDetails.billToAddresses);
          setShipAddresses(customerDetails.shipToAddresses);
          setEmails(customerDetails.emails);
          setBill(
            completeParty(
              {
                ...customerDetails.billTo,
                phoneNo: order.contact_mobile || '',
                email: order.contact_email || '',
              },
              order.customer_name || order.customer,
            ),
          );
          setShip(completeParty(customerDetails.shipTo, customerDetails.displayName));
          const transitions = await getWorkflowTransitions(order);
          if (active) setTransitions(transitions);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load Sales Order.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [existingName, currentUser]);

  useEffect(() => {
    if (!customerOpen) return;
    let active = true;
    setCustomerSearchLoading(true);
    const id = window.setTimeout(() => {
      searchCustomers(customerSearch.trim())
        .then((options) => {
          if (active) setCustomerOptions(options);
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : 'Could not search customers.');
        })
        .finally(() => {
          if (active) setCustomerSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [customerSearch, customerOpen]);

  useEffect(() => {
    if (!loaded?.name) return;
    let active = true;
    getLinkedStatusMap([loaded.name])
      .then((statuses) => {
        if (!active) return;
        const status = statuses[loaded.name];
        setLinkedStatuses(
          status
            ? { deliveryNotes: status.deliveryNoteStatus, invoices: status.salesInvoiceStatus }
            : { deliveryNotes: '—', invoices: '—' },
        );
      })
      .catch((e) => {
        if (active) {
          setError(
            `Could not load linked document statuses: ${e instanceof Error ? e.message : 'Unknown error'}`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loaded?.name, loaded?.modified]);

  async function chooseCustomer(c: CustomerOption) {
    setCustomer(c.docName);
    setCustomerLabel(c.displayName);
    setCustomerSearch('');
    setCustomerOpen(false);
    setError('');
    try {
      const d = await getCustomerDetails(c.docName);
      setBillAddresses(d.billToAddresses);
      setShipAddresses(d.shipToAddresses);
      setEmails(d.emails);
      setBill(completeParty(d.billTo, d.displayName));
      setShip(completeParty(d.shipTo, d.displayName));
      setBillAddress(d.billToAddresses[0]?.docName ?? '');
      setShipAddress(d.shipToAddresses[0]?.docName ?? '');
      const email = d.emails[0] ?? '';
      setBillEmail(email);
      setBill((previous) => ({ ...previous, email }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load customer details.');
    }
  }

  async function updateRow(index: number, patch: Partial<Row>, loadPrice = false) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRows(next);
    if (patch.productName !== undefined) {
      const item = items.find(
        (i) =>
          i.item_code.toLowerCase() === (patch.productName || '').trim().toLowerCase() ||
          i.item_name.toLowerCase() === (patch.productName || '').trim().toLowerCase(),
      );
      if (item) {
        const us = await getItemUoms(item.item_code).catch(() => [item.stock_uom]);
        setUoms((s) => ({ ...s, [index]: [...new Set([item.stock_uom, ...us].filter(Boolean))] }));
        if (!next[index].unit)
          setRows((r) => r.map((x, i) => (i === index ? { ...x, unit: item.stock_uom } : x)));
      }
    }
    if (loadPrice && priceList) {
      const item = items.find(
        (i) =>
          i.item_code.toLowerCase() === (next[index].productName || '').trim().toLowerCase() ||
          i.item_name.toLowerCase() === (next[index].productName || '').trim().toLowerCase(),
      );
      if (item)
        try {
          const prices = await getItemPrices(item.item_code, priceList);
          const valid = prices
            .filter(
              (p) =>
                (!p.valid_from || p.valid_from <= date) && (!p.valid_upto || p.valid_upto >= date),
            )
            .sort((a, b) => (b.valid_from || '').localeCompare(a.valid_from || ''))[0];
          if (valid)
            setRows((r) =>
              r.map((x, i) =>
                i === index ? { ...x, unitPrice: String(valid.price_list_rate) } : x,
              ),
            );
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load item price.');
        }
    }
  }
  function selectAddress(kind: 'bill' | 'ship', docName: string) {
    const address = (kind === 'bill' ? billAddresses : shipAddresses).find(
      (a) => a.docName === docName,
    );
    if (!address) return;
    if (kind === 'bill') {
      setBillAddress(docName);
      setBill(completeParty(address.details));
      setBillEmail(address.details.email);
    } else {
      setShipAddress(docName);
      setShip(completeParty(address.details));
    }
  }
  function calculatePaymentTerm(termName: string, invoiceDate = date) {
    setPaymentTerm(termName);
    const term = terms.find((t) => t.name === termName);
    if (term) setDueDate(calculatePaymentDueDate(invoiceDate, term));
  }

  async function persist(submit = false) {
    if (saving || loading) return;
    if (readOnly) {
      setError('This Sales Order is submitted or cancelled and cannot be updated.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!customer || !company || !paymentTerm) {
        throw new Error('Customer, company, and payment terms are required.');
      }
      if (!date || !deliveryDate) throw new Error('Order date and delivery date are required.');
      const validRows = rows.filter((r) => r.productName.trim() || r.quantity || r.unitPrice);
      const payloadItems = validRows.map((r) => {
        const item = items.find(
          (i) =>
            i.item_code.toLowerCase() === r.productName.trim().toLowerCase() ||
            i.item_name.toLowerCase() === r.productName.trim().toLowerCase(),
        );
        if (!item) throw new Error(`Unknown product: ${r.productName}`);
        const qty = Number(r.quantity);
        const rate = Number(r.unitPrice);
        if (
          !r.unitPrice.trim() ||
          !Number.isFinite(qty) ||
          qty <= 0 ||
          !Number.isFinite(rate) ||
          rate < 0
        ) {
          throw new Error('Enter valid quantity and unit price for every item.');
        }
        const savedWarehouse = loaded?.items?.find(
          (savedItem) => savedItem.item_code === item.item_code,
        )?.warehouse;
        return {
          item_code: item.item_code,
          item_name: item.item_name,
          qty,
          uom: r.unit || item.stock_uom,
          stock_uom: item.stock_uom,
          warehouse:
            savedWarehouse ||
            companies.find((c) => c.name === company)?.default_warehouse ||
            undefined,
          rate,
        };
      });
      if (!payloadItems.length) throw new Error('Add at least one valid item.');
      const pl = priceLists.find((p) => p.name === priceList);
      if (!pl) throw new Error('The selected price list is not available.');
      const companyCurrency = companies.find((c) => c.name === company)?.default_currency;
      if (!companyCurrency)
        throw new Error('The selected company currency could not be determined.');
      const savedCurrencySettings =
        loaded?.company === company && loaded.selling_price_list === pl.name ? loaded : null;
      const priceListConversionRate = savedCurrencySettings
        ? savedCurrencySettings.plc_conversion_rate
        : await getExchangeRate(pl.currency, companyCurrency, date);
      const selectedTerm = terms.find((term) => term.name === paymentTerm);
      const paymentSchedule = selectedTerm
        ? loaded?.payment_terms_template === selectedTerm.name && loaded.payment_schedule?.length
          ? loaded.payment_schedule.map((payment, index) =>
              index === 0
                ? {
                    ...payment,
                    payment_term: selectedTerm.name,
                    due_date: dueDate || calculatePaymentDueDate(date, selectedTerm),
                    credit_days: selectedTerm.credit_days ?? 0,
                    credit_months: selectedTerm.credit_months ?? 0,
                  }
                : { ...payment },
            )
          : [
              {
                payment_term: selectedTerm.name,
                due_date: dueDate || calculatePaymentDueDate(date, selectedTerm),
                invoice_portion: 100,
                credit_days: selectedTerm.credit_days ?? 0,
                credit_months: selectedTerm.credit_months ?? 0,
              },
            ]
        : loaded?.payment_schedule;
      const payload: Partial<SalesOrderRecord> = {
        customer,
        customer_name: customerLabel,
        company,
        order_type: loaded?.order_type || 'Sales',
        set_warehouse: companies.find((c) => c.name === company)?.default_warehouse || undefined,
        transaction_date: date,
        delivery_date: deliveryDate,
        currency: savedCurrencySettings?.currency ?? companyCurrency,
        conversion_rate: savedCurrencySettings?.conversion_rate ?? 1,
        selling_price_list: pl.name,
        price_list_currency: savedCurrencySettings?.price_list_currency ?? pl.currency,
        plc_conversion_rate: priceListConversionRate,
        custom_rep: salesRep || undefined,
        payment_terms_template: paymentTerm || undefined,
        incoterm: incoterm || undefined,
        terms: remarks,
        customer_address: billAddress || undefined,
        shipping_address_name: shipAddress || undefined,
        contact_mobile: bill.phoneNo || undefined,
        contact_email: bill.email || billEmail || undefined,
        payment_schedule: paymentSchedule,
        items: payloadItems as SalesOrderRecord['items'],
      };
      let saved = await saveSalesOrder(payload, existingName || undefined);
      if (submit) saved = await submitSalesOrder(saved);
      saved = await getSalesOrder(saved.name);
      setLoaded(saved);
      setDocstatus(saved.docstatus);
      setCustomerLabel(saved.customer_name || saved.customer);
      setTaxes(saved.taxes ?? []);
      setRows(
        saved.items.map((i) => ({
          productName: i.item_name || i.item_code,
          quantity: String(i.qty),
          unit: i.uom || i.stock_uom || '',
          unitPrice: String(i.rate),
        })),
      );
      navigate(`/sales-order/${encodeURIComponent(saved.name)}`, { replace: true });
      setMessage(
        submit
          ? `Sales Order ${saved.name} submitted successfully.`
          : `Sales Order ${saved.name} saved successfully.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save Sales Order.');
    } finally {
      setSaving(false);
    }
  }
  async function removeOrder() {
    if (!existingName || !window.confirm(`Delete Sales Order ${existingName}?`)) return;
    setSaving(true);
    try {
      await deleteSalesOrder(existingName);
      navigate('/sales-orders', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete Sales Order.');
    } finally {
      setSaving(false);
    }
  }
  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  const filteredPriceLists = useMemo(() => {
    const companyCurrency = companies.find((c) => c.name === company)?.default_currency;
    const matching = priceLists.filter((p) => p.currency === companyCurrency);
    const selected = priceLists.find((p) => p.name === priceList);
    return selected && !matching.some((p) => p.name === selected.name)
      ? [...matching, selected]
      : matching;
  }, [priceLists, company, companies, priceList]);
  async function applyTransition(t: WorkflowTransition) {
    if (!loaded) return;
    setSaving(true);
    setError('');
    try {
      const saved = await applyWorkflow(loaded, t.action);
      setLoaded(saved);
      setDocstatus(saved.docstatus);
      setTransitions(await getWorkflowTransitions(saved));
      setMessage(`Sales Order ${saved.name}: ${t.action} completed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply workflow action.');
    } finally {
      setSaving(false);
    }
  }

  async function openAssignmentDialog() {
    if (!existingName) return;
    setAssignmentLoading(true);
    setError('');
    try {
      const [options, files] = await Promise.all([
        getAssignmentOptions(),
        getSalesOrderAttachments(existingName),
      ]);
      setAssignmentUsers(options.users);
      setAssignmentGroups(options.userGroups);
      setAssignmentFiles([]);
      setAssignmentText('');
      setSelectedAssignees([]);
      setGroupAssignedUsers([]);
      setAssignmentGroup('');
      setAssignmentDate('');
      setAssignmentPriority('Medium');
      setAssignmentOpen(true);
      if (files.length)
        setMessage(
          `${files.length} existing attachment(s) will be included in the assignment email.`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load assignment options.');
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function updateAssignmentGroup(groupName: string) {
    setAssignmentGroup(groupName);
    try {
      const members = groupName ? await getUserGroupMembers(groupName) : [];
      setSelectedAssignees((current) => [
        ...new Set([...current.filter((user) => !groupAssignedUsers.includes(user)), ...members]),
      ]);
      setGroupAssignedUsers(members);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load user group members.');
    }
  }

  async function submitAssignment() {
    if (!existingName || assignmentSaving) return;
    const selectedUsers = selectedAssignees.map((userName) =>
      assignmentUsers.find((user) => user.name === userName),
    );
    if (!selectedAssignees.length || selectedUsers.some((user) => !user)) {
      setError('Select at least one valid assignee.');
      return;
    }
    setAssignmentSaving(true);
    setError('');
    try {
      const orderFiles = await getSalesOrderAttachments(existingName);
      const hasAttachments = orderFiles.length > 0 || assignmentFiles.length > 0;
      const recipients = selectedUsers.flatMap((user) =>
        user?.email?.trim() ? [user.email.trim()] : [],
      );
      if (hasAttachments && recipients.length !== selectedUsers.length) {
        const missingEmailUsers = selectedUsers
          .filter((user) => !user?.email?.trim())
          .map((user) => user?.full_name || user?.name || 'Unknown user');
        throw new Error(`Add an email address in Frappe for: ${missingEmailUsers.join(', ')}.`);
      }

      let sender = '';
      if (hasAttachments) sender = await getDefaultOutgoingEmailSender();
      const uploadedFiles: Array<{ name: string }> = [];
      for (const file of assignmentFiles) {
        try {
          uploadedFiles.push(await attachSalesOrderFile(existingName, file));
        } catch (e) {
          throw new Error(
            `Could not upload "${file.name}": ${e instanceof Error ? e.message : 'Unknown error'}${uploadedFiles.length ? ' Earlier files may already be attached to the Sales Order.' : ''}`,
          );
        }
      }

      const assignmentResponse = await assignSalesOrder(existingName, {
        assignTo: selectedAssignees,
        date: assignmentDate,
        priority: assignmentPriority,
        description: assignmentText.trim(),
      }).catch((e: unknown) => {
        throw new Error(
          hasAttachments
            ? `Files are attached to the Sales Order, but the assignment could not be created: ${e instanceof Error ? e.message : 'Unknown error'}`
            : `Could not assign Sales Order: ${e instanceof Error ? e.message : 'Unknown error'}`,
        );
      });
      const duplicateMessage = getDuplicateAssignmentMessage(assignmentResponse._server_messages);
      if (duplicateMessage) {
        throw new Error(
          `${duplicateMessage}${hasAttachments ? ' The Sales Order attachments were not emailed.' : ''}`,
        );
      }
      if (hasAttachments) {
        const attachmentNames = [
          ...new Set([
            ...orderFiles.map((file) => file.name),
            ...uploadedFiles.map((file) => file.name),
          ]),
        ];
        try {
          await emailSalesOrderAssignment(
            existingName,
            sender,
            recipients,
            attachmentNames,
            assignmentText.trim(),
          );
        } catch (e) {
          throw new Error(
            `The assignment was created, but the email could not be queued: ${e instanceof Error ? e.message : 'Unknown error'}`,
          );
        }
      }
      setAssignmentOpen(false);
      setAssignmentFiles([]);
      setMessage(
        `Sales Order ${existingName} assigned successfully${hasAttachments ? '; email with attachments queued for assignees.' : '.'}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign Sales Order.');
    } finally {
      setAssignmentSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#1c2b26]">
      <header className="relative flex min-h-[72px] items-center justify-between border-b border-[#e3eae6] bg-white px-[clamp(20px,5vw,76px)] max-[580px]:px-4">
        <Link to="/home" className="inline-flex items-center gap-3 no-underline text-[#14332b]">
          <span className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-gradient-to-br from-[#2d8a70] to-[#14332b] text-sm font-extrabold text-white">
            AV
          </span>
          <span>
            <strong className="block text-[18px]">AGROVISIONS</strong>
            <small className="block text-xs text-[#6d7d77]">Sales Order Management</small>
          </span>
        </Link>
        <div className="flex gap-3">
          <span className="text-sm font-semibold max-[580px]:hidden">{currentUser}</span>
          <Link
            to="/home"
            className="rounded-lg border px-3 py-1 text-sm font-bold text-[#24765f] no-underline"
          >
            Home
          </Link>
          <button
            className="rounded-lg border px-3 py-1 text-sm font-bold text-[#a34539]"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <section className="bg-gradient-to-r from-[#14332b] to-[#24765f] px-[clamp(20px,5vw,76px)] pb-[76px] pt-7 text-white">
        <div className="mx-auto max-w-[1440px]">
          <p className="text-[13px] text-white/75">
            Sales Orders › {existingName ? 'Details' : 'New'}
          </p>
          <h1 className="mb-0 mt-2 text-[36px] font-extrabold">
            {existingName ? 'Sales Order Details' : 'New Sales Order'}
          </h1>
        </div>
      </section>
      <main className="px-4 pb-8">
        <section className="mx-auto -mt-12 max-w-[1440px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3eae6] bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => navigate('/sales-orders')}
              className="rounded-[10px] border px-3 py-2 text-sm font-semibold"
            >
              ← Back to Sales Orders
            </button>
            <div className="flex flex-wrap gap-2">
              {existingName && (
                <button
                  type="button"
                  disabled={assignmentLoading}
                  onClick={() => void openAssignmentDialog()}
                  className="rounded-[10px] border px-4 py-2 text-sm font-semibold"
                >
                  {assignmentLoading ? 'Loading...' : 'Assign'}
                </button>
              )}
              <Link
                to="/sales-order/new"
                className="rounded-[10px] border px-4 py-2 text-sm font-bold text-[#24765f] no-underline"
              >
                New Order
              </Link>
            </div>
          </div>
          {existingName && loaded && (
            <section className="mb-5 grid gap-3 rounded-2xl border border-[#e3eae6] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-xs font-bold uppercase text-[#6d7d77]">Sales Order</span>
                <p className="mt-1 font-semibold">
                  {loaded.status ||
                    loaded.workflow_state ||
                    (docstatus === 1 ? 'Submitted' : 'Draft')}
                </p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase text-[#6d7d77]">Delivery Notes</span>
                <p className="mt-1 font-semibold">
                  {linkedStatuses?.deliveryNotes ?? 'Loading...'}
                </p>
              </div>
              <div>
                <span className="text-xs font-bold uppercase text-[#6d7d77]">Sales Invoices</span>
                <p className="mt-1 font-semibold">{linkedStatuses?.invoices ?? 'Loading...'}</p>
              </div>
            </section>
          )}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void persist(false);
            }}
            className="grid gap-5"
          >
            {error && (
              <p
                className="rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-sm text-[#8b3c2c]"
                role="alert"
              >
                {error}
              </p>
            )}
            {message && (
              <p
                className="rounded-xl border border-[#cadbc4] bg-[#f3f8ef] px-3 py-2 text-sm text-[#355224]"
                role="status"
              >
                {message}
              </p>
            )}
            <section className="rounded-2xl border border-[#e3eae6] bg-white p-5">
              <h2 className="mb-4 border-b pb-3 text-lg font-bold">Order Information</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="relative grid gap-2 text-xs font-bold uppercase text-[#53645d]">
                  Customer
                  <button
                    type="button"
                    disabled={readOnly || loading}
                    onClick={() => setCustomerOpen((v) => !v)}
                    className="min-h-11 rounded-[10px] border border-[#dfe7e3] px-3 text-left text-sm normal-case text-[#1c2b26]"
                  >
                    {customerLabel || 'Select customer...'}
                  </button>
                  {customerOpen && (
                    <div className="absolute z-20 top-[74px] w-full rounded-xl border bg-white p-2 shadow-lg">
                      <input
                        autoFocus
                        className="mb-2 h-10 w-full rounded border px-2 normal-case"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search customers"
                      />
                      {customerOptions.map((c) =>
                        !customer || c.docName !== customer ? (
                          <button
                            type="button"
                            key={c.docName}
                            onClick={() => void chooseCustomer(c)}
                            className="block w-full rounded px-2 py-2 text-left normal-case hover:bg-[#eef6f2]"
                          >
                            {c.displayName} <small className="text-[#81928a]">{c.docName}</small>
                          </button>
                        ) : null,
                      )}
                      {customerSearchLoading && (
                        <p className="p-2 normal-case">Searching customers...</p>
                      )}
                      {!customerSearchLoading && !customerOptions.length && (
                        <p className="p-2 normal-case">No customers found.</p>
                      )}
                    </div>
                  )}
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase text-[#53645d]">
                  Sales Representative
                  <select
                    disabled={readOnly}
                    className="min-h-11 rounded-[10px] border px-3 text-sm normal-case"
                    value={salesRep}
                    onChange={(e) => setSalesRep(e.target.value)}
                  >
                    <option value="">Select employee...</option>
                    {employees.map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.employee_name || e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase text-[#53645d]">
                  Order Date
                  <input
                    disabled={readOnly}
                    type="date"
                    className="min-h-11 rounded-[10px] border px-3 text-sm normal-case"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (paymentTerm) calculatePaymentTerm(paymentTerm, e.target.value);
                    }}
                  />
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase text-[#53645d]">
                  Company
                  <select
                    disabled={readOnly || !canChangeCompany}
                    className="min-h-11 rounded-[10px] border px-3 text-sm normal-case"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  >
                    <option value="">Select company...</option>
                    {companies.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold uppercase text-[#53645d] md:col-span-2">
                  Selling Price List
                  <select
                    disabled={readOnly}
                    className="min-h-11 rounded-[10px] border px-3 text-sm normal-case"
                    value={priceList}
                    onChange={(e) => setPriceList(e.target.value)}
                  >
                    <option value="">Select price list...</option>
                    {filteredPriceLists.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <div className="grid gap-5 lg:grid-cols-2">
              {(['Bill To', 'Ship To'] as const).map((label, kind) => (
                <section key={label} className="rounded-2xl border border-[#e3eae6] bg-white p-5">
                  <h2 className="mb-4 border-b pb-3 text-lg font-bold">{label}</h2>
                  <div className="grid gap-3">
                    <select
                      disabled={readOnly}
                      className="min-h-11 rounded border px-3"
                      value={kind === 0 ? billAddress : shipAddress}
                      onChange={(e) => selectAddress(kind === 0 ? 'bill' : 'ship', e.target.value)}
                    >
                      <option value="">Select address...</option>
                      {(kind === 0 ? billAddresses : shipAddresses).map((a) => (
                        <option key={a.docName} value={a.docName}>
                          {a.label}
                          {a.isPrimary ? ' (Primary)' : ''}
                          {a.isShipping ? ' (Shipping)' : ''}
                        </option>
                      ))}
                    </select>
                    {kind === 0 && (
                      <label className="grid gap-1 text-xs font-bold uppercase text-[#53645d]">
                        Contact Email
                        <select
                          disabled={readOnly}
                          className="min-h-10 rounded border px-3 text-sm normal-case"
                          value={billEmail || bill.email}
                          onChange={(e) => {
                            setBillEmail(e.target.value);
                            setBill((previous) => ({ ...previous, email: e.target.value }));
                          }}
                        >
                          <option value="">Select contact email...</option>
                          {[...new Set([bill.email, ...emails].filter(Boolean))].map((email) => (
                            <option key={email} value={email}>
                              {email}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {Object.entries(kind === 0 ? bill : ship).map(([key, value]) => (
                      <label
                        key={key}
                        className="grid gap-1 text-xs font-bold uppercase text-[#53645d]"
                      >
                        {key.replace(/([A-Z])/g, ' $1')}
                        <input
                          readOnly
                          className="min-h-10 rounded border bg-[#fbfdfc] px-3 text-sm normal-case"
                          value={String(value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <section className="rounded-2xl border border-[#e3eae6] bg-white p-5">
              <h2 className="mb-4 border-b pb-3 text-lg font-bold">Dates &amp; Terms</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-2 text-xs font-bold">
                  Delivery Date
                  <input
                    disabled={readOnly}
                    type="date"
                    className="min-h-11 rounded border px-3"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  Due Date
                  <input
                    disabled={readOnly}
                    type="date"
                    className="min-h-11 rounded border px-3"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  Payment Terms *
                  <select
                    required
                    disabled={readOnly}
                    className="min-h-11 rounded border px-3"
                    value={paymentTerm}
                    onChange={(e) => calculatePaymentTerm(e.target.value)}
                  >
                    <option value="">Select payment term...</option>
                    {terms.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.payment_term_name || t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  Incoterm
                  <select
                    disabled={readOnly}
                    className="min-h-11 rounded border px-3"
                    value={incoterm}
                    onChange={(e) => setIncoterm(e.target.value)}
                  >
                    <option value="">Select Incoterm...</option>
                    {incoterms.map((i) => (
                      <option key={i.name} value={i.name}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-[#e3eae6] bg-white p-5">
              <h2 className="mb-4 border-b pb-3 text-lg font-bold">Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed">
                  <thead>
                    <tr className="text-xs">
                      <th className="w-[34%]">Product Name</th>
                      <th className="w-[16%]">Quantity</th>
                      <th className="w-[16%]">Unit</th>
                      <th className="w-[16%]">Unit Price</th>
                      <th className="w-[18%]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td>
                          <input
                            list="sales-order-items"
                            disabled={readOnly}
                            className="h-11 w-full px-2"
                            value={r.productName}
                            onChange={(e) =>
                              void updateRow(i, { productName: e.target.value }, true)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={readOnly}
                            className="h-11 w-full px-2"
                            value={r.quantity}
                            onChange={(e) => updateRow(i, { quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            disabled={readOnly}
                            className="h-11 w-full px-2"
                            value={r.unit}
                            onChange={(e) => updateRow(i, { unit: e.target.value }, true)}
                          >
                            <option value="">Select unit...</option>
                            {(uoms[i] ?? (r.unit ? [r.unit] : [])).map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={readOnly}
                            className="h-11 w-full px-2"
                            value={r.unitPrice}
                            onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                          />
                        </td>
                        <td>
                          <div className="flex">
                            <input
                              readOnly
                              className="h-11 min-w-0 flex-1 px-2"
                              value={
                                r.quantity && r.unitPrice
                                  ? money(Number(r.quantity) * Number(r.unitPrice))
                                  : ''
                              }
                            />
                            {i > 0 && !readOnly && (
                              <button
                                type="button"
                                className="px-2 text-xs text-[#a34539]"
                                onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <datalist id="sales-order-items">
                {items.map((i) => (
                  <option key={i.item_code} value={i.item_name}>
                    {i.item_code}
                  </option>
                ))}
              </datalist>
              <button
                type="button"
                disabled={readOnly}
                className="mt-3 w-full rounded border border-dashed py-2 text-[#24765f]"
                onClick={() =>
                  setRows((r) => [...r, { productName: '', quantity: '', unit: '', unitPrice: '' }])
                }
              >
                + Add Row
              </button>
              <div className="mt-4 flex justify-end">
                <label className="grid w-full max-w-[280px] gap-1 text-xs font-bold">
                  ITEMS SUBTOTAL
                  <input readOnly className="h-11 rounded border px-3 text-right" value={total} />
                </label>
              </div>
            </section>
            <section className="rounded-2xl border border-[#e3eae6] bg-white p-5">
              <h2 className="mb-4 border-b pb-3 text-lg font-bold">Remarks</h2>
              <textarea
                disabled={readOnly}
                rows={5}
                className="w-full rounded border p-3"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter remarks for this Sales Order..."
              />
            </section>
            {!!taxes?.length && (
              <section className="overflow-x-auto rounded-2xl border border-[#e3eae6] bg-white p-5">
                <h2 className="mb-4 text-lg font-bold">Taxes and Charges</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Account</th>
                      <th>Rate</th>
                      <th>Tax Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.map((t, i) => (
                      <tr key={i}>
                        <td>{t.description || t.charge_type || '—'}</td>
                        <td>{t.account_head || '—'}</td>
                        <td>
                          {t.rate ?? '—'}
                          {t.rate === undefined ? '' : '%'}
                        </td>
                        <td>{t.tax_amount ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <section className="rounded-2xl border border-[#e3eae6] bg-white p-5">
              <div className="flex flex-wrap justify-end gap-2">
                {existingName &&
                  transitions.length > 0 &&
                  !readOnly &&
                  transitions.map((t) => (
                    <button
                      type="button"
                      key={t.action}
                      disabled={saving}
                      onClick={() => void applyTransition(t)}
                      className="rounded-lg bg-[#24765f] px-4 py-2 font-bold text-white"
                    >
                      {t.action}
                    </button>
                  ))}
                {!existingName && !loading && (
                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="rounded-lg bg-[#24765f] px-4 py-2 font-bold text-white"
                  >
                    {saving ? 'Saving...' : 'Submit Sales Order'}
                  </button>
                )}
                {existingName && docstatus === 0 && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void persist(false)}
                      className="rounded-lg bg-[#24765f] px-4 py-2 font-bold text-white"
                    >
                      {saving ? 'Saving...' : 'Update Sales Order'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void persist(true)}
                      className="rounded-lg border border-[#24765f] px-4 py-2 font-bold text-[#24765f]"
                    >
                      Submit Sales Order
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void removeOrder()}
                      className="rounded-lg border border-[#a34539] px-4 py-2 font-bold text-[#a34539]"
                    >
                      Delete
                    </button>
                  </>
                )}
                {readOnly && (
                  <p className="text-sm text-[#8b3c2c]">This Sales Order is read-only.</p>
                )}
              </div>
            </section>
          </form>
        </section>
      </main>
      {assignmentOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5">
            <h2 className="text-lg font-bold">Assign Sales Order</h2>
            {error && (
              <p
                className="mt-3 rounded border border-[#f1d4d0] bg-[#fff7f6] p-3 text-sm text-[#8b3c2c]"
                role="alert"
              >
                {error}
              </p>
            )}
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              User Group
              <select
                className="min-h-11 rounded border px-3"
                value={assignmentGroup}
                onChange={(e) => void updateAssignmentGroup(e.target.value)}
              >
                <option value="">Select a group (optional)</option>
                {assignmentGroups.map((group) => (
                  <option key={group.name} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Assign To (select multiple users)
              <select
                multiple
                className="min-h-36 rounded border px-3 py-2"
                value={selectedAssignees}
                onChange={(e) =>
                  setSelectedAssignees(
                    Array.from(e.currentTarget.selectedOptions, (option) => option.value),
                  )
                }
              >
                {assignmentUsers.map((user) => (
                  <option key={user.name} value={user.name}>
                    {user.full_name || user.name}
                    {user.email ? ` (${user.email})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Due Date
                <input
                  type="date"
                  className="min-h-11 rounded border px-3"
                  value={assignmentDate}
                  onChange={(e) => setAssignmentDate(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Priority
                <select
                  className="min-h-11 rounded border px-3"
                  value={assignmentPriority}
                  onChange={(e) =>
                    setAssignmentPriority(e.target.value as 'Low' | 'Medium' | 'High')
                  }
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
            </div>
            <textarea
              className="mt-4 min-h-28 w-full rounded border p-3"
              value={assignmentText}
              onChange={(e) => setAssignmentText(e.target.value)}
              placeholder="Assignment comment"
            />
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Attach files
              <input
                type="file"
                multiple
                className="rounded border p-2"
                onChange={(e) => setAssignmentFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {assignmentFiles.length > 0 && (
              <p className="mt-2 text-sm text-[#53645d]">
                {assignmentFiles.map((file) => file.name).join(', ')}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={assignmentSaving}
                className="rounded border px-3 py-2"
                onClick={() => setAssignmentOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                disabled={assignmentSaving}
                className="rounded bg-[#24765f] px-3 py-2 font-bold text-white"
                onClick={() => void submitAssignment()}
              >
                {assignmentSaving ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
