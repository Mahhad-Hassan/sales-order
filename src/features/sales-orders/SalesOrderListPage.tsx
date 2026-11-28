import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { SalesOrderListOption } from './models';
import { getAllSalesOrders, getLinkedStatusMap, getWorkflowStyles } from './salesOrderApi';

export default function SalesOrderListPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SalesOrderListOption[]>([]);
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkedStatusError, setLinkedStatusError] = useState('');
  const pageSize = 20;

  async function load() {
    setLoading(true);
    setError('');
    setLinkedStatusError('');
    try {
      const records = await getAllSalesOrders();
      let linked = {};
      try {
        linked = await getLinkedStatusMap(records.map((r) => r.name));
      } catch (cause) {
        setLinkedStatusError(
          cause instanceof Error
            ? `Sales Orders loaded, but linked Delivery Note and Invoice statuses could not be loaded: ${cause.message}`
            : 'Sales Orders loaded, but linked Delivery Note and Invoice statuses could not be loaded.',
        );
      }
      const workflowStyles = await getWorkflowStyles();
      setStyles(workflowStyles);
      setOrders(
        records.map((r) => ({
          ...r,
          ...((
            linked as Record<string, { deliveryNoteStatus: string; salesInvoiceStatus: string }>
          )[r.name] ?? {}),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Sales Orders.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const orderStatus = (
        o.salesOrderStatus ||
        o.status ||
        (o.docstatus === 1 ? 'Submitted' : o.docstatus === 2 ? 'Cancelled' : 'Draft')
      ).toLowerCase();
      if (
        status === 'pending'
          ? !orderStatus.startsWith('pending')
          : status !== 'all' && !orderStatus.includes(status)
      )
        return false;
      if (period !== 'all') {
        const d = new Date(o.transaction_date);
        if (Number.isNaN(d.getTime())) return false;
        const now = new Date();
        if (period === 'year' && d.getFullYear() != now.getFullYear()) return false;
        if (
          period === 'month' &&
          (d.getFullYear() != now.getFullYear() || d.getMonth() != now.getMonth())
        )
          return false;
        if (period === 'week') {
          const start = new Date(now);
          start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(start.getDate() + 7);
          if (d < start || d >= end) return false;
        }
      }
      if (!q) return true;
      return [
        o.name,
        o.customer,
        o.customer_name,
        o.transaction_date,
        o.delivery_date,
        o.salesOrderStatus,
        o.status,
        o.deliveryNoteStatus,
        o.salesInvoiceStatus,
        o.total,
      ].some((v) =>
        String(v ?? '')
          .toLowerCase()
          .includes(q),
      );
    });
  }, [orders, search, status, period]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  function badge(status: string) {
    const name = status.replace(/\s+\(\d+\)$/, '');
    const style = (styles[name] ?? '').toLowerCase();
    return `inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${style === 'success' || style === 'primary' ? 'bg-[#e3f2eb] text-[#24765f]' : style === 'danger' ? 'bg-[#fdebe8] text-[#a34539]' : style === 'warning' ? 'bg-[#fff3d6] text-[#8a6818]' : 'bg-[#edf1ef] text-[#53645d]'}`;
  }
  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
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
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold max-[580px]:hidden">{currentUser}</span>
          <Link
            to="/home"
            className="rounded-[10px] border border-[#d6e0da] px-3 py-2 text-sm font-bold text-[#24765f] no-underline"
          >
            Home
          </Link>
          <button
            className="rounded-[10px] border border-[#e3eae6] px-3 py-2 text-sm font-bold text-[#b4432f]"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <section className="bg-gradient-to-r from-[#14332b] to-[#24765f] px-[clamp(20px,5vw,76px)] pb-[68px] pt-7 text-white">
        <div className="mx-auto max-w-[1440px]">
          <p className="m-0 text-[13px] text-white/75">Home › Sales Orders</p>
          <h1 className="mb-0 mt-2 text-[36px] font-extrabold">Sales Orders</h1>
          <p className="mb-0 mt-2 text-sm text-white/80">
            Search, view, and manage your Sales Orders.
          </p>
        </div>
      </section>
      <main className="px-4 pb-8">
        <section className="mx-auto -mt-10 max-w-[1440px] rounded-2xl border border-[#e3eae6] bg-white p-6 shadow-sm max-[580px]:p-4">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="m-0 text-xl font-extrabold">Sales Order Records</h2>
            <span className="rounded-full bg-[#e6f3ee] px-3 py-1 text-xs font-bold text-[#24765f]">
              {filtered.length} record(s)
            </span>
          </div>
          <div className="mb-4 flex items-end justify-between gap-5 max-[700px]:flex-col max-[700px]:items-stretch">
            <label className="flex w-full max-w-[520px] flex-col gap-[6px] text-[11px] font-bold uppercase tracking-wide text-[#6d7d77]">
              Search Sales Orders
              <input
                className="min-h-11 rounded-xl border border-[#e3eae6] bg-[#fbfdfc] px-3 text-base normal-case text-[#1c2b26] outline-none focus:border-[#24765f]"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by Sales Order ID, customer, date, or status"
              />
            </label>
            <div className="flex flex-wrap items-end justify-end gap-3 max-[700px]:justify-start">
              <label className="grid min-w-[150px] gap-[6px] text-sm font-medium">
                Status
                <select
                  className="min-h-11 rounded-xl border border-[#e3eae6] px-3"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
              <label className="grid min-w-[150px] gap-[6px] text-sm font-medium">
                Order date
                <select
                  className="min-h-11 rounded-xl border border-[#e3eae6] px-3"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Any time</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                </select>
              </label>
              <button
                className="min-h-11 rounded-xl border border-[#b9dccf] bg-[#e6f3ee] px-3 text-sm font-semibold text-[#24765f]"
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? 'Refreshing...' : 'Refresh list'}
              </button>
              <Link
                to="/sales-order/new"
                className="inline-flex min-h-11 items-center rounded-xl bg-[#24765f] px-4 text-sm font-bold text-white no-underline"
              >
                + New Sales Order
              </Link>
            </div>
          </div>
          {error && (
            <div
              className="mb-3 rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-[#a34539]"
              role="alert"
            >
              {error}
              <button className="ml-3 rounded border px-2" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}
          {linkedStatusError && (
            <div
              className="mb-3 rounded-xl border border-[#f1d4d0] bg-[#fff7f6] px-3 py-2 text-[#a34539]"
              role="alert"
            >
              {linkedStatusError}
            </div>
          )}
          {loading && orders.length === 0 ? (
            <p className="rounded-xl border border-dashed py-4 text-center text-[#6d7d77]">
              Loading Sales Orders...
            </p>
          ) : filtered.length ? (
            <>
              <div className="grid gap-2" role="table">
                <div className="hidden grid-cols-[1.25fr_1.2fr_1fr_.9fr_.85fr_.9fr_.9fr] gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-[#81928a] md:grid">
                  <span>Sales Order ID</span>
                  <span>Customer</span>
                  <span>Date</span>
                  <span className="text-right">Grand Total</span>
                  <span className="text-center">Sales Order</span>
                  <span className="text-center">Delivery Note</span>
                  <span className="text-center">Sales Invoice</span>
                </div>
                {visible.map((o) => {
                  const statusText =
                    o.salesOrderStatus ||
                    o.status ||
                    (o.docstatus === 1 ? 'Submitted' : o.docstatus === 2 ? 'Cancelled' : 'Draft');
                  return (
                    <button
                      key={o.name}
                      role="row"
                      onClick={() => navigate(`/sales-order/${encodeURIComponent(o.name)}`)}
                      className="grid w-full grid-cols-2 items-center gap-3 rounded-[14px] border border-l-[3px] border-[#e3eae6] border-l-[#cfe7dd] bg-[#fbfdfc] px-[14px] py-[13px] text-left text-[#1c2b26] hover:bg-[#f3f9f6] md:grid-cols-[1.25fr_1.2fr_1fr_.9fr_.85fr_.9fr_.9fr]"
                    >
                      <span className="font-bold text-[#24765f]">{o.name}</span>
                      <span className="truncate">{o.customer_name || o.customer}</span>
                      <span>
                        {o.transaction_date}
                        <small className="block text-[#81928a]">
                          {o.delivery_date ? `Delivery: ${o.delivery_date}` : ''}
                        </small>
                      </span>
                      <span className="text-right font-bold">
                        {o.currency && /^[A-Z]{3}$/.test(o.currency)
                          ? new Intl.NumberFormat(undefined, {
                              style: 'currency',
                              currency: o.currency,
                            }).format(Number(o.total ?? 0))
                          : Number(o.total ?? 0).toLocaleString()}
                      </span>
                      <span className="text-center">
                        <span className={badge(statusText)}>{statusText}</span>
                      </span>
                      <span className="text-center">
                        <span className={badge(o.deliveryNoteStatus || '—')}>
                          {o.deliveryNoteStatus || '—'}
                        </span>
                      </span>
                      <span className="text-center">
                        <span className={badge(o.salesInvoiceStatus || '—')}>
                          {o.salesInvoiceStatus || '—'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
                <span>
                  Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}-
                  {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 disabled:opacity-50"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="px-2 py-2">
                    {safePage}/{pageCount}
                  </span>
                  <button
                    className="rounded-lg border px-3 py-2 disabled:opacity-50"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed py-6 text-center text-[#6d7d77]">
              No Sales Orders found.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
