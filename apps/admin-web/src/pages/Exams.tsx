import { useState } from 'react';
import { MediaField } from '../components/MediaField';
import { Link } from 'react-router-dom';
import { formatTashkent, isoToTashkentLocal, tashkentLocalToIso, validateExam, examInputSchema } from '@pep/shared';
import type { ClassDto } from '@pep/shared';
import { ApiFail, api, errMsg } from '../lib/api';
import { Empty, Modal, ReasonDialog, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';
import type { TopicRow } from './Questions';

interface ExamRow { id: string; title: string; status: string; source: string; starts_at: string; ends_at: string; duration_minutes: number; question_count: number | null; attempts: number; classes: string[] | null }
interface QRow { id: string; body: string; topic_id: string | null }

const STATUS: Record<string, string> = { draft: 'Qoralama', scheduled: 'E\'lon qilingan', running: 'Davom etmoqda', paused: 'Pauzada', finished: 'Tugagan', cancelled: 'Bekor qilingan' };

/** Holatga ko'ra mumkin bo'lgan amallar (server ham tekshiradi). */
const ACTIONS: Record<string, { to: string; label: string; reason?: boolean }[]> = {
  draft: [{ to: 'scheduled', label: 'E\'lon qilish' }, { to: 'cancelled', label: 'Bekor qilish', reason: true }],
  scheduled: [{ to: 'draft', label: 'Qoralamaga qaytarish' }, { to: 'cancelled', label: 'Bekor qilish', reason: true }],
  running: [{ to: 'paused', label: 'Pauza', reason: true }, { to: 'finished', label: 'Yakunlash' }, { to: 'cancelled', label: 'Bekor qilish', reason: true }],
  paused: [{ to: 'running', label: 'Davom ettirish' }, { to: 'finished', label: 'Yakunlash' }, { to: 'cancelled', label: 'Bekor qilish', reason: true }],
};

function CreateExam({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const topics = useAsync(() => api<{ items: TopicRow[] }>('/api/admin/topics'), []);
  const [qSearch, setQSearch] = useState('');
  const qs = useAsync(() => api<{ items: QRow[] }>(`/api/admin/questions?limit=200${qSearch.trim() ? `&search=${encodeURIComponent(qSearch.trim())}` : ''}`), [qSearch]);

  const now = new Date();
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<'manual' | 'random'>('manual');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [start, setStart] = useState(isoToTashkentLocal(new Date(now.getTime() + 3600_000).toISOString()));
  const [end, setEnd] = useState(isoToTashkentLocal(new Date(now.getTime() + 3 * 3600_000).toISOString()));
  const [duration, setDuration] = useState('40');
  const [count, setCount] = useState('');
  const [dist, setDist] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [pass, setPass] = useState('60');
  const [retake, setRetake] = useState(false);
  const [policy, setPolicy] = useState('best');
  const [results, setResults] = useState('after_end');
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState('');
  const [calc, setCalc] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [wm, setWm] = useState(true);
  const [track, setTrack] = useState(true);
  const [warn, setWarn] = useState('3');
  const [rank, setRank] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    const s = tashkentLocalToIso(start);
    const e = tashkentLocalToIso(end);
    const topicDistribution = Object.fromEntries(Object.entries(dist).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
    const parsed = examInputSchema.safeParse({
      title, source, classIds, startsAt: s ?? 'x', endsAt: e ?? 'x', durationMinutes: Number(duration),
      questionCount: count.trim() ? Number(count) : null, topicDistribution: source === 'random' ? topicDistribution : null,
      questionIds: source === 'manual' && !pdfKey.trim() ? picked : [], pdfAnswerKey: pdfKey.trim() ? pdfKey.trim() : null,
      allowCalculator: calc, allowFormulaSheet: sheet, watermarkEnabled: wm, trackFocusEvents: track, focusWarnThreshold: Number(warn) || 3, showRankings: rank,
      passPercent: Number(pass), retakeAllowed: retake, finalAttemptPolicy: policy, resultsPolicy: results, pdfMediaId: pdfId,
    });
    if (!parsed.success) return setProblems(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    const errs = validateExam(parsed.data);
    if (errs.length) return setProblems(errs);
    setProblems([]);
    setBusy(true);
    try {
      await api('/api/admin/exams', { method: 'POST', body: { ...parsed.data, startsAt: s, endsAt: e } });
      toast('Imtihon yaratildi (qoralama). "E\'lon qilish" bilan o\'quvchilarga oching.');
      onSaved();
    } catch (err) {
      const d = err instanceof ApiFail && Array.isArray(err.details) ? (err.details as unknown[]).map(String) : [];
      setProblems(d.length ? d : [errMsg(err)]);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Yangi imtihon" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">Nomi
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hafta 3 — Nyuton qonunlari" />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Sinflar</legend>
          <div className="flex flex-wrap gap-3">
            {classes.data?.items.map((c) => (
              <label key={c.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={classIds.includes(c.id)} onChange={() => setClassIds(toggle(classIds, c.id))} /> {c.name}</label>
            ))}
            {classes.data?.items.length === 0 && <span className="text-sm text-mute">Avval sinf qo'shing.</span>}
          </div>
        </fieldset>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-medium">Boshlanishi (Toshkent)
            <input type="datetime-local" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Tugashi (Toshkent)
            <input type="datetime-local" className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Davomiyligi (daqiqa)
            <input className="input mt-1" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
        </div>

        <div className="flex gap-4 text-sm">
          <label><input type="radio" checked={source === 'manual'} onChange={() => setSource('manual')} /> Savollarni o'zim tanlayman</label>
          <label><input type="radio" checked={source === 'random'} onChange={() => setSource('random')} /> Bazadan tasodifiy (har o'quvchiga boshqa)</label>
        </div>

        {source === 'manual' ? (
          <div className="space-y-2">
            <input className="input" placeholder="Savol qidirish…" aria-label="Savol qidirish" value={qSearch} onChange={(e) => setQSearch(e.target.value)} />
            <div className="max-h-56 space-y-1 overflow-auto rounded-lg border border-line p-2">
              {qs.loading ? <Spinner /> : qs.data?.items.map((q) => (
                <label key={q.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={picked.includes(q.id)} onChange={() => setPicked(toggle(picked, q.id))} /> <span>{q.body.slice(0, 100)}</span></label>
              ))}
              {!qs.loading && qs.data?.items.length === 0 && <span className="text-sm text-mute">Savollar topilmadi.</span>}
            </div>
            <p className="text-sm text-mute">Tanlangan: {picked.length}. Har o'quvchiga hammasi beriladi{count.trim() ? `, lekin ${count} tasi tasodifiy tanlanadi` : ''}.</p>
            <label className="block text-sm font-medium">Har o'quvchiga nechta savol (bo'sh = hammasi)
              <input className="input mt-1 max-w-[10rem]" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Har o'quvchiga nechta savol
              <input className="input mt-1 max-w-[10rem]" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <p className="text-sm text-mute">Mavzular bo'yicha taqsimot (ixtiyoriy). Yig'indi umumiy sondan oshmasin; qolganlari tanlangan mavzulardan to'ldiriladi.</p>
            <div className="grid grid-cols-2 gap-2">
              {topics.data?.items.map((t) => (
                <label key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.name} <span className="text-mute">({t.questionCount})</span></span>
                  <input className="input w-20" inputMode="numeric" aria-label={`${t.name} soni`} value={dist[t.id] ?? ''} onChange={(e) => setDist({ ...dist, [t.id]: e.target.value })} />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">O'tish bali, %
            <input className="input mt-1" inputMode="numeric" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Natijalar
            <select className="input mt-1" value={results} onChange={(e) => setResults(e.target.value)}>
              <option value="after_end">Imtihon tugagach</option>
              <option value="immediate">Yakunlashdan darhol</option>
              <option value="manual">Men e'lon qilganimda</option>
            </select>
          </label>
          <MediaField label="Imtihon PDF varag'i (ixtiyoriy)" kind="pdf" value={pdfId} onChange={setPdfId} />
          <label className="block text-sm font-medium">PDF rejimi: javoblar kaliti
            <input className="input mt-1 font-mono uppercase" placeholder="masalan: ABCDDABCA" maxLength={200} value={pdfKey} onChange={(e) => setPdfKey(e.target.value.replace(/[^a-dA-D]/g, ''))} />
            <span className="text-xs font-normal text-mute">Har bir topshiriq uchun to'g'ri variant (A–D), tartib bilan. To'ldirilsa, savollar bankidan tanlash o'chadi va PDF majburiy; kalit faqat serverda saqlanadi.</span>
          </label>
          <fieldset className="space-y-1 rounded-lg border border-line p-3 text-sm">
            <legend className="px-1 font-medium">Imtihon sozlamalari</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={calc} onChange={(e) => setCalc(e.target.checked)} /> Kalkulyatorga ruxsat (o'quvchiga eslatma ko'rsatiladi)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} /> Formula varag'iga ruxsat (eslatma)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={wm} onChange={(e) => setWm(e.target.checked)} /> Ekranda o'quvchi nomi bilan watermark</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Sahifadan chiqish hodisalarini qayd etish</label>
            <label className="flex items-center gap-2">Ogohlantirish chegarasi <input className="input w-20" type="number" min={1} max={20} value={warn} onChange={(e) => setWarn(e.target.value)} /> ta chiqishdan keyin o'quvchiga ogohlantirish</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={rank} onChange={(e) => setRank(e.target.checked)} /> O'quvchi natijada o'z o'rnini ko'rsin (boshqalarning ismi ko'rinmaydi)</label>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retake} onChange={(e) => setRetake(e.target.checked)} /> Qayta topshirishga ruxsat</label>
          <label className="block text-sm font-medium">Yakuniy urinish
            <select className="input mt-1" value={policy} onChange={(e) => setPolicy(e.target.value)}>
              <option value="best">Eng yaxshisi</option>
              <option value="last">Oxirgisi</option>
              <option value="admin_choice">Men tanlayman</option>
            </select>
          </label>
        </div>

        {problems.length > 0 && <ul role="alert" className="list-disc rounded-lg border border-danger p-3 pl-6 text-sm text-danger">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn" disabled={busy} onClick={() => void save()}>Yaratish</button>
        </div>
      </div>
    </Modal>
  );
}


interface Detail {
  id: string; title: string; status: string;
  questions: { id: string; body: string; isVoided: boolean }[];
  students: { id: string; name: string; className: string; attempts: number; bestPercent: number | null; hasOpenGrant: boolean }[];
}

function ExamDetail({ examId, onClose, onChanged }: { examId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const d = useAsync(() => api<Detail>(`/api/admin/exams/${examId}`), [examId]);
  const [act, setAct] = useState<{ kind: 'void' | 'retake'; id: string; label: string } | null>(null);

  return (
    <Modal title={d.data ? `Imtihon: ${d.data.title}` : 'Imtihon'} onClose={onClose}>
      {d.loading ? <Spinner /> : d.error || !d.data ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-1 font-semibold">Savollar</h3>
            <p className="mb-2 text-xs text-mute">Xato savolni bekor qilsangiz, u hamma natijalardan chiqariladi va yakunlangan urinishlar qayta hisoblanadi.</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {d.data.questions.length === 0 && <li className="p-2 text-sm text-mute">Savollar tasodifiy tanlanadi (har o'quvchiga boshqa), bekor qilish uchun savollar ro'yxati yo'q.</li>}
              {d.data.questions.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span className={q.isVoided ? 'text-mute line-through' : ''}>{q.body.slice(0, 90)}</span>
                  {q.isVoided ? <span className="text-xs text-mute">Bekor qilingan</span> : <button className="btn-sm" onClick={() => setAct({ kind: 'void', id: q.id, label: q.body.slice(0, 60) })}>Bekor qilish</button>}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 font-semibold">O'quvchilar</h3>
            <p className="mb-2 text-xs text-mute">Qayta topshirishga ruxsat bir martalik: o'quvchi bitta qo'shimcha urinish oladi.</p>
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr><th className="th">O'quvchi</th><th className="th">Sinf</th><th className="th">Urinish</th><th className="th">Eng yaxshi</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.data.students.map((s) => (
                    <tr key={s.id}>
                      <td className="td">{s.name}</td><td className="td">{s.className}</td><td className="td">{s.attempts}</td>
                      <td className="td">{s.bestPercent === null ? '—' : `${s.bestPercent}%`}</td>
                      <td className="td text-right">
                        {s.hasOpenGrant ? <span className="text-xs text-mute">Ruxsat berilgan</span> :
                          <button className="btn-sm" disabled={s.attempts === 0} title={s.attempts === 0 ? 'Hali topshirmagan' : undefined} onClick={() => setAct({ kind: 'retake', id: s.id, label: s.name })}>Qayta topshirishga ruxsat</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {act && (
        <ReasonDialog
          title={act.kind === 'void' ? 'Savolni bekor qilish' : 'Qayta topshirishga ruxsat'}
          hint={act.kind === 'void' ? `"${act.label}" savoli barcha natijalardan chiqariladi. Bu amal auditga yoziladi.` : `${act.label} ga bitta qo'shimcha urinish beriladi.`}
          confirmLabel={act.kind === 'void' ? 'Bekor qilish' : 'Ruxsat berish'}
          onClose={() => setAct(null)}
          onConfirm={async (reason) => {
            try {
              if (act.kind === 'void') {
                const r = await api<{ recalculated: number }>(`/api/admin/exams/${examId}/void-question`, { method: 'POST', body: { questionId: act.id, reason } });
                toast(`Bekor qilindi, ${r.recalculated} ta natija qayta hisoblandi`);
              } else {
                await api(`/api/admin/exams/${examId}/retake`, { method: 'POST', body: { studentId: act.id, reason } });
                toast('Ruxsat berildi');
              }
              setAct(null);
              d.reload();
              onChanged();
            } catch (e) { toast(errMsg(e), 'err'); }
          }}
        />
      )}
    </Modal>
  );
}

export function ExamsPage() {
  const toast = useToast();
  const list = useAsync(() => api<{ items: ExamRow[] }>('/api/admin/exams'), []);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ exam: ExamRow; to: string; label: string } | null>(null);

  const change = async (e: ExamRow, to: string, reason?: string) => {
    try {
      await api(`/api/admin/exams/${e.id}/status`, { method: 'POST', body: { to, ...(reason ? { reason } : {}) } });
      toast('Bajarildi');
      list.reload();
    } catch (err) { toast(errMsg(err), 'err'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Imtihonlar</h1>
        <button className="btn" onClick={() => setCreating(true)}>+ Imtihon</button>
      </div>
      {list.loading ? <Spinner /> : list.error || !list.data ? <p role="alert" className="text-danger">{errMsg(list.error)}</p> : list.data.items.length === 0 ? (
        <Empty>Imtihonlar yo'q. Avval savollar bankiga savol qo'shing, so'ng imtihon yarating.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">Nomi</th><th className="th">Sinflar</th><th className="th">Vaqti (Toshkent)</th><th className="th">Holat</th><th className="th">Urinishlar</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((e) => (
                <tr key={e.id}>
                  <td className="td font-medium">{e.title}<div className="text-xs text-mute">{e.source === 'random' ? 'Tasodifiy' : 'Qo\'lda'} · {e.duration_minutes} daq{e.question_count ? ` · ${e.question_count} savol` : ''}</div></td>
                  <td className="td">{(e.classes ?? []).join(', ')}</td>
                  <td className="td text-sm">{formatTashkent(e.starts_at)}<br />{formatTashkent(e.ends_at)}</td>
                  <td className="td">{STATUS[e.status] ?? e.status}</td>
                  <td className="td">{e.attempts}</td>
                  <td className="td space-x-2 text-right">
                    <Link className="btn-sm" to={`/exams/${e.id}/results`}>Natijalar</Link>
                    <button className="btn-sm" onClick={() => setDetailId(e.id)}>Tafsilot</button>
                    {(ACTIONS[e.status] ?? []).map((a) => (
                      <button key={a.to} className="btn-sm" onClick={() => (a.reason ? setReasonFor({ exam: e, to: a.to, label: a.label }) : void change(e, a.to))}>{a.label}</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailId && <ExamDetail examId={detailId} onClose={() => setDetailId(null)} onChanged={list.reload} />}
      {creating && <CreateExam onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload(); }} />}
      {reasonFor && (
        <ReasonDialog title={`${reasonFor.label}: ${reasonFor.exam.title}`} hint={reasonFor.to === 'cancelled' ? 'Faol urinishlar yopiladi. Bu amalni qaytarib bo\'lmaydi.' : 'Pauzada o\'quvchilar javob saqlay olmaydi; davom ettirilganda ularning vaqti pauza davomiyligicha uzayadi.'}
          confirmLabel={reasonFor.label} onClose={() => setReasonFor(null)}
          onConfirm={async (reason) => { await change(reasonFor.exam, reasonFor.to, reason); setReasonFor(null); }} />
      )}
    </div>
  );
}
