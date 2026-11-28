import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { frappeApi } from '../services/frappeApi';

interface AuthContextValue {
  currentUser: string | null;
  checkSession: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => setCurrentUser(null);
    window.addEventListener('frappe:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('frappe:unauthorized', handleUnauthorized);
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const user = await frappeApi.getLoggedUser();
      setCurrentUser(user);
      return true;
    } catch {
      setCurrentUser(null);
      return false;
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await frappeApi.login(username, password);
    setCurrentUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await frappeApi.logout();
    } catch {
      // Match the existing sign-out flow: clear local auth even if the request fails.
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ currentUser, checkSession, login, logout }),
    [currentUser, checkSession, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
