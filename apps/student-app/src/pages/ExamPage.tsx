import { useCallback, useEffect, useState } from 'react';
import { t } from '@pep/shared';
import type { AttemptDto, StudentExamDto } from '@pep/shared';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { ApiFail, api, apiSend } from '../lib/api';
import { AttemptView } from './Attempt';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<string, string> = { scheduled: 'Kutilmoqda', running: 'Davom etmoqda', paused: 'Pauzada', finished: 'Tugagan' };

export function ExamPage() {
  const [exams, setExams] = useState<StudentExamDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<{ exams: StudentExamDto[] }>('/api/student/exams').then(
      (r) => setExams(r.exams),
      () => setError(t('app_err_generic')),
    );
  }, []);
  useEffect(load, [load]);

  async function start(examId: string) {
    setBusy(examId);
    setStartError(null);
    try {
      const { status, json } = await apiSend('POST', `/api/student/exams/${examId}/start`);
      if (status === 200) setAttempt((json as { attempt: AttemptDto }).attempt);
      else setStartError((json as { error?: { message?: string } } | null)?.error?.message ?? t('app_err_generic'));
    } catch (e) {
      setStartError(e instanceof ApiFail && e.code === 'NETWORK' ? 'Internet bilan aloqa yo\'q' : t('app_err_generic'));
    } finally {
      setBusy(null);
    }
  }

  if (attempt) {
    return (
      <AttemptView
        initial={attempt}
        onExit={() => {
          setAttempt(null);
          load();
        }}
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!exams) return <Loading />;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{t('app_nav_exam')}</h1>
      {startError && <p role="alert" className="card text-danger">{startError}</p>}
      {exams.length === 0 && <EmptyState icon="📝">{t('app_exam_empty')}</EmptyState>}
      {exams.map((e) => (
        <section key={e.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold">{e.title}</h2>
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-mute">{STATUS[e.status] ?? e.status}</span>
          </div>
          <p className="text-sm text-mute">
            {fmt(e.startsAt)} — {fmt(e.endsAt)} · {e.durationMinutes} daqiqa{e.questionCount ? ` · ${e.questionCount} savol` : ''}
          </p>
          {e.canStart && (
            <button className="btn w-full" disabled={busy !== null} onClick={() => void start(e.id)}>
              {busy === e.id ? t('app_loading') : e.activeAttemptId ? 'Davom ettirish' : 'Boshlash'}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
