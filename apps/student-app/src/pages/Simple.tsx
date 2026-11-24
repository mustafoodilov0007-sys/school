import { useEffect, useState } from 'react';
import { t } from '@pep/shared';
import type { ReviewQuestion, StudentAnalyticsDto, StudentResultDto } from '@pep/shared';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { MathText } from '../components/MathText';
import { QuestionImage } from '../components/Media';
import { api, apiSend } from '../lib/api';

const when = (iso: string) => new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function ComplaintBox({ attemptId, attemptQuestionId, label }: { attemptId: string; attemptQuestionId: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const send = async () => {
    setState('sending');
    try {
      const r = await apiSend('POST', `/api/student/attempts/${attemptId}/complaints`, { attemptQuestionId, body: text });
      if (r.status === 201) { setState('sent'); return; }
      setState((r.json as { error?: { message?: string } } | null)?.error?.message ?? 'Yuborib bo\'lmadi');
    } catch { setState('Internet bilan aloqa yo\'q'); }
  };
  if (state === 'sent') return <p className="text-sm text-green-600" role="status">Shikoyat yuborildi. O'qituvchi ko'rib chiqadi.</p>;
  if (!open) return <button className="btn-sm" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={`c-${attemptQuestionId ?? 'all'}`}>Nima noto'g'ri deb o'ylaysiz?</label>
      <textarea id={`c-${attemptQuestionId ?? 'all'}`} className="input min-h-20" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      {state !== 'idle' && state !== 'sending' && <p role="alert" className="text-sm text-danger">{state}</p>}
      <div className="flex gap-2">
        <button className="btn-sm" disabled={text.trim().length < 3 || state === 'sending'} onClick={() => void send()}>Yuborish</button>
        <button className="btn-sm" onClick={() => setOpen(false)}>Bekor qilish</button>
      </div>
    </div>
  );
}

function Review({ attemptId, onBack }: { attemptId: string; onBack: () => void }) {
  const [data, setData] = useState<{ examTitle: string; questions: ReviewQuestion[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<{ examTitle: string; questions: ReviewQuestion[] }>(`/api/student/results/${attemptId}`).then(setData, () => setError(true));
  }, [attemptId]);
  if (error) return <ErrorState message={t('app_err_generic')} onRetry={onBack} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-3 p-4">
      <button className="btn-ghost" onClick={onBack}>← Orqaga</button>
      <h1 className="text-xl font-bold">{data.examTitle}</h1>
      {data.questions.map((q) => (
        <section key={q.position} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm text-mute">{q.position + 1}-savol</span>
            <span className="text-sm">{q.voided ? 'Bekor qilingan' : q.isCorrect ? '✓ To\'g\'ri' : q.isCorrect === false ? '✗ Noto\'g\'ri' : 'Javobsiz'} · {q.pointsAwarded ?? 0}/{q.points}</span>
          </div>
          <div><MathText text={q.body} /></div>
          <QuestionImage mediaId={q.imageMediaId} />
          {q.numeric ? (
            <p className="text-sm">Sizning javobingiz: <b>{q.numeric.yours ?? '—'}</b> · To'g'ri javob: <b>{q.numeric.expected}</b></p>
          ) : (
            <ul className="space-y-1">
              {q.options.map((o) => (
                <li key={o.id} className={`rounded-lg border p-2 text-sm ${o.correct ? 'border-green-600' : o.selected ? 'border-danger' : 'border-line'}`}>
                  {o.correct ? '✓ ' : o.selected ? '✗ ' : ''}<MathText text={o.body} />{o.selected ? ' (sizning tanlovingiz)' : ''}
                </li>
              ))}
            </ul>
          )}
          {q.explanation && <p className="rounded-lg bg-bg p-2 text-sm"><b>Izoh: </b><MathText text={q.explanation} /></p>}
          <ComplaintBox attemptId={attemptId} attemptQuestionId={q.id} label="Bu savol bo'yicha shikoyat" />
        </section>
      ))}
      <div className="card"><ComplaintBox attemptId={attemptId} attemptQuestionId={null} label="Umumiy shikoyat" /></div>
    </div>
  );
}

export function ResultsPage() {
  const [items, setItems] = useState<StudentResultDto[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: StudentResultDto[] }>('/api/student/results').then((r) => setItems(r.items), () => setError(true));
  }, []);
  if (open) return <Review attemptId={open} onBack={() => setOpen(null)} />;
  if (error) return <ErrorState message={t('app_err_generic')} />;
  if (!items) return <Loading />;
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{t('app_nav_results')}</h1>
      {items.length === 0 && <EmptyState icon="📊">{t('app_results_empty')}</EmptyState>}
      {items.length > 0 && <Analytics />}
      {items.map((r) => (
        <button key={r.attemptId} onClick={() => setOpen(r.attemptId)} className="card w-full space-y-1 text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">{r.title}</span>
            <span className={r.passed ? 'text-green-600' : 'text-danger'}>{r.passed ? 'O\'tdi' : 'O\'tmadi'}</span>
          </div>
          <div className="text-2xl font-bold">{r.percent}%</div>
          <div className="text-sm text-mute">{r.score} / {r.maxScore} ball · {when(r.submittedAt)}{r.attemptNo > 1 ? ` · ${r.attemptNo}-urinish` : ''}{r.rank !== null && r.rankTotal !== null ? ` · o'rin: ${r.rank}/${r.rankTotal}` : ''}</div>
        </button>
      ))}
    </div>
  );
}

/** O'z natijalar dinamikasi (SVG, ranglarga bog'liq emas) va mavzular bo'yicha o'zlashtirish. */
function Analytics() {
  const [a, setA] = useState<StudentAnalyticsDto | null>(null);
  useEffect(() => { api<StudentAnalyticsDto>('/api/student/analytics').then(setA, () => undefined); }, []);
  if (!a || a.history.length === 0) return null;
  const W = 300, H = 90, P = 8;
  const pts = a.history.map((h, i) => [P + (a.history.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (a.history.length - 1)), H - P - (h.percent / 100) * (H - 2 * P)] as const);
  const strong = [...a.topics].sort((x, y) => y.percent - x.percent);
  return (
    <section className="card space-y-3" aria-label="Tahlil">
      <h2 className="font-semibold">Natijalar dinamikasi</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Oxirgi natijalar: ${a.history.map((h) => `${h.percent}%`).join(', ')}`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="currentColor" opacity="0.2" />
        <polyline fill="none" stroke="rgb(var(--c-brand))" strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="rgb(var(--c-brand))" />)}
      </svg>
      {strong.length > 0 && (
        <>
          <h2 className="font-semibold">Mavzular bo'yicha</h2>
          <ul className="space-y-2">
            {strong.map((tp) => (
              <li key={tp.topic} className="text-sm">
                <div className="flex justify-between"><span>{tp.topic}</span><span>{tp.percent}% {tp.percent >= 80 ? '· kuchli' : tp.percent < 50 ? '· mustahkamlash kerak' : ''}</span></div>
                <div className="h-2 rounded bg-bg" role="presentation"><div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, tp.percent)}%` }} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
