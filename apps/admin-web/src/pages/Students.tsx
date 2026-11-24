import { useState } from 'react';
import { XlsxImport } from '../components/XlsxImport';
import { formatTashkent, parseBulkNameLines } from '@pep/shared';
import type { ClassDto, StudentDto } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Modal, ReasonDialog, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

const PAGE = 50;
type Dialog =
  | { kind: 'create' }
  | { kind: 'bulk' }
  | { kind: 'unlink' | 'regen'; s: StudentDto }
  | null;

interface BulkPreview { rows: { index: number; firstName: string; lastName: string; warnings: string[] }[]; className: string }

export function StudentsPage() {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [xlsx, setXlsx] = useState(false);
  const [q, setQ] = useState('');
  const [linked, setLinked] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);

  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
  if (classId) params.set('classId', classId);
  if (q.trim()) params.set('q', q.trim());
  if (linked) params.set('linked', linked);
  if (active) params.set('active', active);
  const list = useAsync(
    () => api<{ items: StudentDto[]; total: number }>(`/api/admin/students?${params.toString()}`),
    [classId, q, linked, active, page],
  );

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast(okMsg); list.reload(); classes.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const total = list.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">O'quvchilar</h1>
        <div className="flex gap-2">
          <a className="btn-sm" href={`/api/admin/reports/codes.xlsx${classId ? `?classId=${classId}` : ''}`}>ID lar (Excel)</a>
          <a className="btn-sm" href={`/api/admin/reports/codes.pdf${classId ? `?classId=${classId}` : ''}`}>ID lar (PDF)</a>
          <button className="btn-sm" disabled={!classId} title={classId ? '' : 'Avval sinfni tanlang'} onClick={() => setXlsx(true)}>Excel import</button>
          <a className="btn-sm" href={`/api/admin/students/export.csv${classId ? `?classId=${classId}` : ''}`}>ID lar (CSV)</a>
          <button className="btn-sm" onClick={() => setDialog({ kind: 'bulk' })}>Ro'yxatdan qo'shish</button>
          <button className="btn" style={{ minHeight: 40 }} onClick={() => setDialog({ kind: 'create' })}>+ O'quvchi</button>
        </div>
      </div>

      <div className="card grid grid-cols-2 gap-3 md:grid-cols-4">
        <select aria-label="Sinf" className="input" value={classId} onChange={(e) => { setClassId(e.target.value); setPage(0); }}>
          <option value="">Barcha sinflar</option>
          {classes.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input aria-label="Qidirish" className="input" placeholder="Ism, familiya yoki ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select aria-label="Telegram" className="input" value={linked} onChange={(e) => { setLinked(e.target.value); setPage(0); }}>
          <option value="">Telegram: hammasi</option>
          <option value="true">Bog'langan</option>
          <option value="false">Bog'lanmagan</option>
        </select>
        <select aria-label="Holat" className="input" value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }}>
          <option value="true">Faol</option>
          <option value="false">Faol emas</option>
          <option value="">Hammasi</option>
        </select>
      </div>

      {list.loading ? <Spinner /> : list.error || !list.data ? <p role="alert" className="text-danger">{errMsg(list.error)}</p> : list.data.items.length === 0 ? (
        <Empty>O'quvchilar topilmadi. Avval sinf yarating, so'ng o'quvchi qo'shing.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Familiya Ism</th><th className="th">Sinf</th><th className="th">ID</th><th className="th">Telegram</th><th className="th">Holat</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((s) => (
                <tr key={s.id} className={s.isActive ? '' : 'opacity-60'}>
                  <td className="td font-medium">{s.lastName} {s.firstName}</td>
                  <td className="td">{s.className}</td>
                  <td className="td font-mono">
                    {s.code}{' '}
                    <button className="btn-sm" aria-label={`${s.code} nusxalash`} onClick={() => void navigator.clipboard.writeText(s.code).then(() => toast('Nusxalandi'), () => toast('Nusxalab bo\'lmadi', 'err'))}>⧉</button>
                  </td>
                  <td className="td">{s.isLinked ? <>✅ {s.telegramUsername ? `@${s.telegramUsername}` : ''}<br /><span className="text-xs text-mute">{s.telegramLinkedAt ? formatTashkent(s.telegramLinkedAt) : ''}</span></> : '—'}</td>
                  <td className="td">{s.isActive ? 'Faol' : 'Faol emas'}</td>
                  <td className="td space-x-1 whitespace-nowrap text-right">
                    {s.isLinked && <button className="btn-sm" onClick={() => setDialog({ kind: 'unlink', s })}>Bog'lanishni uzish</button>}
                    <button className="btn-sm" onClick={() => setDialog({ kind: 'regen', s })}>Yangi ID</button>
                    <button className="btn-sm" onClick={() => void act(() => api(`/api/admin/students/${s.id}/${s.isActive ? 'deactivate' : 'activate'}`, { method: 'POST', body: {} }), s.isActive ? 'Faolsizlantirildi' : 'Faollashtirildi')}>
                      {s.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line p-3 text-sm">
            <span className="text-mute">Jami: {total}</span>
            <div className="space-x-2">
              <button className="btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Oldingi</button>
              <button className="btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Keyingi →</button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'create' && <CreateDialog classes={classes.data?.items ?? []} onClose={() => setDialog(null)} onDone={() => { setDialog(null); list.reload(); classes.reload(); }} />}
      {dialog?.kind === 'bulk' && <BulkDialog classes={classes.data?.items ?? []} onClose={() => setDialog(null)} onDone={() => { setDialog(null); list.reload(); classes.reload(); }} />}
      {dialog?.kind === 'unlink' && (
        <ReasonDialog title="Telegram bog'lanishini uzish" confirmLabel="Uzish"
          hint={`${dialog.s.lastName} ${dialog.s.firstName}: barcha sessiyalar bekor qilinadi, o'quvchi o'sha ID bilan botda qayta ro'yxatdan o'tishi mumkin bo'ladi.`}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => { const s = dialog.s; setDialog(null); await act(() => api(`/api/admin/students/${s.id}/unlink-telegram`, { method: 'POST', body: { reason } }), 'Bog\'lanish uzildi'); }} />
      )}
      {dialog?.kind === 'regen' && (
        <ReasonDialog title="Yangi ID berish" confirmLabel="Yangi ID yaratish"
          hint={`${dialog.s.lastName} ${dialog.s.firstName}: eski ID (${dialog.s.code}) darhol yaroqsiz bo'ladi. Telegram bog'lanishi saqlanadi.`}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => { const s = dialog.s; setDialog(null); await act(() => api(`/api/admin/students/${s.id}/regenerate-code`, { method: 'POST', body: { reason } }), 'Yangi ID berildi'); }} />
      )}
      {xlsx && classId && <XlsxImport title="O'quvchilarni Excel'dan qo'shish" hint="1-ustun: familiya, 2-ustun: ism (sarlavha qatori bo'lishi mumkin). Tanlangan sinfga qo'shiladi; takroriy ismlar ogohlantiriladi." url={`/api/admin/students/import-xlsx?classId=${classId}`} onClose={() => setXlsx(false)} onDone={() => { list.reload(); classes.reload(); }} />}
    </div>
  );
}

function ClassSelect({ classes, value, onChange }: { classes: ClassDto[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Sinf" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sinfni tanlang…</option>
      {classes.filter((c) => !c.isArchived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function CreateDialog({ classes, onClose, onDone }: { classes: ClassDto[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = classId && firstName.trim() && lastName.trim();
  return (
    <Modal title="Yangi o'quvchi" onClose={onClose}>
      <div className="space-y-3">
        <ClassSelect classes={classes} value={classId} onChange={setClassId} />
        <input aria-label="Familiya" className="input" placeholder="Familiya" value={lastName} onChange={(e) => setLast(e.target.value)} />
        <input aria-label="Ism" className="input" placeholder="Ism" value={firstName} onChange={(e) => setFirst(e.target.value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Bekor qilish</button>
        <button className="btn" disabled={!ok || busy} onClick={async () => {
          setBusy(true);
          try {
            const s = await api<StudentDto>('/api/admin/students', { method: 'POST', body: { classId, firstName, lastName } });
            toast(`Yaratildi. ID: ${s.code}`);
            onDone();
          } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
        }}>Yaratish</button>
      </div>
    </Modal>
  );
}

function BulkDialog({ classes, onClose, onDone }: { classes: ClassDto[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [text, setText] = useState('');
  const [order, setOrder] = useState<'last_first' | 'first_last'>('last_first');
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseBulkNameLines(text, order);
  const students = parsed.rows.map((r) => ({ firstName: r.firstName, lastName: r.lastName }));

  const call = (dryRun: boolean) => api<unknown>('/api/admin/students/bulk', { method: 'POST', body: { classId, dryRun, students } });

  return (
    <Modal title="Ro'yxatdan qo'shish" onClose={onClose}>
      <div className="space-y-3">
        <ClassSelect classes={classes} value={classId} onChange={(v) => { setClassId(v); setPreview(null); }} />
        <select aria-label="Tartib" className="input" value={order} onChange={(e) => { setOrder(e.target.value as typeof order); setPreview(null); }}>
          <option value="last_first">Familiya Ism (Karimov Aziz)</option>
          <option value="first_last">Ism Familiya (Aziz Karimov)</option>
        </select>
        <textarea aria-label="Ro'yxat" className="input min-h-[160px] py-2" placeholder={'Har qatorda bitta o\'quvchi:\nKarimov Aziz\nErgasheva Nilufar'}
          value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
        {parsed.errors.length > 0 && (
          <ul role="alert" className="text-sm text-danger">
            {parsed.errors.map((e) => <li key={e.line}>{e.line}-qator «{e.text}»: {e.message}</li>)}
          </ul>
        )}
        {preview && (
          <div className="max-h-48 overflow-auto rounded-lg border border-line text-sm">
            <p className="border-b border-line p-2 font-medium">{preview.className}: {preview.rows.length} ta o'quvchi qo'shiladi</p>
            <ul className="divide-y divide-line">
              {preview.rows.map((r) => (
                <li key={r.index} className="p-2">{r.lastName} {r.firstName}{r.warnings.map((w) => <div key={w} className="text-xs text-danger">⚠ {w}</div>)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Bekor qilish</button>
        {!preview ? (
          <button className="btn" disabled={!classId || students.length === 0 || parsed.errors.length > 0 || busy} onClick={async () => {
            setBusy(true);
            try { setPreview((await call(true)) as BulkPreview); } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
          }}>Ko'rib chiqish</button>
        ) : (
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await call(false); toast(`${students.length} ta o'quvchi qo'shildi`); onDone(); } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
          }}>Tasdiqlash va qo'shish</button>
        )}
      </div>
    </Modal>
  );
}
