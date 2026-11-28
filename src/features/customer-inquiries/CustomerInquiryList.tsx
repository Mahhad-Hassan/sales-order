import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInquiries } from './customerInquiryApi';
import type { CustomerInquiryRecord } from './models';

const statuses = ['Open', 'RFQ Sent', 'Overdue', 'Quoted', 'Deal Created', 'Lost', 'Cancelled'];
const pageSize = 20;

function documentStatus(record: CustomerInquiryRecord): string {
  return record.docstatus === 1 ? 'Submitted' : record.docstatus === 2 ? 'Cancelled' : 'Draft';
}

export function CustomerInquiryListPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CustomerInquiryRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadRecords() {
    setLoading(true);
    setError('');
    try {
      setRecords(await getInquiries());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Customer Inquiries.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      return (
        !query ||
        [
          record.name,
          record.customer,
          record.customer_name,
          record.inquiry_date,
          record.required_date,
          record.status,
          record.company,
          record.responsible,
        ].some((value) => value?.toLocaleLowerCase().includes(query))
      );
    });
  }, [records, searchText, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  async function signOut() {
    await logout();
    void navigate('/login', { replace: true });
  }

  function setSearch(value: string) {
    setSearchText(value);
    setCurrentPage(1);
  }

  function setStatus(value: string) {
    setStatusFilter(value);
    setCurrentPage(1);
  }

  return (
    <div className="min-h-screen bg-[#eef1eb]">
      <header className="relative flex min-h-[72px] items-center justify-between border-b border-[#d6e0da] bg-white px-[clamp(20px,5vw,76px)] max-[580px]:px-4">
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
        {currentUser && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#24765f] max-[580px]:hidden">
              {currentUser}
            </span>
            <Link
              className="rounded-[10px] border border-[#d6e0da] bg-white px-3 py-2 text-sm font-bold text-[#24765f] no-underline hover:bg-[#f3f8f5]"
              to="/home"
            >
              Home
            </Link>
            <button
              className="rounded-[10px] border border-[#d6e0da] bg-white px-3 py-2 text-sm font-bold text-[#24765f] hover:bg-[#f3f8f5]"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <section className="bg-[linear-gradient(120deg,#14332b,#24765f)] px-[clamp(20px,5vw,76px)] pt-7 pb-[68px] text-white max-[700px]:px-4">
        <div className="mx-auto w-full max-w-[1440px]">
          <p className="m-0 text-[13px] text-white/75">
            <Link className="text-white/75 no-underline hover:text-white" to="/home">
              Home
            </Link>
            <span className="px-1" aria-hidden="true">
              ›
            </span>
            Customer Inquiries
          </p>
          <h1 className="mt-2 mb-0 text-[clamp(28px,4vw,36px)] font-extrabold leading-tight">
            Customer Inquiries
          </h1>
          <p className="mt-2 mb-0 text-sm text-white/80">
            Create and manage Customer Inquiries in Frappe.
          </p>
        </div>
      </section>

      <main className="w-full px-4 pb-8 max-[580px]:px-3">
        <section
          className="mx-auto -mt-10 w-full max-w-[1440px] rounded-2xl border border-[#e3eae6] bg-white p-6 shadow-sm max-[580px]:p-4"
          aria-labelledby="inquiry-records-title"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="m-0 text-xl font-extrabold text-[#14332b]" id="inquiry-records-title">
                Customer Inquiry Records
              </h2>
              <p
                className="m-0 rounded-full bg-[#e6f3ee] px-3 py-1 text-xs font-bold text-[#24765f]"
                aria-live="polite"
              >
                {filteredRecords.length} record(s)
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#24765f] px-4 py-2 text-sm font-bold text-white no-underline hover:bg-[#195b48]"
              to="/customer-inquiry/new"
            >
              <span aria-hidden="true">+</span>Add Customer Inquiry
            </Link>
          </div>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <label
              className="flex w-full max-w-[520px] flex-col gap-[6px] text-sm font-semibold text-[#344a42]"
              htmlFor="customer-inquiry-search"
            >
              <span>Search Customer Inquiries</span>
              <input
                className="min-h-11 w-full rounded-xl border border-[#d6e0da] px-3 text-base font-normal outline-none focus:border-[#24765f] focus:ring-2 focus:ring-[#24765f]/20"
                id="customer-inquiry-search"
                type="search"
                value={searchText}
                placeholder="Search by inquiry, customer, company, date, or status"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label
                className="flex flex-col gap-[6px] text-sm font-semibold text-[#344a42]"
                htmlFor="customer-inquiry-status"
              >
                <span>Filter by Status</span>
                <select
                  className="min-h-11 rounded-xl border border-[#d6e0da] bg-white px-3 text-sm font-normal outline-none focus:border-[#24765f]"
                  id="customer-inquiry-status"
                  value={statusFilter}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d6e0da] px-[14px] py-2 text-sm font-semibold text-[#24765f] hover:bg-[#f3f8f5] disabled:opacity-60"
                type="button"
                disabled={loading}
                onClick={() => void loadRecords()}
              >
                <span aria-hidden="true">↻</span>
                {loading ? 'Refreshing...' : 'Refresh list'}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="mt-3 rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-3 py-[10px] text-base leading-[1.7] text-[#a34539]"
              role="alert"
            >
              <p className="m-0">{error}</p>
              <button
                className="mt-2 rounded-lg border border-[#e8bdb7] bg-white px-3 py-1 font-bold"
                type="button"
                onClick={() => void loadRecords()}
              >
                Try again
              </button>
            </div>
          )}

          {loading && records.length === 0 ? (
            <p
              className="rounded-xl border border-dashed border-[#d6e0da] px-3 py-[18px] text-center text-[#6d7d77]"
              role="status"
            >
              Loading Customer Inquiries...
            </p>
          ) : filteredRecords.length ? (
            <>
              <div className="grid gap-2" role="table" aria-label="Customer Inquiry records">
                <div
                  className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 px-3 text-xs font-bold uppercase tracking-wide text-[#81928a] md:grid"
                  role="row"
                >
                  <span role="columnheader">Inquiry</span>
                  <span role="columnheader">Customer</span>
                  <span role="columnheader">Company</span>
                  <span role="columnheader">Inquiry Date</span>
                  <span role="columnheader">Required Date</span>
                  <span role="columnheader">Status</span>
                </div>
                {paginatedRecords.map((record) => (
                  <button
                    className="grid w-full grid-cols-2 gap-3 rounded-[14px] border border-[#d6e0da] bg-white px-4 py-3 text-left transition hover:border-[#91b9a8] hover:bg-[#fbfdfc] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
                    key={record.name}
                    type="button"
                    onClick={() =>
                      void navigate(`/customer-inquiry/${encodeURIComponent(record.name)}`)
                    }
                    role="row"
                  >
                    <span
                      className="min-w-0 break-words text-sm font-bold text-[#24765f]"
                      role="cell"
                    >
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Inquiry
                      </small>
                      {record.name}
                      <span className="mt-1 block text-xs font-medium text-[#6d7d77]">
                        {documentStatus(record)}
                      </span>
                    </span>
                    <span
                      className="min-w-0 break-words text-sm font-semibold text-[#344a42]"
                      role="cell"
                    >
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Customer
                      </small>
                      {record.customer_name || record.customer}
                    </span>
                    <span className="min-w-0 break-words text-sm text-[#344a42]" role="cell">
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Company
                      </small>
                      {record.company}
                    </span>
                    <span className="text-sm text-[#344a42]" role="cell">
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Inquiry Date
                      </small>
                      {record.inquiry_date || '—'}
                    </span>
                    <span className="text-sm text-[#344a42]" role="cell">
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Required Date
                      </small>
                      {record.required_date || '—'}
                    </span>
                    <span className="text-sm font-bold text-[#14332b]" role="cell">
                      <small className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#81928a] md:hidden">
                        Status
                      </small>
                      {record.status || 'Open'}
                    </span>
                  </button>
                ))}
              </div>
              {pageCount > 1 && (
                <nav
                  className="mt-4 flex items-center justify-between gap-3"
                  aria-label="Customer Inquiry pages"
                >
                  <p className="m-0 text-sm text-[#6d7d77]">
                    Page {currentPage} of {pageCount}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="min-h-10 rounded-lg border border-[#d6e0da] px-3 text-sm font-semibold text-[#24765f] disabled:opacity-50"
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </button>
                    <button
                      className="min-h-10 rounded-lg border border-[#d6e0da] px-3 text-sm font-semibold text-[#24765f] disabled:opacity-50"
                      type="button"
                      disabled={currentPage === pageCount}
                      onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </>
          ) : (
            <p
              className="rounded-xl border border-dashed border-[#d6e0da] px-3 py-[18px] text-center text-[#6d7d77]"
              role="status"
            >
              {searchText.trim() || statusFilter !== 'all'
                ? 'No Customer Inquiries match your filters.'
                : 'No Customer Inquiries found.'}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default CustomerInquiryListPage;
