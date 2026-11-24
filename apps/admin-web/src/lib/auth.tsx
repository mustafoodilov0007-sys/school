import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminMeDto } from '@pep/shared';
import { api, ApiFail } from './api';

interface AuthState {
  loading: boolean;
  admin: AdminMeDto | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminMeDto | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAdmin((await api<{ admin: AdminMeDto }>('/api/admin/me')).admin);
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const logout = useCallback(async () => {
    await api('/api/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAdmin(null);
  }, []);

  return <Ctx.Provider value={{ loading, admin, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider topilmadi');
  return v;
}
