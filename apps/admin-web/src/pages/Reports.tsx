import { useState } from 'react';
import type { ClassDto, StudentDto } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Spinner, useAsync } from '../components/ui';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function Links({ base, query = '' }: { base: string; query?: string }) {
  return (
    <span className="flex gap-2">
      <a className="btn-sm" href={`${base}.xlsx${query}`} download>Excel</a>
      <a className="btn-sm" href={`${base}.pdf${query}`} download>PDF</a>
    </span>
  );
}

export function ReportsPage() {
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const students = useAsync(
    () => (classId ? api<{ items: StudentDto[] }>(`/api/admin/students?classId=${classId}&limit=200`) : Promise.resolve({ items: [] as StudentDto[] })),
    [classId],
  );
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(ymd(new Date(Date.now() + 86_400_000)));
  if (classes.loading) return <Spinner />;
  if (classes.error) return <p role="alert" className="text-danger">{errMsg(classes.error)}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hisobotlar</h1>
      <p className="text-sm text-mute">Hisobotlar faqat admin uchun, har bir yuklab olish auditga yoziladi. Imtihon bo'yicha hisobot (javob kaliti bilan) — Imtihonlar → Natijalar sahifasida.</p>

      <section className="card space-y-2">
        <h2 className="font-semibold">Haftalik umumiy hisobot</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Dan<input className="input mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm">Gacha<input className="input mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Links base="/api/admin/reports/weekly" query={`?from=${from}T00:00:00%2B05:00&to=${to}T00:00:00%2B05:00`} />
        </div>
        <p className="text-xs text-mute">Faqat tugagan imtihonlar: topshirgan/topshirmagan, o'rtacha, o'tish foizi va minimal foizdan pastlar.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Sinf bo'yicha</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-xs" aria-label="Sinf" value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(''); }}>
            <option value="">Sinfni tanlang</option>
            {classes.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {classId && <Links base={`/api/admin/classes/${classId}/report`} />}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">O'quvchi bo'yicha batafsil</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-xs" aria-label="O'quvchi" disabled={!classId} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{classId ? 'O\'quvchini tanlang' : 'Avval sinfni tanlang'}</option>
            {students.data?.items.map((s) => <option key={s.id} value={s.id}>{s.lastName} {s.firstName}</option>)}
          </select>
          {studentId && <Links base={`/api/admin/students/${studentId}/report`} />}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">O'quvchi ID'lari</h2>
        <Links base="/api/admin/reports/codes" query={classId ? `?classId=${classId}` : ''} />
        <p className="text-xs text-mute">{classId ? 'Tanlangan sinf.' : 'Barcha faol o\'quvchilar.'} ID'larni boshqalarga ko'rsatmang.</p>
      </section>
    </div>
  );
}
