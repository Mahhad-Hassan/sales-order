import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage, getDeliveryNotes } from './deliveryNoteApi';
import type { DeliveryNoteRecord } from './model';

const pageSize = 20;

function recordStatus(record: DeliveryNoteRecord): string {
  return (
    record.status?.trim() ||
    (record.docstatus === 1 ? 'Submitted' : record.docstatus === 2 ? 'Cancelled' : 'Draft')
  );
}

function formatAmount(record: DeliveryNoteRecord): string {
  const amount = Number(record.grand_total);
  if (!Number.isFinite(amount)) return '—';
  if (record.currency && /^[A-Z]{3}$/.test(record.currency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: record.currency,
      }).format(amount);
    } catch {
      return `${record.currency} ${amount.toLocaleString()}`;
    }
  }
  return amount.toLocaleString();
}

export function DeliveryNoteListPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<DeliveryNoteRecord[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError('');
    try {
      const result = await getDeliveryNotes();
      if (!isMounted || isMounted()) setRecords(result);
    } catch (reason) {
      if (!isMounted || isMounted()) setError(errorMessage(reason));
    } finally {
      if (!isMounted || isMounted()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadRecords(() => active);
    return () => {
      active = false;
    };
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter(
      (record) =>
        !needle ||
        [
          record.name,
          record.customer,
          record.customer_name,
          record.company,
          record.posting_date,
          record.status,
        ].some((value) => value?.toLocaleLowerCase().includes(needle)),
    );
  }, [records, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, pages));
  }, [pages]);

  function search(value: string) {
    setQuery(value);
    setPage(1);
  }

  async function signOut() {
    await logout();
    void navigate('/login', { replace: true });
  }

  const linkStyle =
    'rounded-[10px] border border-[#d6e0da] bg-white px-3 py-2 text-sm font-bold text-[#24765f] no-underline hover:bg-[#f3f8f5]';
  const buttonStyle =
    'min-h-10 rounded-lg border border-[#d6e0da] bg-white px-3 text-sm font-semibold text-[#24765f] disabled:cursor-not-allowed disabled:opacity-50';

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
          <Link className={linkStyle} to="/home">
            Home
          </Link>
          <button className={linkStyle} type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="bg-gradient-to-r from-[#14332b] to-[#24765f] px-[clamp(20px,5vw,76px)] pb-[68px] pt-7 text-white max-[700px]:px-4">
        <div className="mx-auto w-full max-w-[1440px]">
          <p className="m-0 text-[13px] text-white/75">
            <Link className="text-inherit no-underline hover:text-white" to="/home">
              Home
            </Link>
            <span className="px-1">›</span>Delivery Notes
          </p>
          <h1 className="mb-0 mt-2 text-[clamp(28px,4vw,36px)] font-extrabold leading-tight">
            Delivery Notes
          </h1>
          <p className="mb-0 mt-2 text-sm text-white/80">
            Create and manage Delivery Notes in Frappe.
          </p>
        </div>
      </section>

      <main className="w-full px-4 pb-8 max-[580px]:px-3">
        <section
          className="mx-auto -mt-10 w-full max-w-[1440px] rounded-2xl border border-[#e3eae6] bg-white p-6 shadow-[0_10px_30px_rgb(20_51_43_/_6%)] max-[580px]:p-4"
          aria-labelledby="delivery-note-records-title"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="m-0 text-xl font-extrabold" id="delivery-note-records-title">
                Delivery Note Records
              </h2>
              <p
                className="m-0 rounded-full bg-[#e6f3ee] px-3 py-1 text-xs font-bold text-[#24765f]"
                aria-live="polite"
              >
                {filtered.length} record(s)
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#24765f] px-4 py-2 text-sm font-bold text-white no-underline hover:bg-[#1c5f4c]"
              to="/delivery-note/new"
            >
              <span aria-hidden="true">+</span>New Delivery Note
            </Link>
          </div>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <label
              className="flex w-full max-w-[520px] flex-col gap-[6px] text-[13px] text-[#344a42]"
              htmlFor="delivery-note-search"
            >
              <span className="text-[11px] font-bold uppercase tracking-[.6px] text-[#6d7d77]">
                Search Delivery Notes
              </span>
              <input
                className="min-h-11 w-full rounded-xl border border-[#e3eae6] bg-[#fbfdfc] px-3 text-base outline-none focus:border-[#24765f] focus:ring-2 focus:ring-[#24765f]/20"
                id="delivery-note-search"
                type="search"
                value={query}
                placeholder="Search by note ID, customer, company, date, or status"
                onChange={(event) => search(event.target.value)}
              />
            </label>
            <button
              className={buttonStyle}
              type="button"
              disabled={loading}
              onClick={() => void loadRecords()}
            >
              {loading ? 'Refreshing...' : '↻ Refresh list'}
            </button>
          </div>

          {error && (
            <div
              className="mt-3 rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-3 py-[10px] text-base leading-[1.7] text-[#a34539]"
              role="alert"
            >
              <p className="m-0">{error}</p>
              <button
                className="mt-2 rounded-lg border bg-white px-3 py-1 font-bold"
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
              Loading Delivery Notes...
            </p>
          ) : filtered.length ? (
            <>
              <div className="grid gap-2" role="table" aria-label="Delivery Note records">
                <div
                  className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 px-3 text-xs font-bold uppercase tracking-wide text-[#81928a] md:grid"
                  role="row"
                >
                  <span role="columnheader">Delivery Note</span>
                  <span role="columnheader">Customer</span>
                  <span role="columnheader">Company</span>
                  <span role="columnheader">Date</span>
                  <span className="text-right" role="columnheader">
                    Quantity
                  </span>
                  <span className="text-right" role="columnheader">
                    Grand Total
                  </span>
                </div>
                {visible.map((record) => (
                  <button
                    className="grid w-full grid-cols-2 gap-3 rounded-[14px] border border-[#e3eae6] bg-white px-4 py-3 text-left transition hover:border-[#9fcdbd] hover:bg-[#f8fbf9] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
                    key={record.name}
                    type="button"
                    onClick={() =>
                      void navigate(`/delivery-note/${encodeURIComponent(record.name)}`)
                    }
                    role="row"
                  >
                    <span
                      className="min-w-0 break-words text-sm font-bold text-[#24765f]"
                      role="cell"
                    >
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Delivery Note
                      </small>
                      {record.name}
                      <span className="mt-1 block text-xs font-medium text-[#6d7d77]">
                        {recordStatus(record)}
                      </span>
                    </span>
                    <span
                      className="min-w-0 break-words text-sm font-semibold text-[#344a42]"
                      role="cell"
                    >
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Customer
                      </small>
                      {record.customer_name || record.customer}
                    </span>
                    <span className="min-w-0 break-words text-sm text-[#344a42]" role="cell">
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Company
                      </small>
                      {record.company}
                    </span>
                    <span className="text-sm text-[#344a42]" role="cell">
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Date
                      </small>
                      {record.posting_date || '—'}
                    </span>
                    <span className="text-sm text-[#344a42] md:text-right" role="cell">
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Quantity
                      </small>
                      {record.total_qty ?? '—'}
                    </span>
                    <span className="text-sm font-bold text-[#14332b] md:text-right" role="cell">
                      <small className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:hidden">
                        Grand Total
                      </small>
                      {formatAmount(record)}
                    </span>
                  </button>
                ))}
              </div>
              {pages > 1 && (
                <nav
                  className="mt-4 flex items-center justify-between gap-3"
                  aria-label="Delivery Note pages"
                >
                  <p className="m-0 text-sm text-[#6d7d77]">
                    Page {page} of {pages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={buttonStyle}
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      Previous
                    </button>
                    <button
                      className={buttonStyle}
                      type="button"
                      disabled={page === pages}
                      onClick={() => setPage((value) => Math.min(pages, value + 1))}
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
              {query.trim() ? 'No Delivery Notes match your search.' : 'No Delivery Notes found.'}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
