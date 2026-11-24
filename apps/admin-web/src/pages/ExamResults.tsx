import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatTashkent } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Modal, ReasonDialog, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

interface Row { studentId: string; name: string; className: string; code: string; attempts: number; attemptId: string | null; score: number | null; maxScore: number | null; percent: number | null; passed: boolean | null; finishReason: string | null; submittedAt: string | null; durationMinutes: number | null; suspiciousFast: boolean }
interface Results {
  exam: { id: string; title: string; status: string; passPercent: number; resultsPolicy: string; resultsPublishedAt: string | null; finalPolicy: string };
  summary: { count: number; average: number; median: number; min: number; max: number; passRate: number; buckets: number[] };
  notStarted: number;
  rows: Row[];
}
interface QStat { questionId: string; body: string; shown: number; answered: number; correct: number; correctPercent: number | null; difficulty: string; voided: boolean }
interface Monitor {
  serverNow: string; examStatus: string; totalStudents: number; notStarted: number; inProgress: number; finished: number;
  rows: { attemptId: string; studentId: string; name: string; className: string; deadlineAt: string; answered: number; total: number; lastSyncAt: string | null; lastHeartbeatAt: string | null; leaves: number; reconnects: number; signal: 'ok' | 'silent' }[];
}
interface AttemptRow { id: string; attempt_no: number; status: string; percent: string | null; is_final: boolean; finish_reason: string | null }

const REASON: Record<string, string> = { student: 'o\'zi yakunladi', timeout: 'vaqt tugadi', admin: 'admin', exam_cancelled: 'imtihon bekor qilindi' };
const DIFF: Record<string, string> = { qiyin: 'Qiyin', oson: 'Oson', ortacha: 'O\'rtacha', kam_malumot: 'Ma\'lumot kam' };

function Buckets({ b }: { b: number[] }) {
  const max = Math.max(1, ...b);
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label={`Taqsimot: ${b.join(', ')}`}>
      {b.map((n, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs text-mute">{n || ''}</span>
          <div className="w-full rounded-t bg-brand" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 0 }} />
          <span className="text-[10px] text-mute">{i * 10}</span>
        </div>
      ))}
    </div>
  );
}

