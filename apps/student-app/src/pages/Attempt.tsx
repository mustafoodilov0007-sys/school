import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clockOffsetMs, formatRemaining, remainingMs } from '@pep/shared';
import type { AttemptDto, AttemptQuestionDto } from '@pep/shared';
import { MathText } from '../components/MathText';
import { ExamPdf, QuestionImage } from '../components/Media';
import { api, apiSend } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setClosingConfirmation } from '../lib/telegram';
import { AnswerSync } from '../lib/exam-sync';
import type { SyncState } from '../lib/exam-sync';

interface Local {
  selected: string[];
  numeric: string;
  flagged: boolean;
}

function initialLocal(q: AttemptQuestionDto): Local {
  return {
    selected: q.answer?.selectedOptionIds ?? [],
    numeric: q.answer?.numericValue != null ? String(q.answer.numericValue) : '',
    flagged: q.answer?.isFlagged ?? false,
  };
}

const parseNum = (s: string): number | null => {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

interface FinishInfo {
  status: string;
  score?: number;
  maxScore?: number;
  percent?: number;
  passed?: boolean;
}

/** Ekran suratga olinsa ham kim ekanligi ko'rinadi (to'sib bo'lmaydi — faqat to'xtatuvchi vosita). */
function Watermark({ text }: { text: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5] overflow-hidden select-none">
      <div className="absolute -inset-1/2 flex -rotate-[24deg] flex-wrap content-start gap-x-16 gap-y-10 opacity-[0.07]">
        {Array.from({ length: 160 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-semibold">{text}</span>
        ))}
      </div>
    </div>
  );
}

