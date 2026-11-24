import { useState } from 'react';
import { t } from '@pep/shared';

/** Telegram akkaunt hali hech kimga bog'lanmagan: o'quvchi botda /start yuboradi, ota-ona esa kodni shu yerda kiritadi. */
export function LinkScreen({ onLink }: { onLink: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pt-10">
      <header className="hero"><h1 className="text-2xl font-bold">⚛️ Physics Exam Pro</h1><small>Maktab fizika imtihon platformasi</small></header>
      <section className="card space-y-1"><h2>🎓 O'quvchi</h2><p className="text-sm text-mute">{t('app_err_not_linked')}</p></section>
      <form className="card space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); const m = await onLink(code); if (m) setErr(m); setBusy(false); }}>
        <h2>👪 Ota-ona</h2>
        <p className="text-sm text-mute">Maktab bergan kodni kiriting (masalan, OT-AB12CD).</p>
        <label className="sr-only" htmlFor="pcode">Ota-ona kodi</label>
        <input id="pcode" className="input text-center text-lg font-bold uppercase tracking-widest" maxLength={12} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="OT-XXXXXX" />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button className="btn w-full" disabled={busy || code.trim().length < 5}>{busy ? '…' : 'Kirish'}</button>
      </form>
    </div>
  );
}
