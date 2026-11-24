import { useCallback, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { ClassPicker } from '../components/ClassPicker';
import { Empty, ReasonDialog, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const KIND: Record<string, string> = { daily: 'Kundalik', quiz: 'Nazorat', exam: 'Imtihon', quarter: 'Chorak', year: 'Yillik' };
const gradeColor = (v: number) => (v >= 5 ? 'text-ok' : v === 4 ? 'text-brand' : v === 3 ? 'text-warn' : 'text-danger');

/* ───────── Elektron jurnal ───────── */
interface Journal { students: { id: string; name: string }[]; grades: { id: string; studentId: string; date: string; subject: string; value: number; kind: string; topic: string | null; comment: string | null }[] }

export function JournalPage() {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [to, setTo] = useState(today());
  const from = addDays(to, -29);
  const [add, setAdd] = useState<{ studentId: string; name: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [val, setVal] = useState(5);
  const [kind, setKind] = useState('daily');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(today());
  const pick = useCallback((id: string) => setClassId(id), []);
  const d = useAsync(() => (classId ? api<Journal>(`/api/admin/journal/${classId}?from=${from}&to=${to}`) : Promise.resolve(null)), [classId, to]);
  const save = async () => {
    if (!add) return;
    try {
      await api('/api/admin/grades', { method: 'POST', body: { studentId: add.studentId, date, value: val, kind, topic: topic || null } });
      toast('Baho qo\'yildi'); setAdd(null); setTopic(''); d.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="space-y-4">
      <div className="page-title"><h1>Elektron jurnal</h1>
        <div className="flex flex-wrap gap-2">
          <ClassPicker value={classId} onChange={pick} />
          <input type="date" className="input w-auto" aria-label="Oxirgi sana" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-mute">Oxirgi 30 kun ({from} — {to}). O'quvchi qatoridagi «＋ Baho» tugmasi orqali baho qo'yiladi.</p>
      {d.loading ? <Spinner /> : d.error ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : !d.data || d.data.students.length === 0 ? <Empty>Bu sinfda faol o'quvchi yo'q.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><th className="th">O'quvchi</th><th className="th">Baholar</th><th className="th">O'rtacha</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {d.data.students.map((s) => {
                const gs = d.data!.grades.filter((g) => g.studentId === s.id);
                const avg = gs.length ? (gs.reduce((a, g) => a + g.value, 0) / gs.length).toFixed(2) : '—';
                return (
                  <tr key={s.id}>
                    <td className="td font-medium">{s.name}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {gs.map((g) => (
                          <button key={g.id} title={`${g.date} · ${KIND[g.kind] ?? g.kind}${g.topic ? ` · ${g.topic}` : ''} — o'chirish`} aria-label={`${g.date} baho ${g.value}, o'chirish`}
                            className={`h-8 w-8 rounded-lg border border-line font-bold ${gradeColor(g.value)}`} onClick={() => setDel(g.id)}>{g.value}</button>
                        ))}
                      </div>
                    </td>
                    <td className="td">{avg}</td>
                    <td className="td text-right"><button className="btn-sm" onClick={() => setAdd({ studentId: s.id, name: s.name })}>＋ Baho</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {add && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && setAdd(null)}>
          <div role="dialog" aria-modal="true" aria-label="Baho qo'yish" className="card w-full max-w-sm space-y-3">
            <h2>{add.name}</h2>
            <div className="flex gap-2" role="radiogroup" aria-label="Baho">
              {[5, 4, 3, 2, 1].map((n) => (
                <button key={n} role="radio" aria-checked={val === n} onClick={() => setVal(n)}
                  className={`h-12 flex-1 rounded-xl border text-xl font-bold ${val === n ? 'border-brand bg-soft' : 'border-line'} ${gradeColor(n)}`}>{n}</button>
              ))}
            </div>
            <select className="input" aria-label="Turi" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input type="date" className="input" aria-label="Sana" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <input className="input" placeholder="Mavzu (ixtiyoriy)" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} />
            <div className="flex gap-2"><button className="btn flex-1" onClick={() => void save()}>Saqlash</button><button className="btn-ghost" onClick={() => setAdd(null)}>Bekor</button></div>
          </div>
        </div>
      )}
      {del && (
        <ReasonDialog title="Bahoni o'chirish" hint="Sabab auditga yoziladi." confirmLabel="O'chirish" onClose={() => setDel(null)}
          onConfirm={async (reason) => { await api(`/api/admin/grades/${del}`, { method: 'DELETE', body: { reason } }); toast('O\'chirildi'); setDel(null); d.reload(); }} />
      )}
    </div>
  );
}

/* ───────── Davomat ───────── */
type St = 'present' | 'absent' | 'late' | 'excused';
const ST: { id: St; label: string; cls: string }[] = [
  { id: 'present', label: 'Keldi', cls: 'text-ok' }, { id: 'absent', label: 'Kelmadi', cls: 'text-danger' },
  { id: 'late', label: 'Kechikdi', cls: 'text-warn' }, { id: 'excused', label: 'Sababli', cls: 'text-brand' },
];

export function AttendancePage() {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, St>>({});
  const pick = useCallback((id: string) => setClassId(id), []);
  const d = useAsync(async () => {
    if (!classId) return null;
    const r = await api<{ students: { id: string; name: string; status: St | null }[] }>(`/api/admin/attendance/${classId}?date=${date}`);
    setMarks(Object.fromEntries(r.students.map((s) => [s.id, s.status ?? 'present'])));
    return r;
  }, [classId, date]);
  const save = async () => {
    try {
      await api(`/api/admin/attendance/${classId}`, { method: 'PUT', body: { date, items: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })) } });
      toast('Davomat saqlandi');
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const counts = ST.map((s) => ({ ...s, n: Object.values(marks).filter((m) => m === s.id).length }));
  return (
    <div className="space-y-4">
      <div className="page-title"><h1>Davomat</h1>
        <div className="flex flex-wrap gap-2">
          <ClassPicker value={classId} onChange={pick} />
          <input type="date" className="input w-auto" aria-label="Sana" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>
      {d.loading ? <Spinner /> : d.error ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : !d.data || d.data.students.length === 0 ? <Empty>Bu sinfda faol o'quvchi yo'q.</Empty> : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">{counts.map((c) => <span key={c.id} className="badge">{c.label}: {c.n}</span>)}</div>
          <ul className="card divide-y divide-line p-0">
            {d.data.students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="font-medium">{s.name}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={`${s.name} davomati`}>
                  {ST.map((o) => (
                    <button key={o.id} role="radio" aria-checked={marks[s.id] === o.id} onClick={() => setMarks((m) => ({ ...m, [s.id]: o.id }))}
                      className={`min-h-[36px] rounded-lg border px-2.5 text-sm ${marks[s.id] === o.id ? `border-brand bg-soft font-semibold ${o.cls}` : 'border-line text-mute'}`}>{o.label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => void save()}>Saqlash</button>
        </>
      )}
    </div>
  );
}

/* ───────── Dars jadvali ───────── */
interface Slot { id: string; weekday: number; lessonNo: number; subject: string; room: string | null; startsAt: string | null; endsAt: string | null }

export function SchedulePage() {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [edit, setEdit] = useState<{ weekday: number; lessonNo: number; subject: string; room: string; startsAt: string; endsAt: string; id?: string } | null>(null);
  const pick = useCallback((id: string) => setClassId(id), []);
  const d = useAsync(() => (classId ? api<{ items: Slot[] }>(`/api/admin/schedule/${classId}`) : Promise.resolve(null)), [classId]);
  const save = async () => {
    if (!edit) return;
    try {
      await api(`/api/admin/schedule/${classId}`, { method: 'PUT', body: { weekday: edit.weekday, lessonNo: edit.lessonNo, subject: edit.subject, room: edit.room || null, startsAt: edit.startsAt || null, endsAt: edit.endsAt || null } });
      setEdit(null); d.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const remove = async () => {
    if (!edit?.id) return;
    try { await api(`/api/admin/schedule/slot/${edit.id}`, { method: 'DELETE' }); setEdit(null); d.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const items = d.data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="page-title"><h1>Dars jadvali</h1><ClassPicker value={classId} onChange={pick} /></div>
      {d.loading ? <Spinner /> : d.error ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((name, i) => {
            const wd = i + 1;
            const day = items.filter((s) => s.weekday === wd);
            const nextNo = Math.min(10, (day.at(-1)?.lessonNo ?? 0) + 1);
            return (
              <section key={wd} className="card space-y-2" aria-label={name}>
                <h2>{name}</h2>
                {day.length === 0 && <p className="text-sm text-mute">Dars yo'q</p>}
                {day.map((s) => (
                  <button key={s.id} className="module-row w-full text-left" onClick={() => setEdit({ id: s.id, weekday: wd, lessonNo: s.lessonNo, subject: s.subject, room: s.room ?? '', startsAt: s.startsAt ?? '', endsAt: s.endsAt ?? '' })}>
                    <span className="module-icon font-bold">{s.lessonNo}</span>
                    <span><span className="module-title block">{s.subject}</span><span className="module-sub">{s.startsAt ? `${s.startsAt}–${s.endsAt ?? ''}` : ''}{s.room ? ` · ${s.room}-xona` : ''}</span></span>
                  </button>
                ))}
                <button className="btn-sm" onClick={() => setEdit({ weekday: wd, lessonNo: nextNo, subject: 'Fizika', room: '', startsAt: '', endsAt: '' })}>＋ Dars</button>
              </section>
            );
          })}
        </div>
      )}
      {edit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div role="dialog" aria-modal="true" aria-label="Dars" className="card w-full max-w-sm space-y-2">
            <h2>{DAYS[edit.weekday - 1]} · {edit.lessonNo}-dars</h2>
            <label className="block text-sm">Dars raqami<input type="number" min={1} max={10} className="input" value={edit.lessonNo} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, lessonNo: Number(e.target.value) })} /></label>
            <label className="block text-sm">Fan<input className="input" maxLength={60} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
            <label className="block text-sm">Xona<input className="input" maxLength={20} value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">Boshlanishi<input type="time" className="input" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} /></label>
              <label className="block text-sm">Tugashi<input type="time" className="input" value={edit.endsAt} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} /></label>
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={!edit.subject.trim()} onClick={() => void save()}>Saqlash</button>
              {edit.id && <button className="btn-ghost text-danger" onClick={() => void remove()}>O'chirish</button>}
              <button className="btn-ghost" onClick={() => setEdit(null)}>Yopish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
