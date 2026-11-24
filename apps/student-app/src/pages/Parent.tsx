import { useEffect, useState } from 'react';
import type { StudentResultDto } from '@pep/shared';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { api } from '../lib/api';
import type { ParentMe } from '../lib/api';
import { SchoolPage } from './School';

const when = (iso: string) => new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Results({ childId }: { childId: string }) {
  const [items, setItems] = useState<StudentResultDto[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setItems(null); api<{ items: StudentResultDto[] }>(`/api/parent/children/${childId}/results`).then((r) => setItems(r.items), () => setErr(true)); }, [childId]);
  if (err) return <ErrorState message="Yuklab bo'lmadi" />;
  if (!items) return <Loading />;
  return (
    <div className="space-y-3 p-4">
      <header className="hero"><h1 className="text-2xl font-bold">Imtihon natijalari</h1><small>E'lon qilingan natijalar</small></header>
      {items.length === 0 && <EmptyState icon="📊">Hali natija yo'q.</EmptyState>}
      {items.map((r) => (
        <div key={r.attemptId} className="card space-y-1">
          <div className="flex items-start justify-between gap-2"><span className="font-semibold">{r.title}</span><span className={r.passed ? 'badge-ok' : 'badge-danger'}>{r.passed ? "O'tdi" : "O'tmadi"}</span></div>
          <div className="text-2xl font-bold">{r.percent}%</div>
          <div className="text-sm text-mute">{r.score} / {r.maxScore} ball · {when(r.submittedAt)}</div>
        </div>
      ))}
    </div>
  );
}

/** Ota-ona ko'rinishi: farzand tanlanadi, so'ng maktab ma'lumotlari va imtihon natijalari (faqat o'qish). */
export function ParentApp({ parent }: { parent: ParentMe }) {
  const [childId, setChildId] = useState(parent.children[0]?.id ?? '');
  const [tab, setTab] = useState<'school' | 'results'>('school');
  const child = parent.children.find((c) => c.id === childId);
  if (!child) return <div className="p-4"><EmptyState icon="👪">Sizga hali farzand biriktirilmagan. Maktabga murojaat qiling.</EmptyState></div>;
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      <div className="space-y-2 p-4 pb-0">
        <div className="text-sm text-mute">Assalomu alaykum, {parent.firstName}</div>
        {parent.children.length > 1 ? (
          <select className="input w-full" aria-label="Farzand" value={childId} onChange={(e) => setChildId(e.target.value)}>
            {parent.children.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.className}</option>)}
          </select>
        ) : <div className="font-semibold">{child.name} · {child.className}</div>}
      </div>
      <main className="flex-1 pb-24">
        {tab === 'school' ? <SchoolPage key={childId} endpoint={`/api/parent/children/${childId}/school`} title={child.name} /> : <Results childId={childId} />}
      </main>
      <nav aria-label="Asosiy navigatsiya" className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-xl">
          {([['school', '🏫', 'Maktab'], ['results', '📊', 'Natijalar']] as const).map(([id, icon, label]) => (
            <li key={id} className="flex-1">
              <button onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs ${tab === id ? 'font-semibold text-brand' : 'text-mute'}`}>
                <span aria-hidden="true" className="text-lg">{icon}</span>{label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