export function AttemptView({ initial, onExit }: { initial: AttemptDto; onExit: () => void }) {
  const { state: auth } = useAuth();
  const me = auth.status === 'ready' ? auth.student : null;
  const offset = useMemo(() => clockOffsetMs(initial.serverNow, Date.now()), [initial.serverNow]);
  const [left, setLeft] = useState(() => remainingMs(initial.deadlineAt, Date.now(), offset));
  const [idx, setIdx] = useState(0);
  const [local, setLocal] = useState<Record<string, Local>>(() => Object.fromEntries(initial.questions.map((q) => [q.id, initialLocal(q)])));
  const [sync, setSync] = useState<SyncState>({ pending: 0, online: true, late: false });
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<FinishInfo | null>(initial.status === 'in_progress' ? null : { status: initial.status });
  const [finishError, setFinishError] = useState<string | null>(null);
  const [leaves, setLeaves] = useState(0);
  const syncRef = useRef<AnswerSync | null>(null);
  const autoFinished = useRef(false);

  const qs = initial.questions;
  const q = qs[idx] as AttemptQuestionDto;

  // Sinxronizator: sahifa hayoti davomida bitta
  useEffect(() => {
    if (done) return;
    const versions = Object.fromEntries(qs.map((x) => [x.id, x.answer?.version ?? 0]));
    const s = new AnswerSync(initial.id, versions, setSync, (qid, v) =>
      setLocal((cur) => ({ ...cur, [qid]: { ...(cur[qid] as Local), selected: v.selectedOptionIds, numeric: v.numericValue === null ? '' : String(v.numericValue) } })),
    );
    syncRef.current = s;
    const onOnline = () => s.retryNow();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      s.stop();
      syncRef.current = null;
    };
  }, [initial.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yurak urishi (har 20 s) va sahifa hodisalari: serverda monitoring uchun signal sifatida saqlanadi (best-effort)
  useEffect(() => {
    if (done) return;
    const beat = () =>
      apiSend('POST', `/api/student/attempts/${initial.id}/heartbeat`).then(
        (r) => {
          const b = r.json as { status?: string } | null;
          if (r.status === 200 && b?.status && b.status !== 'in_progress') setDone({ status: b.status });
        },
        () => undefined,
      );
    const hb = setInterval(() => void beat(), 20_000);
    let buf: { kind: string; clientTs: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const events = buf.splice(0, 20);
      if (events.length) void apiSend('POST', `/api/student/attempts/${initial.id}/events`, { events }).catch(() => undefined);
    };
    const push = (kind: string) => {
      if (!initial.trackEvents) return;
      buf.push({ kind, clientTs: new Date().toISOString() });
      if (!timer) timer = setTimeout(flush, 1500);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') setLeaves((n) => n + 1);
      push(document.visibilityState === 'hidden' ? 'visibility_hidden' : 'visibility_visible');
    };
    const onBlur = () => push('blur');
    const onFocus = () => push('focus');
    const onOnline = () => push('reconnect');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(hb);
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [done, initial.id, initial.trackEvents]);

  // Telegram oynasini tasodifan yopishdan himoya (qo'llab-quvvatlansa)
  useEffect(() => {
    if (done) return;
    setClosingConfirmation(true);
    return () => setClosingConfirmation(false);
  }, [done]);

  // Yangilab/yopib yuborishdan oldin ogohlantirish: yuborilmagan javoblar bor
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (sync.pending > 0 && !done) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sync.pending, done]);

  const finish = useCallback(
    async (auto: boolean) => {
      if (finishing) return;
      setFinishing(true);
      setFinishError(null);
      try {
        const flushed = await syncRef.current?.flush(auto ? 4000 : 10_000);
        if (!flushed && !auto) {
          setFinishError('Ba\'zi javoblar hali serverga yuborilmadi (internet yo\'q). Ulanishni tekshirib, qayta urining.');
          setConfirming(false);
          return;
        }
        const { status, json } = await apiSend('POST', `/api/student/attempts/${initial.id}/finish`);
        if (status === 200) {
          syncRef.current?.stop();
          syncRef.current?.clearStorage();
          setDone((json as { result: FinishInfo }).result);
        } else {
          setFinishError('Yakunlashda xatolik. Qayta urinib ko\'ring.');
        }
      } catch {
        setFinishError('Internet bilan aloqa yo\'q. Qayta urinib ko\'ring.');
      } finally {
        setFinishing(false);
        setConfirming(false);
      }
    },
    [finishing, initial.id],
  );

  // Taymer (server soatiga nisbatan); vaqt tugasa avtomatik yakunlanadi
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setLeft(remainingMs(initial.deadlineAt, Date.now(), offset)), 1000);
    return () => clearInterval(id);
  }, [done, initial.deadlineAt, offset]);
  useEffect(() => {
    if (!done && left <= 0 && !autoFinished.current) {
      autoFinished.current = true;
      void finish(true);
    }
  }, [left, done, finish]);

  // Vaqt oynasi serverda uzaygan bo'lishi mumkin (pauza): vaqti tugagandek ko'ringanda serverdan tekshirib olamiz
  useEffect(() => {
    if (done || left > 0 || finishing) return;
    api<{ attempt: AttemptDto }>(`/api/student/attempts/${initial.id}`).then(
      (r) => {
        if (r.attempt.status !== 'in_progress') setDone({ status: r.attempt.status });
      },
      () => undefined,
    );
  }, [left, done, finishing, initial.id]);

  function update(next: Local) {
    setLocal((cur) => ({ ...cur, [q.id]: next }));
    syncRef.current?.submit({ attemptQuestionId: q.id, selectedOptionIds: next.selected, numericValue: parseNum(next.numeric), isFlagged: next.flagged });
  }

  if (done) {
    return (
      <div className="space-y-4 p-4">
        <div className="card space-y-2 text-center">
          <div className="text-4xl" aria-hidden="true">✅</div>
          <h1 className="text-xl font-bold">Javoblaringiz qabul qilindi</h1>
          {done.status === 'expired' && <p className="text-mute">Vaqt tugadi, imtihon avtomatik yakunlandi.</p>}
          {done.score !== undefined ? (
            <p className="text-lg">
              Natija: <b>{done.score}</b> / {done.maxScore} ({done.percent}%) — {done.passed ? 'o\'tdi' : 'o\'tmadi'}
            </p>
          ) : (
            <p className="text-mute">Natijangiz o‘qituvchi e’lon qilgach "Natijalarim" bo‘limida ko‘rinadi.</p>
          )}
        </div>
        <button className="btn w-full" onClick={onExit}>Imtihonlar ro'yxatiga qaytish</button>
      </div>
    );
  }

  const cur = local[q.id] as Local;
  const isMulti = q.type === 'multi';
  const isNumeric = q.type === 'numeric';
  const answered = (x: AttemptQuestionDto) => {
    const l = local[x.id] as Local;
    return x.type === 'numeric' ? parseNum(l.numeric) !== null : l.selected.length > 0;
  };
  const unanswered = qs.filter((x) => !answered(x)).length;
  const danger = left <= 5 * 60_000;

  return (
    <div className="flex min-h-full flex-col">
      {initial.watermark && me && <Watermark text={`${me.lastName} ${me.firstName} · ${me.code}`} />}
      <header className="sticky top-0 z-10 border-b border-line bg-card px-4 py-2">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <span className="text-sm text-mute">{idx + 1} / {qs.length}</span>
          <span role="timer" aria-label="Qolgan vaqt" className={`font-mono text-lg font-bold ${danger ? 'text-danger' : ''}`}>{formatRemaining(left)}</span>
          <span className="text-xs text-mute" aria-live="polite">
            {sync.late ? 'Vaqt o\'tgan' : !sync.online ? '⚠ Internet yo\'q' : sync.pending > 0 ? 'Saqlanmoqda…' : '✓ Saqlandi'}
          </span>
        </div>
      </header>

      {!sync.online && (
        <p role="alert" className="mx-4 mt-3 rounded-xl border border-line bg-card p-3 text-sm">
          Internet yo‘q. Javoblaringiz qurilmada saqlanmoqda va ulanish tiklanganda yuboriladi. Vaqt serverda hisoblanadi — u to‘xtamaydi.
        </p>
      )}

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 p-4 pb-28">
        {(initial.allowCalculator || initial.allowFormulaSheet) && (
          <p className="rounded-lg bg-bg p-2 text-sm" role="note">
            Ruxsat etilgan: {[initial.allowCalculator ? 'kalkulyator' : '', initial.allowFormulaSheet ? 'formula varag\'i' : ''].filter(Boolean).join(', ')}.
          </p>
        )}
        {initial.trackEvents && leaves >= initial.focusWarnThreshold && (
          <p role="alert" className="rounded-lg border border-danger p-2 text-sm">
            Siz imtihon oynasidan {leaves} marta chiqdingiz. Bu o'qituvchiga ko'rinadi. Iltimos, imtihon oynasida qoling.
          </p>
        )}
        <ExamPdf mediaId={initial.pdfMediaId} />

        <nav aria-label="Savollar" className="flex flex-wrap gap-2">
          {qs.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setIdx(i)}
              aria-label={`Savol ${i + 1}${answered(x) ? ', javob berilgan' : ''}${(local[x.id] as Local).flagged ? ', belgilangan' : ''}`}
              aria-current={i === idx ? 'true' : undefined}
              className={`h-10 w-10 rounded-lg border text-sm ${i === idx ? 'border-brand font-bold text-brand' : 'border-line'} ${answered(x) ? 'bg-brand/10' : ''}`}
            >
              {i + 1}{(local[x.id] as Local).flagged ? '⚑' : ''}
            </button>
          ))}
        </nav>

        <section className="card space-y-4">
          <div className="text-base leading-relaxed"><MathText text={q.body} /></div>
          <QuestionImage mediaId={q.imageMediaId} />
          <p className="text-xs text-mute">Ball: {q.points}{isMulti ? ' · bir nechta to\'g\'ri javob bo\'lishi mumkin' : ''}</p>

          {isNumeric ? (
            <label className="block space-y-1">
              <span className="text-sm text-mute">Javobingiz (son)</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                className="min-h-[48px] w-full rounded-xl border border-line bg-bg px-3 text-lg"
                value={cur.numeric}
                onChange={(e) => update({ ...cur, numeric: e.target.value })}
              />
            </label>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Variantlar</legend>
              {q.options.map((o) => {
                const on = cur.selected.includes(o.id);
                return (
                  <label key={o.id} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border p-3 ${on ? 'border-brand bg-brand/10' : 'border-line'}`}>
                    <input
                      type={isMulti ? 'checkbox' : 'radio'}
                      name={`q-${q.id}`}
                      checked={on}
                      onChange={() =>
                        update({ ...cur, selected: isMulti ? (on ? cur.selected.filter((x) => x !== o.id) : [...cur.selected, o.id]) : [o.id] })
                      }
                      className="h-5 w-5"
                    />
                    <span><MathText text={o.body} /></span>
                  </label>
                );
              })}
            </fieldset>
          )}

          <button className="btn-ghost w-full" onClick={() => update({ ...cur, flagged: !cur.flagged })} aria-pressed={cur.flagged}>
            {cur.flagged ? '⚑ Belgi olib tashlash' : '⚐ Keyinroq qaytish uchun belgilash'}
          </button>
        </section>

        {finishError && <p role="alert" className="card text-danger">{finishError}</p>}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl gap-2 p-3">
          <button className="btn-ghost flex-1" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Oldingi</button>
          {idx < qs.length - 1 ? (
            <button className="btn flex-1" onClick={() => setIdx(idx + 1)}>Keyingi →</button>
          ) : (
            <button className="btn flex-1" onClick={() => setConfirming(true)}>Yakunlash</button>
          )}
        </div>
      </footer>

      {confirming && (
        <div role="dialog" aria-modal="true" aria-labelledby="fin-title" className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="card w-full max-w-sm space-y-3">
            <h2 id="fin-title" className="text-lg font-bold">Imtihonni yakunlaysizmi?</h2>
            <p className="text-sm text-mute">
              {unanswered > 0 ? `${unanswered} ta savolga javob berilmagan. ` : 'Barcha savollarga javob berilgan. '}
              Yakunlagandan keyin javoblarni o‘zgartirib bo‘lmaydi.
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={finishing} onClick={() => setConfirming(false)}>Orqaga</button>
              <button className="btn flex-1" disabled={finishing} onClick={() => void finish(false)}>{finishing ? '…' : 'Yakunlash'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
