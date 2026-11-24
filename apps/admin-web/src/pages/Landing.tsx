import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Leader { name: string; className: string; percent: number; exams: number }
interface Board { label: string; previous: boolean; items: Leader[] }
interface Home {
  botUsername: string | null;
  stats: { classes: number; students: number; examsThisMonth: number; avgPercentMonth: number | null };
  leaders: { week: Board; month: Board } | null;
}

const Tile = ({ icon, label, value }: { icon: string; label: string; value: string | number }) => (
  <div className="card flex items-center gap-3">
    <span className="module-icon" aria-hidden="true">{icon}</span>
    <div><div className="text-2xl font-bold leading-none">{value}</div><div className="module-sub">{label}</div></div>
  </div>
);

function LeaderCard({ title, icon, board }: { title: string; icon: string; board: Board }) {
  const [first, ...rest] = board.items;
  return (
    <section className="card space-y-3" aria-label={title}>
      <div className="flex items-center justify-between"><h2>{icon} {title}</h2>{board.label && <span className="badge">{board.label}</span>}</div>
      {!first ? <p className="text-sm text-mute">Hali natija yo'q. Birinchi imtihondan keyin shu yerda ko'rinadi.</p> : (
        <>
          <div className="hero flex items-center gap-3">
            <span className="text-4xl" aria-hidden="true">🏆</span>
            <div><div className="text-xl font-bold">{first.name}</div><small>{first.className} sinf · o'rtacha {first.percent}% · {first.exams} ta imtihon</small></div>
          </div>
          {rest.length > 0 && (
            <ol start={2} className="divide-y divide-line text-sm">
              {rest.map((l, i) => (
                <li key={`${l.name}-${i}`} className="flex items-center justify-between gap-2 py-2">
                  <span><b className="mr-2 text-mute">{i + 2}.</b>{l.name} <span className="text-mute">· {l.className}</span></span><b>{l.percent}%</b>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

/** Ochiq bosh sahifa: login/parol so'ramaydi. Faqat umumiy ko'rsatkichlar va "Ism F." ko'rinishidagi hafta/oy o'quvchisi. */
export function Landing() {
  const [d, setD] = useState<Home | null>(null);
  useEffect(() => { fetch('/api/public/home').then((r) => (r.ok ? r.json() : null)).then((j: Home | null) => setD(j), () => setD(null)); }, []);
  const bot = d?.botUsername ? `https://t.me/${d.botUsername}` : null;
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:py-8">
      <header className="hero">
        <h1 className="text-2xl font-bold md:text-3xl">⚛️ Physics Exam Pro</h1>
        <small>Maktab fizika imtihonlari va elektron jurnal — yagona platforma</small>
      </header>

      {/* Kirish: 2 qism */}
      <section aria-labelledby="h-in" className="space-y-2">
        <h2 id="h-in">Kirish</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card flex flex-col gap-3">
            <div className="flex items-start gap-3"><span className="module-icon" aria-hidden="true">🎓</span>
              <div><div className="module-title">O'quvchi va ota-ona</div><div className="module-sub">Telegram orqali — login va parol kerak emas</div></div></div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
              <li>Maktab Telegram botini oching va <b className="text-ink">/start</b> yuboring.</li>
              <li>O'quvchi — o'z ID kodini kiriting. Ota-ona — maktab bergan <b className="text-ink">OT-XXXXXX</b> kodni Mini App'da kiriting.</li>
              <li>«Imtihon» tugmasi orqali Mini App'ni oching.</li>
            </ol>
            {bot ? <a className="btn mt-auto" href={bot} rel="noopener noreferrer">Telegram botni ochish</a> : <p className="mt-auto text-sm text-mute">Bot manzilini maktabdan so'rang.</p>}
          </div>
          <div className="card flex flex-col gap-3">
            <div className="flex items-start gap-3"><span className="module-icon" aria-hidden="true">👨‍🏫</span>
              <div><div className="module-title">O'qituvchi va administrator</div><div className="module-sub">Botdagi buyruq orqali xavfsiz kirish</div></div></div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
              <li>Botda <code className="rounded bg-soft px-1.5 py-0.5 font-bold text-ink">/admin</code> buyrug'ini yuboring.</li>
              <li>Bot bergan bir martalik havolani shu brauzerda oching (5 daqiqa amal qiladi).</li>
            </ol>
            <Link to="/login" className="btn-ghost mt-auto">Kirish yo'riqnomasi</Link>
          </div>
        </div>
      </section>

      {d && (
        <section aria-labelledby="h-st" className="space-y-2">
          <h2 id="h-st">Maktab bir qarashda</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon="🏫" label="Sinflar" value={d.stats.classes} />
            <Tile icon="🎓" label="O'quvchilar" value={d.stats.students} />
            <Tile icon="📝" label="Shu oy imtihonlar" value={d.stats.examsThisMonth} />
            <Tile icon="📊" label="Shu oy o'rtacha natija" value={d.stats.avgPercentMonth === null ? '—' : `${d.stats.avgPercentMonth}%`} />
          </div>
        </section>
      )}

      {d?.leaders && (
        <section aria-labelledby="h-lead" className="space-y-2">
          <h2 id="h-lead">Eng yaxshi o'quvchilar</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <LeaderCard title="Hafta o'quvchisi" icon="⭐" board={d.leaders.week} />
            <LeaderCard title="Oy o'quvchisi" icon="🌟" board={d.leaders.month} />
          </div>
          <p className="text-xs text-mute">Reyting e'lon qilingan imtihon natijalarining o'rtacha foiziga asoslanadi. Maxfiylik uchun faqat ism va familiya bosh harfi ko'rsatiladi.</p>
        </section>
      )}

      <footer className="pb-6 text-center text-xs text-mute">Physics Exam Pro · maktab fizika platformasi</footer>
    </div>
  );
}
