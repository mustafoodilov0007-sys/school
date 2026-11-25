import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type Kind = 'ok' | 'err';
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([]);
  const push = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} role={i.kind === 'err' ? 'alert' : 'status'}
            className={`card max-w-sm shadow-lg ${i.kind === 'err' ? 'border-danger text-danger' : ''}`}>
            {i.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
