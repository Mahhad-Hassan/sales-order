import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CustomerInquiryFormPage, CustomerInquiryListPage } from './features/customer-inquiries';
import { DeliveryNoteFormPage, DeliveryNoteListPage } from './features/delivery-notes';
import { SalesOrderFormPage, SalesOrderListPage } from './features/sales-orders';
import './styles/home.css';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { checkSession, currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!checking && !currentUser) {
      const returnUrl = `${location.pathname}${location.search}`;
      void navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`, { replace: true });
    }
  }, [checking, currentUser, location.pathname, location.search, navigate]);

  useEffect(() => {
    let active = true;
    void checkSession().then((authenticated) => {
      if (!active) {
        return;
      }
      if (!authenticated) {
        const returnUrl = `${location.pathname}${location.search}`;
        void navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`, { replace: true });
        return;
      }
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [checkSession, location.pathname, location.search, navigate]);

  if (checking || !currentUser) {
    return null;
  }
  return children;
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await login(username.trim(), password);
      setPassword('');
      const returnUrl = new URLSearchParams(location.search).get('returnUrl');
      const destination = returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
        ? returnUrl
        : '/home';
      void navigate(destination, { replace: true });
    } catch (error: unknown) {
      setPassword('');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Check your credentials and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef1eb] px-4 py-10 sm:flex sm:items-center sm:justify-center sm:px-6">
      <section className="mx-auto w-full max-w-[420px] border border-[#d1d8cc] bg-white px-6 py-8 shadow-[0_8px_28px_rgb(34_53_34_/_10%)] sm:px-9 sm:py-10">
        <header className="mb-8 text-center">
          <img
            className="mx-auto mb-4 h-[76px] w-auto object-contain"
            src="/AgroVisions%20Logo.png"
            alt="AgroVisions logo"
          />
          <h1 className="m-0 text-[26px] font-bold text-[#355224]">AgroVisions</h1>
          <p className="mb-0 mt-2 text-sm text-[#62685f]">Sales Order Management System</p>
        </header>

        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm font-semibold text-[#333a31]">
            Username or Email
            <input
              className="h-11 w-full rounded-sm border border-[#b8c0b1] bg-white px-3 text-base font-normal text-[#222] outline-none transition focus:border-[#55763e] focus:ring-2 focus:ring-[#55763e]/20 disabled:bg-[#f1f3ef]"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#333a31]">
            Password
            <span className="relative block">
              <input
                className="h-11 w-full rounded-sm border border-[#b8c0b1] bg-white px-3 pr-16 text-base font-normal text-[#222] outline-none transition focus:border-[#55763e] focus:ring-2 focus:ring-[#55763e]/20 disabled:bg-[#f1f3ef]"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-[#466536] hover:text-[#283e1d] focus-visible:outline-2 focus-visible:outline-[#55763e] disabled:opacity-50"
                type="button"
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                disabled={loading}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>

          {errorMessage && (
            <p className="m-0 border border-[#e4b7aa] bg-[#fff4f0] px-3 py-2 text-sm text-[#8b3c2c]" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="mt-1 inline-flex h-11 items-center justify-center rounded-sm border border-[#54723f] bg-[#5b7847] px-4 text-sm font-bold text-white transition hover:bg-[#486436] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355224] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={loading || !username || !password}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function HomePage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="workspace-home min-h-screen">
      <header className="workspace-home-header relative flex min-h-[72px] items-center justify-between border-b px-[clamp(20px,5vw,76px)] max-[580px]:px-4">
        <Link className="workspace-home-brand inline-flex items-center gap-3 no-underline" to="/home" aria-label="Home">
          <span className="workspace-home-logo" aria-hidden="true">AV</span>
          <span className="text-left">
            <strong className="block text-[18px] font-extrabold leading-tight">AGROVISIONS</strong>
            <small className="mt-1 block text-xs">Sales Order Management</small>
          </span>
        </Link>
        <div className="workspace-home-user flex items-center gap-3">
          <span className="text-sm font-semibold max-[580px]:hidden">{currentUser}</span>
          <button
            className="workspace-home-signout rounded-[10px] border bg-white px-3 py-2 text-sm font-bold"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="workspace-home-hero px-[clamp(20px,5vw,76px)] py-9 text-white max-[700px]:px-4">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="m-0 text-[13px] text-white/75">Home</p>
          <h1 className="mt-2 mb-0 text-[clamp(28px,4vw,36px)] font-extrabold leading-tight">Operations</h1>
          <p className="mt-2 mb-0 text-sm text-white/80">Choose a document workspace to continue.</p>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-5 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3 max-[580px]:px-3">
        <Link className="workspace-card group rounded-2xl border bg-white p-6 no-underline transition hover:-translate-y-1" to="/sales-orders">
          <span className="workspace-card-icon" aria-hidden="true">SO</span>
          <h2 className="mt-5 mb-2 text-xl font-extrabold">Sales Orders</h2>
          <p className="m-0 text-sm leading-6">Create, review, and manage Sales Orders.</p>
          <span className="workspace-card-link mt-5 inline-flex items-center gap-2 text-sm font-bold">Open Sales Orders <span aria-hidden="true">→</span></span>
        </Link>
        <Link className="workspace-card group rounded-2xl border bg-white p-6 no-underline transition hover:-translate-y-1" to="/delivery-notes">
          <span className="workspace-card-icon workspace-card-icon-blue" aria-hidden="true">DN</span>
          <h2 className="mt-5 mb-2 text-xl font-extrabold">Delivery Notes</h2>
          <p className="m-0 text-sm leading-6">Create, review, and manage Delivery Notes.</p>
          <span className="workspace-card-link mt-5 inline-flex items-center gap-2 text-sm font-bold">Open Delivery Notes <span aria-hidden="true">→</span></span>
        </Link>
        <Link className="workspace-card group rounded-2xl border bg-white p-6 no-underline transition hover:-translate-y-1" to="/customer-inquiries">
          <span className="workspace-card-icon workspace-card-icon-inquiry" aria-hidden="true">CI</span>
          <h2 className="mt-5 mb-2 text-xl font-extrabold">Customer Inquiry</h2>
          <p className="m-0 text-sm leading-6">Capture customer requirements, shipment details, and requested items.</p>
          <span className="workspace-card-link mt-5 inline-flex items-center gap-2 text-sm font-bold">Open Customer Inquiries <span aria-hidden="true">→</span></span>
        </Link>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-orders"
        element={
          <ProtectedRoute>
            <SalesOrderListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-order"
        element={
          <ProtectedRoute>
            <SalesOrderFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-order/new"
        element={
          <ProtectedRoute>
            <SalesOrderFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-order/:name"
        element={
          <ProtectedRoute>
            <SalesOrderFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-inquiries"
        element={
          <ProtectedRoute>
            <CustomerInquiryListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-inquiry/new"
        element={
          <ProtectedRoute>
            <CustomerInquiryFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-inquiry/:name"
        element={
          <ProtectedRoute>
            <CustomerInquiryFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-notes"
        element={
          <ProtectedRoute>
            <DeliveryNoteListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-note/new"
        element={
          <ProtectedRoute>
            <DeliveryNoteFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-note/:name"
        element={
          <ProtectedRoute>
            <DeliveryNoteFormPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
