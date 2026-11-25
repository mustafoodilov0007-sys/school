import { useEffect, useState } from 'react';
import type { ClassDto, StudentDto } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

/* ───────── O'qituvchilar ───────── */
interface Assign { id: string; classId: string; className: string; kind: 'homeroom' | 'subject'; subject: string | null }
interface Teacher { id: string; telegramId: number; displayName: string | null; subject: string | null; isActive: boolean; assignments: Assign[] }

export function TeachersPage() {
  const toast = useToast();
  const d = useAsync(() => api<{ items: Teacher[] }>('/api/admin/teachers'), []);
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const [form, setForm] = useState({ telegramId: '', displayName: '', subject: 'Fizika' });
  const [asg, setAsg] = useState<Record<string, { classId: string; kind: 'homeroom' | 'subject'; subject: string }>>({});
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); d.reload(); } catch (e) { toast(errMsg(e), 'err'); } };
  return (
    <div className="space-y-4">
      <div className="page-title"><h1>O'qituvchilar</h1></div>
      <p className="text-sm text-mute">O'qituvchi Telegram ID si bilan qo'shiladi, so'ng botda <b>/admin</b> yuborib kiradi. <b>Sinf rahbari</b> o'z sinfi davomatini belgilaydi; <b>fan o'qituvchisi</b> faqat o'z fanidan baho qo'yadi. Ikkalasi ham faqat o'z sinflarini ko'radi.</p>
      <form className="card grid gap-2 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run(async () => {
        await api('/api/admin/teachers', { method: 'POST', body: { telegramId: Number(form.telegramId), displayName: form.displayName, subject: form.subject || null } });
        setForm({ telegramId: '', displayName: '', subject: 'Fizika' });
      }, 'O\'qituvchi qo\'shildi'); }}>
        <input className="input" inputMode="numeric" placeholder="Telegram ID" aria-label="Telegram ID" value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value })} />
        <input className="input" placeholder="Ism familiya" aria-label="Ism familiya" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <input className="input" placeholder="Fan" aria-label="Fan" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <button className="btn" disabled={!/^\d+$/.test(form.telegramId) || form.displayName.trim().length < 2}>Qo'shish</button>
      </form>
      {d.loading ? <Spinner /> : d.error || !d.data ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : d.data.items.length === 0 ? <Empty>O'qituvchilar yo'q.</Empty> : (
        <ul className="space-y-3">
          {d.data.items.map((t) => {
            const f = asg[t.id] ?? { classId: classes.data?.items[0]?.id ?? '', kind: 'subject' as const, subject: t.subject ?? 'Fizika' };
            return (
              <li key={t.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{t.displayName} <span className="font-normal text-mute">· ID {t.telegramId}{t.subject ? ` · ${t.subject}` : ''}</span></b>
                  <button className="btn-sm" onClick={() => void run(() => api(`/api/admin/teachers/${t.id}`, { method: 'PATCH', body: { isActive: !t.isActive } }), t.isActive ? 'O\'chirildi' : 'Faollashtirildi')}>
                    {t.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.assignments.length === 0 && <span className="text-sm text-mute">Sinf biriktirilmagan</span>}
                  {t.assignments.map((a) => (
                    <span key={a.id} className={a.kind === 'homeroom' ? 'badge-ok' : 'badge'}>
                      {a.className} · {a.kind === 'homeroom' ? 'Sinf rahbari' : a.subject}
                      <button className="ml-1" aria-label="Olib tashlash" onClick={() => void run(() => api(`/api/admin/assignments/${a.id}`, { method: 'DELETE' }), 'Olib tashlandi')}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select className="input w-auto" aria-label="Sinf" value={f.classId} onChange={(e) => setAsg({ ...asg, [t.id]: { ...f, classId: e.target.value } })}>
                    {(classes.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="input w-auto" aria-label="Vazifa" value={f.kind} onChange={(e) => setAsg({ ...asg, [t.id]: { ...f, kind: e.target.value as 'homeroom' | 'subject' } })}>
                    <option value="subject">Fan o'qituvchisi</option><option value="homeroom">Sinf rahbari</option>
                  </select>
                  {f.kind === 'subject' && <input className="input w-auto" aria-label="Fan" value={f.subject} onChange={(e) => setAsg({ ...asg, [t.id]: { ...f, subject: e.target.value } })} />}
                  <button className="btn-sm" disabled={!f.classId} onClick={() => void run(() => api(`/api/admin/teachers/${t.id}/assignments`, { method: 'POST', body: { classId: f.classId, kind: f.kind, subject: f.kind === 'subject' ? f.subject : null } }), 'Biriktirildi')}>Biriktirish</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────── Ota-onalar ───────── */
interface Parent { id: string; firstName: string; lastName: string; phone: string | null; isActive: boolean; linked: boolean; linkCode: string | null; children: { id: string; name: string; className: string }[] }

export function ParentsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const d = useAsync(() => api<{ items: Parent[] }>(`/api/admin/parents${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [shown, setShown] = useState<{ name: string; code: string } | null>(null);
  useEffect(() => { if (!classId && classes.data?.items[0]) setClassId(classes.data.items[0].id); }, [classes.data, classId]);
  useEffect(() => {
    if (!classId) return;
    api<{ items: StudentDto[] }>(`/api/admin/students?classId=${classId}&active=true&limit=200`).then((r) => setStudents(r.items), () => setStudents([]));
  }, [classId]);
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast(ok); d.reload(); } catch (e) { toast(errMsg(e), 'err'); } };
  return (
    <div className="space-y-4">
      <div className="page-title"><h1>Ota-onalar</h1><input className="input w-auto" placeholder="Qidirish…" aria-label="Qidirish" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="text-sm text-mute">Ota-ona qo'shilgach <b>bir martalik kod</b> beriladi (OT-XXXXXX). Ota-ona botdagi Mini App'ni ochib shu kodni kiritadi — keyin farzandining baholari, davomati, jadvali va imtihon natijalarini ko'radi (faqat o'qish).</p>
      <form className="card space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const r = await api<{ id: string; linkCode: string }>('/api/admin/parents', { method: 'POST', body: { firstName: form.firstName, lastName: form.lastName, phone: form.phone || null, studentIds: picked } });
        setShown({ name: `${form.firstName} ${form.lastName}`.trim(), code: r.linkCode });
        setForm({ firstName: '', lastName: '', phone: '' }); setPicked([]);
      }, 'Ota-ona qo\'shildi'); }}>
        <div className="grid gap-2 md:grid-cols-3">
          <input className="input" placeholder="Ism" aria-label="Ism" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className="input" placeholder="Familiya" aria-label="Familiya" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <input className="input" placeholder="Telefon (ixtiyoriy)" aria-label="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" aria-label="Sinf" value={classId} onChange={(e) => setClassId(e.target.value)}>{(classes.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <span className="text-sm text-mute">Farzandlarni belgilang:</span>
        </div>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
          {students.map((s) => {
            const on = picked.includes(s.id);
            return <button type="button" key={s.id} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
              className={`rounded-lg border px-2.5 py-1 text-sm ${on ? 'border-brand bg-soft font-semibold' : 'border-line'}`}>{s.lastName} {s.firstName}</button>;
          })}
        </div>
        <button className="btn" disabled={!form.firstName.trim() || picked.length === 0}>Qo'shish ({picked.length} ta farzand)</button>
      </form>
      {shown && (
        <div role="status" className="card border-brand">
          <b>{shown.name}</b> uchun kod: <code className="rounded bg-soft px-2 py-1 text-lg font-bold">{shown.code}</code>
          <p className="mt-1 text-sm text-mute">Kodni ota-onaga bering. U faqat bir marta ishlaydi.</p>
          <button className="btn-sm mt-2" onClick={() => setShown(null)}>Yopish</button>
        </div>
      )}
      {d.loading ? <Spinner /> : d.error || !d.data ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : d.data.items.length === 0 ? <Empty>Ota-onalar yo'q.</Empty> : (
        <ul className="space-y-2">
          {d.data.items.map((p) => (
            <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2">
              <div>
                <b>{p.firstName} {p.lastName}</b> {p.phone && <span className="text-mute">· {p.phone}</span>}
                <div className="text-sm text-mute">{p.children.map((c) => `${c.name} (${c.className})`).join(', ') || 'Farzand biriktirilmagan'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.linked ? <span className="badge-ok">Telegramga bog'langan</span> : <code className="rounded bg-soft px-2 py-1 font-bold">{p.linkCode}</code>}
                <button className="btn-sm" onClick={() => void run(async () => { const r = await api<{ linkCode: string }>(`/api/admin/parents/${p.id}/reset-link`, { method: 'POST' }); setShown({ name: `${p.firstName} ${p.lastName}`.trim(), code: r.linkCode }); }, 'Yangi kod berildi')}>Yangi kod</button>
                <button className="btn-sm" onClick={() => void run(() => api(`/api/admin/parents/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }), p.isActive ? 'O\'chirildi' : 'Faollashtirildi')}>{p.isActive ? 'Faolsiz' : 'Faollashtirish'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
