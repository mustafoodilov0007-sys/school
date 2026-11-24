import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import type { DashboardDto } from '@pep/shared';
import { formatTashkent } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Spinner, useAsync } from '../components/ui';

const TEACHER_MODULES = new Set(['/journal', '/attendance', '/schedule']);
const MODULES = [
  { to: '/exams', icon: '📝', title: 'Imtihonlar', sub: 'Yaratish, jadval va natijalar' },
  { to: '/questions', icon: '❓', title: 'Savollar banki', sub: 'Savol, rasm va formulalar' },
  { to: '/journal', icon: '📒', title: 'Elektron jurnal', sub: 'Baholar va o\'rtacha ball' },
  { to: '/attendance', icon: '✅', title: 'Davomat', sub: 'Kelgan-kelmaganlar' },
  { to: '/schedule', icon: '🗓️', title: 'Dars jadvali', sub: 'Haftalik dars taqsimoti' },
  { to: '/students', icon: '🎓', title: "O'quvchilar", sub: 'Profil va Telegram bog\'lanishi' },
  { to: '/classes', icon: '🏫', title: 'Sinflar', sub: "Sinf va o'quvchilar tarkibi" },
  { to: '/reports', icon: '📊', title: 'Hisobotlar', sub: "O'zlashtirish statistikasi, Excel/PDF" },
  { to: '/messages', icon: '✉️', title: 'Xabar yuborish', sub: "O'quvchilar bilan aloqa" },
  { to: '/materials', icon: '📚', title: 'Materiallar', sub: "O'quv materiallari" },
  { to: '/complaints', icon: '💬', title: 'Shikoyatlar', sub: "Murojaatlar va javoblar" },
];

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="card">
    <div className="text-sm text-mute">{label}</div>
    <div className="text-3xl font-bold">{value}</div>
  </div>
);

interface BackupRow { id: string; status: string; file_name: string | null; size_bytes: string | null; started_at: string; error: string | null; restore_tested_at: string | null }

function PublicToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const toast = useToast();
  useEffect(() => { api<{ showLeaders: boolean }>('/api/admin/settings/public').then((r) => setOn(r.showLeaders), () => undefined); }, []);
  if (on === null) return null;
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3" aria-label="Ochiq sahifa">
      <div><h2 className="font-semibold">Ochiq bosh sahifa</h2><p className="text-sm text-mute">Hafta va oy o'quvchisini loginsiz ko'rsatish (faqat «Ism F.» va sinf).</p></div>
      <button className="btn-sm" role="switch" aria-checked={on} onClick={async () => {
        try { await api('/api/admin/settings/public', { method: 'PUT', body: { showLeaders: !on } }); setOn(!on); toast(!on ? 'Yoqildi' : "O'chirildi"); } catch (e) { toast(errMsg(e), 'err'); }
      }}>{on ? '✅ Yoqilgan' : '⛔ O\'chirilgan'}</button>
    </section>
  );
}