function ResultsTab({ id }: { id: string }) {
  const toast = useToast();
  const d = useAsync(() => api<Results>(`/api/admin/exams/${id}/results`), [id]);
  const [pick, setPick] = useState<Row | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Row | null>(null);

  const open = async (r: Row) => {
    setPick(r);
    setAttempts(null);
    try { setAttempts((await api<{ items: AttemptRow[] }>(`/api/admin/exams/${id}/students/${r.studentId}/attempts`)).items); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const publish = async () => {
    try {
      const r = await api<{ notified: number }>(`/api/admin/exams/${id}/publish-results`, { method: 'POST' });
      toast(`E'lon qilindi, ${r.notified} ta o'quvchiga xabar yuboriladi`);
      d.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };

  if (d.loading) return <Spinner />;
  if (d.error || !d.data) return <p role="alert" className="text-danger">{errMsg(d.error)}</p>;
  const { exam, summary, rows } = d.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Topshirgan', `${summary.count} / ${rows.length}`], ['O\'rtacha', `${summary.average}%`], ['Mediana', `${summary.median}%`], ['O\'tganlar', `${summary.passRate}%`], ['Topshirmagan', String(d.data.notStarted)]].map(([k, v]) => (
          <div key={k} className="card"><div className="text-sm text-mute">{k}</div><div className="text-2xl font-bold">{v}</div></div>
        ))}
      </div>
      <div className="card"><h3 className="mb-2 font-semibold">Ballar taqsimoti (foiz oralig'i bo'yicha o'quvchilar soni)</h3><Buckets b={summary.buckets} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <a className="btn-ghost" href={`/api/admin/exams/${id}/report.xlsx`} download>Excel</a>
        <a className="btn-ghost" href={`/api/admin/exams/${id}/report.pdf`} download>PDF</a>
        <a className="btn-ghost" href={`/api/admin/exams/${id}/results.csv`} download>CSV</a>
        <a className="btn-ghost" href={`/api/admin/exams/${id}/report.xlsx?includeKey=1`} download title="Javob kaliti ham qo'shiladi — faqat o'zingiz uchun">Excel + javob kaliti</a>
        {exam.status === 'finished' && (
          <button className="btn" onClick={() => void publish()}>{exam.resultsPublishedAt ? 'Xabarni qayta yuborish' : 'Natijalarni e\'lon qilish'}</button>
        )}
        <span className="text-sm text-mute">
          Natijalar siyosati: {({ after_end: 'imtihon tugagach', immediate: 'darhol', manual: 'admin e\'lon qilganda' } as Record<string, string>)[exam.resultsPolicy]}
          {exam.resultsPublishedAt ? ` · e'lon qilingan: ${formatTashkent(exam.resultsPublishedAt)}` : ''}
        </span>
      </div>
      {rows.length === 0 ? <Empty>Bu imtihonga biriktirilgan faol o'quvchilar yo'q.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">Sinf</th><th className="th">O'quvchi</th><th className="th">Urinish</th><th className="th">Ball</th><th className="th">Foiz</th><th className="th">Natija</th><th className="th">Sabab</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="td">{r.className}</td>
                  <td className="td font-medium">{r.name}{r.suspiciousFast && <span className="ml-2 text-xs text-danger" title="Signal, isbot emas: yuqori natija vaqtning 20% idan kamida topshirilgan">⚑ tez</span>}</td>
                  <td className="td">{r.attempts}</td>
                  <td className="td">{r.score === null ? '—' : `${r.score} / ${r.maxScore}`}</td>
                  <td className="td">{r.percent === null ? '—' : `${r.percent}%`}</td>
                  <td className="td">{r.percent === null ? <span className="text-mute">topshirmagan</span> : r.passed ? 'O\'tdi' : <span className="text-danger">O'tmadi</span>}</td>
                  <td className="td text-sm text-mute">{r.finishReason ? REASON[r.finishReason] ?? r.finishReason : ''}</td>
                  <td className="td whitespace-nowrap text-right">
                    {r.attemptId && r.score !== null && <button className="btn-sm mr-1" onClick={() => setAdjust(r)}>Ballni o'zgartirish</button>}
                    {r.attempts > 1 && <button className="btn-sm" onClick={() => void open(r)}>Urinishlar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pick && (
        <Modal title={`${pick.name}: urinishlar`} onClose={() => setPick(null)}>
          {!attempts ? <Spinner /> : (
            <div className="space-y-3">
              <p className="text-sm text-mute">Yakuniy natija sifatida hisoblanadigan urinishni tanlang (siyosat: {exam.finalPolicy === 'best' ? 'eng yaxshisi' : exam.finalPolicy === 'last' ? 'oxirgisi' : 'admin tanlaydi'}).</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {attempts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                    <span>{a.attempt_no}-urinish · {a.percent === null ? '—' : `${Number(a.percent)}%`} · {a.status}{a.is_final ? ' · YAKUNIY' : ''}</span>
                    {!a.is_final && (a.status === 'submitted' || a.status === 'expired') && <button className="btn-sm" onClick={() => setChosen(a.id)}>Yakuniy qilish</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}
      {adjust && adjust.attemptId && (
        <ReasonDialog title={`${adjust.name}: ballni qo'lda o'zgartirish`} hint={`Hozirgi ball: ${adjust.score} / ${adjust.maxScore}. O'zgarish auditga yoziladi va natijada "qo'lda tuzatilgan" bo'ladi.`} confirmLabel="Saqlash"
          field={{ label: `Yangi ball (0 – ${adjust.maxScore})`, min: 0, max: adjust.maxScore ?? 0, step: 0.01, initial: adjust.score ?? 0 }} onClose={() => setAdjust(null)}
          onConfirm={async (reason, value) => {
            try {
              await api(`/api/admin/attempts/${adjust.attemptId}/adjust-score`, { method: 'POST', body: { score: value, reason } });
              toast('Ball o\'zgartirildi');
              setAdjust(null);
              d.reload();
            } catch (e) { toast(errMsg(e), 'err'); }
          }} />
      )}
      {chosen && (
        <ReasonDialog title="Yakuniy urinishni o'zgartirish" hint="Bu o'quvchining imtihon natijasini o'zgartiradi va auditga yoziladi." confirmLabel="Saqlash" onClose={() => setChosen(null)}
          onConfirm={async (reason) => {
            try {
              await api(`/api/admin/exams/${id}/final-attempt`, { method: 'POST', body: { attemptId: chosen, reason } });
              toast('Saqlandi');
              setChosen(null);
              setPick(null);
              d.reload();
            } catch (e) { toast(errMsg(e), 'err'); }
          }} />
      )}
    </div>
  );
}

function QuestionsTab({ id }: { id: string }) {
  const d = useAsync(() => api<{ items: QStat[] }>(`/api/admin/exams/${id}/question-stats`), [id]);
  if (d.loading) return <Spinner />;
  if (d.error || !d.data) return <p role="alert" className="text-danger">{errMsg(d.error)}</p>;
  if (d.data.items.length === 0) return <Empty>Hali yakunlangan urinishlar yo'q.</Empty>;
  return (
    <div className="card overflow-x-auto p-0">
      <p className="p-3 text-sm text-mute">Eng qiyin savollar tepada. "To'g'ri" — javob berganlar orasida to'g'ri javob berganlar ulushi.</p>
      <table className="w-full">
        <thead><tr><th className="th">Savol</th><th className="th">Berilgan</th><th className="th">Javob bergan</th><th className="th">To'g'ri</th><th className="th">Baho</th></tr></thead>
        <tbody className="divide-y divide-line">
          {d.data.items.map((q) => (
            <tr key={q.questionId} className={q.voided ? 'opacity-50' : ''}>
              <td className="td max-w-md truncate" title={q.body}>{q.body.slice(0, 90)}{q.voided ? ' (bekor qilingan)' : ''}</td>
              <td className="td">{q.shown}</td><td className="td">{q.answered}</td>
              <td className="td">{q.correctPercent === null ? '—' : `${q.correctPercent}%`}</td>
              <td className="td">{DIFF[q.difficulty] ?? q.difficulty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonitorTab({ id }: { id: string }) {
  const toast = useToast();
  const [extra, setExtra] = useState<{ studentId: string; name: string } | null>(null);
  const d = useAsync(() => api<Monitor>(`/api/admin/exams/${id}/monitor`), [id]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => { d.reload(); setNow(Date.now()); }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (d.loading && !d.data) return <Spinner />;
  if (d.error || !d.data) return <p role="alert" className="text-danger">{errMsg(d.error)}</p>;
  const m = d.data;
  const offset = Date.parse(m.serverNow) - now;
  void offset;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Jami o\'quvchi', m.totalStudents], ['Boshlamagan', m.notStarted], ['Hozir topshirmoqda', m.inProgress], ['Yakunlagan', m.finished]].map(([k, v]) => (
          <div key={String(k)} className="card"><div className="text-sm text-mute">{k}</div><div className="text-2xl font-bold">{v}</div></div>
        ))}
      </div>
      <p className="text-sm text-mute">Har 10 soniyada yangilanadi. "Chiqishlar" va "Jim" — signal, aybdorlik isboti emas (telefon qo'ng'irog'i, internet uzilishi ham sabab bo'lishi mumkin).</p>
      {m.rows.length === 0 ? <Empty>Hozir imtihon topshirayotgan o'quvchi yo'q.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">O'quvchi</th><th className="th">Sinf</th><th className="th">Javoblar</th><th className="th">Qolgan vaqt</th><th className="th">Chiqishlar</th><th className="th">Qayta ulanish</th><th className="th">Holat</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {m.rows.map((r) => {
                const left = Math.max(0, Math.round((Date.parse(r.deadlineAt) - Date.parse(m.serverNow)) / 60_000));
                return (
                  <tr key={r.attemptId}>
                    <td className="td font-medium">{r.name}</td><td className="td">{r.className}</td>
                    <td className="td">{r.answered} / {r.total}</td><td className="td">{left} daq</td>
                    <td className="td">{r.leaves}</td><td className="td">{r.reconnects}</td>
                    <td className="td">{r.signal === 'silent' ? <span className="text-danger">Jim (2+ daq)</span> : 'Faol'}</td>
                    <td className="td text-right"><button className="btn-sm" onClick={() => setExtra({ studentId: r.studentId, name: r.name })}>+ vaqt</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {extra && (
        <ReasonDialog title={`${extra.name}: qo'shimcha vaqt`} hint="Faol urinishning tugash vaqti uzaytiriladi. Harakat auditga yoziladi." confirmLabel="Vaqt qo'shish"
          field={{ label: 'Qo\'shimcha daqiqa (1–120)', min: 1, max: 120, initial: 5 }} onClose={() => setExtra(null)}
          onConfirm={async (reason, value) => {
            try {
              await api(`/api/admin/exams/${id}/students/${extra.studentId}/extra-time`, { method: 'POST', body: { minutes: value, reason } });
              toast('Vaqt qo\'shildi');
              setExtra(null);
              d.reload();
            } catch (e) { toast(errMsg(e), 'err'); }
          }} />
      )}
    </div>
  );
}

export function ExamResultsPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<'results' | 'questions' | 'monitor'>('results');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/exams" className="btn-sm">← Imtihonlar</Link>
        <h1 className="text-2xl font-bold">Natijalar va monitoring</h1>
      </div>
      <div role="tablist" className="flex gap-2">
        {([['results', 'Natijalar'], ['questions', 'Savollar tahlili'], ['monitor', 'Jonli monitoring']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn-sm ${tab === k ? 'border-brand font-semibold' : ''}`}>{l}</button>
        ))}
      </div>
      {tab === 'results' && <ResultsTab id={id} />}
      {tab === 'questions' && <QuestionsTab id={id} />}
      {tab === 'monitor' && <MonitorTab id={id} />}
    </div>
  );
}
