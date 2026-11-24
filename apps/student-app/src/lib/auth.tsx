import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { t } from '@pep/shared';
import type { StudentMeDto } from '@pep/shared';
import { ApiFail, linkParent, login } from './api';
import type { LoginResult, ParentMe } from './api';

type State =
  | { status: 'loading' }
  | { status: 'ready'; role: 'student'; student: StudentMeDto }
  | { status: 'ready'; role: 'parent'; parent: ParentMe }
  | { status: 'unlinked' }
  | { status: 'error'; message: string; retryable: boolean };

const Ctx = createContext<{ state: State; retry: () => void; link: (code: string) => Promise<string | null> } | null>(null);

function describe(e: unknown): { message: string; retryable: boolean } {
  if (e instanceof ApiFail) {
    switch (e.code) {
      case 'STUDENT_INACTIVE': return { message: t('app_err_inactive'), retryable: false };
      case 'INIT_DATA_EXPIRED':
      case 'INIT_DATA_INVALID': return { message: t('app_err_expired'), retryable: false };
      case 'NOT_TELEGRAM': return { message: t('app_err_not_telegram'), retryable: false };
    }
  }
  return { message: t('app_err_generic'), retryable: true };
}

const ready = (r: LoginResult): State => (r.role === 'parent' ? { status: 'ready', role: 'parent', parent: r.parent } : { status: 'ready', role: 'student', student: r.student });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const run = useCallback(() => {
    setState({ status: 'loading' });
    login().then(
      (r) => setState(ready(r)),
      (e: unknown) => setState(e instanceof ApiFail && e.code === 'NOT_LINKED' ? { status: 'unlinked' } : { status: 'error', ...describe(e) }),
    );
  }, []);
  useEffect(run, [run]);
  /** Ota-ona kodi: muvaffaqiyatda null, xatoda xabar qaytaradi. */
  const link = useCallback(async (code: string) => {
    try { setState(ready(await linkParent(code))); return null; } catch (e) { return e instanceof ApiFail ? e.message : t('app_err_generic'); }
  }, []);
  return <Ctx.Provider value={{ state, retry: run, link }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider topilmadi');
  return v;
}