export function Dashboard() {
  const { data, error, loading } = useAsync(() => api<DashboardDto>('/api/admin/dashboard'), []);
  const backups = useAsync(() => api<{ items: BackupRow[] }>('/api/admin/backups'), []);
  if (loading) return <Spinner />;
  if (error || !data) return <p role="alert" className="text-danger">{errMsg(error)}</p>;
  const isAdmin = data.role === 'admin';
  const o = data.overview;
  const att = o.attendanceToday;
  return (
    <div className="space-y-6">
      <div className="hero"><h1 className="text-2xl font-bold">Physics Exam Pro</h1><small>{isAdmin ? 'Administrator — umumiy boshqaruv paneli' : "O'qituvchi paneli — faqat sizga biriktirilgan sinflar"}</small></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={isAdmin ? 'Faol sinflar' : 'Mening sinflarim'} value={data.classes} />
        <Stat label="Faol o'quvchilar" value={data.students.active} />
        {isAdmin && <Stat label="O'qituvchilar" value={o.teachers ?? 0} />}
        {isAdmin && o.parents && <Stat label="Ota-onalar (bog'langan)" value={`${o.parents.linked}/${o.parents.total}`} />}
        <Stat label="Bugungi davomat" value={att.marked === 0 ? '—' : `${Math.round(((att.present + att.late) / att.marked) * 100)}%`} />
        <Stat label="O'rtacha baho (30 kun)" value={o.avgGrade30 ?? '—'} />
        {isAdmin && <Stat label="Telegramga bog'langan" value={data.students.linked} />}
        {isAdmin && <Stat label="Hali bog'lanmagan" value={data.students.unlinked} />}
      </div>
      <section className="card" aria-labelledby="h-att">
        <h2 id="h-att" className="mb-2 font-semibold">Bugungi davomat</h2>
        {att.marked === 0 ? <p className="text-sm text-mute">Bugun hali davomat belgilanmagan ({att.expected} ta o'quvchi kutilmoqda).</p> : (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge-ok">Keldi: {att.present}</span><span className="badge-danger">Kelmadi: {att.absent}</span>
            <span className="badge-warn">Kechikdi: {att.late}</span><span className="badge">Sababli: {att.excused}</span>
            <span className="text-mute">Belgilangan: {att.marked} / {att.expected}</span>
          </div>
        )}
      </section>
      <section className="card" aria-labelledby="h-ex">
        <h2 id="h-ex" className="mb-2 font-semibold">Yaqin imtihonlar</h2>
        {o.upcomingExams.length === 0 ? <p className="text-sm text-mute">Rejalashtirilgan imtihon yo'q.</p> : (
          <ul className="divide-y divide-line text-sm">
            {o.upcomingExams.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-2"><span>{e.title}</span><span className="text-mute">{formatTashkent(e.startsAt)}{e.status === 'running' ? ' · davom etmoqda' : ''}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="h-mod">
        <h2 id="h-mod" className="mb-2 font-semibold">Modullar</h2>
        <div className="grid gap-x-4 md:grid-cols-2">
          {MODULES.filter((m) => isAdmin || TEACHER_MODULES.has(m.to)).map((m) => (
            <Link key={m.to} to={m.to} className="module-row">
              <span className="module-icon" aria-hidden="true">{m.icon}</span>
              <span><span className="module-title block">{m.title}</span><span className="module-sub">{m.sub}</span></span>
              <span className="chev" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>
      {isAdmin && <PublicToggle />}
      {isAdmin && <section className="card">
        <h2 className="mb-2 font-semibold">Tizim holati</h2>
        <ul className="space-y-1 text-sm">
          <li>Ma'lumotlar bazasi: {data.system.dbOk ? '✅ ishlayapti' : '❌ xato'}</li>
          <li>Server vaqti: {formatTashkent(data.system.serverTime)} (Toshkent)</li>
          <li>Oxirgi zaxira nusxasi: {data.system.lastBackupAt ? `${formatTashkent(data.system.lastBackupAt)} (${data.system.lastBackupStatus ?? ''})` : 'hali yo\'q — docs/BACKUP.md bo\'yicha zaxira skriptini ishga tushiring'}</li>
        </ul>
      </section>}
      {isAdmin && <section className="card">
        <h2 className="mb-2 font-semibold">Zaxira nusxalar</h2>
        {!backups.data || backups.data.items.length === 0 ? <p className="text-sm text-mute">Yozuv yo'q. Zaxira skripti ishga tushirilganda shu yerda ko'rinadi (docs/BACKUP.md).</p> : (
          <ul className="divide-y divide-line text-sm">
            {backups.data.items.slice(0, 7).map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{b.status === 'ok' ? '✅' : b.status === 'failed' ? '❌' : '⏳'} {b.file_name ?? '—'}{b.size_bytes ? ` · ${(Number(b.size_bytes) / 1048576).toFixed(1)} MB` : ''}{b.error ? ` · ${b.error.slice(0, 80)}` : ''}</span>
                <span className="text-mute">{formatTashkent(b.started_at)}{b.restore_tested_at ? ' · tiklash sinalgan ✔' : ' · tiklash sinalmagan'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>}
      {isAdmin && <section className="card">
        <h2 className="mb-2 font-semibold">Oxirgi harakatlar</h2>
        {data.recentAudit.length === 0 ? <p className="text-mute">Hali harakatlar yo'q</p> : (
          <ul className="divide-y divide-line text-sm">
            {data.recentAudit.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 py-2">
                <span>{a.action}</span>
                <span className="text-mute">{formatTashkent(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </div>
  );
}
