import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { api } from '../lib/api';

interface Data {
  schedule: { id: string; weekday: number; lessonNo: number; subject: string; room: string | null; startsAt: string | null; endsAt: string | null }[];
  grades: { id: string; date: string; subject: string; value: number; kind: string; topic: string | null }[];
  average: number | null;
  attendance: { present: number; absent: number; late: number; excused: number; recent: { date: string; status: string }[] };
}
const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const ST: Record<string, string> = { present: '✅', absent: '❌', late: '⏰', excused: '📄' };
const color = (v: number) => (v >= 5 ? 'text-ok' : v === 4 ? 'text-brand' : v === 3 ? 'text-warn' : 'text-danger');

export function SchoolPage({ endpoint = '/api/student/school', title = 'Maktab' }: { endpoint?: string; title?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => { api<Data>(endpoint).then(setD, () => setErr('Yuklab bo\'lmadi')); }, [n, endpoint]);
  if (err) return <ErrorState message={err} onRetry={() => { setErr(''); setN(n + 1); }} />;
  if (!d) return <Loading />;
  const todayIdx = (new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })).getDay() + 6) % 7 + 1;
  const total = d.attendance.present + d.attendance.absent + d.attendance.late + d.attendance.excused;
  return (
    <div className="space-y-4 p-4">
      <header className="hero"><h1 className="text-2xl font-bold">{title}</h1><small>Jadval, baholar va davomat</small></header>

      <section className="card space-y-2" aria-labelledby="h-gr">
        <div className="flex items-center justify-between"><h2 id="h-gr">Baholarim</h2>{d.average !== null && <span className="badge">O'rtacha: {d.average}</span>}</div>
        {d.grades.length === 0 ? <p className="text-sm text-mute">Hali baho yo'q.</p> : (
          <ul className="divide-y divide-line">
            {d.grades.slice(0, 15).map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2">
                <span className={`module-icon text-xl font-bold ${color(g.value)}`}>{g.value}</span>
                <span><span className="module-title block">{g.subject}</span><span className="module-sub">{g.date}{g.topic ? ` · ${g.topic}` : ''}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="h-at">
        <h2 id="h-at">Davomat</h2>
        {total === 0 ? <p className="text-sm text-mute">Hali belgilanmagan.</p> : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="badge-ok">Keldi: {d.attendance.present}</span><span className="badge-danger">Kelmadi: {d.attendance.absent}</span>
              <span className="badge-warn">Kechikdi: {d.attendance.late}</span><span className="badge">Sababli: {d.attendance.excused}</span>
            </div>
            <div className="flex flex-wrap gap-1 text-lg" aria-label="Oxirgi kunlar">{d.attendance.recent.map((r) => <span key={r.date} title={r.date}>{ST[r.status]}</span>)}</div>
          </>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="h-sc">
        <h2 id="h-sc">Dars jadvali</h2>
        {d.schedule.length === 0 ? <EmptyState icon="🗓️">Jadval hali kiritilmagan.</EmptyState> : DAYS.map((name, i) => {
          const day = d.schedule.filter((s) => s.weekday === i + 1);
          if (day.length === 0) return null;
          return (
            <div key={name} className={`card ${todayIdx === i + 1 ? 'border-brand' : ''}`}>
              <div className="mb-1 font-semibold">{name}{todayIdx === i + 1 ? ' · bugun' : ''}</div>
              {day.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-1">
                  <span className="module-icon h-9 w-9 text-base font-bold">{s.lessonNo}</span>
                  <span><span className="block font-medium">{s.subject}</span><span className="module-sub">{s.startsAt ? `${s.startsAt}–${s.endsAt ?? ''}` : ''}{s.room ? ` · ${s.room}-xona` : ''}</span></span>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
