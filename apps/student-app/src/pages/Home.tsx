import { useEffect, useState } from 'react';
import { t } from '@pep/shared';
import type { StudentExamDto } from '@pep/shared';
import { EmptyState } from '../components/ui';
import { QuestionImage } from '../components/Media';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Material { id: string; title: string; summary: string | null; video_url: string | null; homework: string | null; due_at: string | null; week_label: string | null; media_id: string | null; topic: string | null }
const when = (iso: string) => new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function Home({ onOpenExam }: { onOpenExam: () => void }) {
  const { state } = useAuth();
  const [exams, setExams] = useState<StudentExamDto[] | null>(null);
  const [mats, setMats] = useState<Material[] | null>(null);
  useEffect(() => {
    api<{ exams: StudentExamDto[] }>('/api/student/exams').then((r) => setExams(r.exams), () => setExams([]));
    api<{ items: Material[] }>('/api/student/materials').then((r) => setMats(r.items), () => setMats([]));
  }, []);
  if (state.status !== 'ready' || state.role !== 'student') return null;
  const s = state.student;
  const next = (exams ?? []).filter((e) => e.status !== 'finished').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  return (
    <div className="space-y-4 p-4">
      <header className="hero">
        <h1 className="text-2xl font-bold">{t('app_hello', { name: s.firstName })}</h1>
        <small>{s.lastName} {s.firstName} · {t('app_class')}: {s.className}</small>
      </header>
      <section aria-labelledby="h-up" className="space-y-2">
        <h2 id="h-up" className="font-semibold">{t('app_upcoming')}</h2>
        {!next ? <EmptyState icon="📅">{t('app_no_exams')}</EmptyState> : (
          <div className="card space-y-1">
            <div className="font-semibold">{next.title}</div>
            <div className="text-sm text-mute">Boshlanishi: {when(next.startsAt)} · tugashi: {when(next.endsAt)} · davomiyligi: {next.durationMinutes} daq{next.questionCount ? ` · ${next.questionCount} savol` : ''}</div>
            <button className="btn mt-2" onClick={onOpenExam}>{next.activeAttemptId ? 'Davom ettirish' : next.canStart ? 'Boshlash' : 'Imtihonlar'}</button>
          </div>
        )}
      </section>
      <section aria-labelledby="h-mat" className="space-y-2">
        <h2 id="h-mat" className="font-semibold">{t('app_materials')}</h2>
        {!mats || mats.length === 0 ? <EmptyState icon="📚">{t('app_no_materials')}</EmptyState> : mats.map((m) => (
          <article key={m.id} className="card space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{m.title}</h3><span className="text-xs text-mute">{[m.week_label, m.topic].filter(Boolean).join(' · ')}</span></div>
            {m.summary && <p className="whitespace-pre-wrap text-sm">{m.summary}</p>}
            <QuestionImage mediaId={m.media_id} />
            {m.video_url && <a className="underline" href={m.video_url} target="_blank" rel="noreferrer noopener">Videoni ochish</a>}
            {m.homework && <p className="rounded-lg bg-bg p-2 text-sm"><b>Uy vazifasi: </b>{m.homework}{m.due_at ? ` (muddat: ${when(m.due_at)})` : ''}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
