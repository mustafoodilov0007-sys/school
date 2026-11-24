import { useState } from 'react';
import { errMsg, uploadRaw } from '../lib/api';
import { Modal } from './ui';
import { useToast } from './Toast';

interface Preview {
  committed?: boolean; total?: number; valid?: number; errors?: { row: number; message: string }[]; newTopics?: string[];
  dryRun?: boolean; rows?: { index: number; firstName: string; lastName: string; warnings: string[] }[]; created?: unknown[];
}

/** Excel (.xlsx) import: avval ko'rib chiqish (hech narsa saqlanmaydi), keyin tasdiqlash. */
export function XlsxImport({ title, hint, url, onClose, onDone }: { title: string; hint: string; url: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const sep = url.includes('?') ? '&' : '?';
  const run = async (commit: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadRaw<Preview>(`${url}${sep}commit=${commit ? 1 : 0}`, file);
      if (commit) { toast('Import bajarildi'); onDone(); onClose(); } else setPrev(r);
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const warns = prev?.rows?.filter((r) => r.warnings.length) ?? [];
  const errors = prev?.errors ?? [];
  const okToCommit = !!prev && errors.length === 0 && (prev.valid ?? prev.rows?.length ?? 0) > 0;
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-mute">{hint}</p>
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel fayl" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPrev(null); }} />
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" disabled={!file || busy} onClick={() => void run(false)}>Ko'rib chiqish</button>
        <button className="btn" disabled={!okToCommit || busy} style={{ opacity: okToCommit && !busy ? 1 : 0.5 }} onClick={() => void run(true)}>Import qilish</button>
      </div>
      {prev && (
        <div className="mt-3 space-y-2 text-sm" aria-live="polite">
          <p>{prev.valid !== undefined ? `To'g'ri qatorlar: ${prev.valid} / ${prev.total}` : `Qatorlar: ${prev.rows?.length ?? 0}`}{prev.newTopics?.length ? ` · yangi mavzular: ${prev.newTopics.join(', ')}` : ''}</p>
          {errors.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-lg border border-line p-2 text-danger">{errors.slice(0, 50).map((e, i) => <li key={i}>{e.row}-qator: {e.message}</li>)}</ul>
          )}
          {warns.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-lg border border-line p-2">{warns.slice(0, 50).map((w) => <li key={w.index}>{w.lastName} {w.firstName}: {w.warnings.join('; ')}</li>)}</ul>
          )}
        </div>
      )}
    </Modal>
  );
}
