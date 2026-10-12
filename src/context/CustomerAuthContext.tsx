import { createContext, useCallback, useContext, useState } from 'react';
import { customerApi, type CustomerProfile } from '../api';

const STORAGE_TOKEN = 'kaafi_customer_token';

interface CustomerAuthValue {
  token: string | null;
  profile: CustomerProfile | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
  setProfile: (p: CustomerProfile) => void;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_TOKEN));
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  const finish = (t: string, p: CustomerProfile) => {
    localStorage.setItem(STORAGE_TOKEN, t);
    setToken(t);
    setProfile(p);
  };

  const login = async (phone: string, password: string) => {
    const res = await customerApi.login(phone, password);
    finish(res.token, res.profile);
  };

  const register = async (name: string, phone: string, password: string) => {
    const res = await customerApi.register(name, phone, password);
    finish(res.token, res.profile);
  };

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN);
    setToken(null);
    setProfile(null);
  }, []);

  return (
    <CustomerAuthContext.Provider value={{ token, profile, login, register, logout, setProfile }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
