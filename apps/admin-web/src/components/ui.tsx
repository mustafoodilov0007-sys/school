import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export const Spinner = () => (
  <div role="status" className="py-10 text-center text-mute">Yuklanmoqda…</div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="card py-10 text-center text-mute">{children}</div>
);

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="card max-h-[90vh] w-full max-w-lg overflow-auto outline-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-sm" onClick={onClose} aria-label="Yopish">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Sabab so'ralgan tasdiqlash oynasi (bog'lanishni uzish, ID almashtirish kabi xavfli amallar uchun). */
export function ReasonDialog({ title, hint, confirmLabel, onConfirm, onClose, field }: {
  title: string; hint: string; confirmLabel: string; onConfirm: (reason: string, value: number) => Promise<void>; onClose: () => void;
  /** Ixtiyoriy son maydoni (masalan, qo'shimcha daqiqa yoki yangi ball) */
  field?: { label: string; min: number; max: number; step?: number; initial: number };
}) {
  const [reason, setReason] = useState('');
  const [value, setValue] = useState(field?.initial ?? 0);
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3 && (!field || (Number.isFinite(value) && value >= field.min && value <= field.max));
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-mute">{hint}</p>
      {field && (
        <>
          <label className="mb-1 block text-sm font-medium" htmlFor="rd-value">{field.label}</label>
          <input id="rd-value" type="number" className="input mb-3" min={field.min} max={field.max} step={field.step ?? 1} value={Number.isFinite(value) ? value : ''} onChange={(e) => setValue(e.target.valueAsNumber)} />
        </>
      )}
      <label className="mb-1 block text-sm font-medium" htmlFor="reason">Sabab (majburiy)</label>
      <input id="reason" className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Bekor qilish</button>
        <button className="btn" disabled={!ok || busy} style={{ opacity: ok && !busy ? 1 : 0.5 }}
          onClick={async () => { setBusy(true); try { await onConfirm(reason.trim(), value); } finally { setBusy(false); } }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then(
      (d) => alive && (setData(d), setError(null), setLoading(false)),
      (e: unknown) => alive && (setError(e), setLoading(false)),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((x) => x + 1) };
}
