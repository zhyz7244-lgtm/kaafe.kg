import { createContext, useContext, useState } from 'react';
import { authApi } from '../api';

const STORAGE_TOKEN = 'kaafi_admin_token';
const STORAGE_EMAIL = 'kaafi_admin_email';

interface AdminAuthValue {
  token: string | null;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_TOKEN),
  );
  const [email, setEmail] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_EMAIL),
  );

  const login = async (loginEmail: string, password: string) => {
    const res = await authApi.login(loginEmail, password);
    localStorage.setItem(STORAGE_TOKEN, res.token);
    localStorage.setItem(STORAGE_EMAIL, res.email);
    setToken(res.token);
    setEmail(res.email);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_EMAIL);
    setToken(null);
    setEmail(null);
  };

  return (
    <AdminAuthContext.Provider value={{ token, email, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
