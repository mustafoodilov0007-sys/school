/**
 * Vaqt siyosati (server — yagona haqiqat manbai):
 *  - deadline = min(boshlanish + davomiylik, imtihon tugash vaqti) + qo'shimcha vaqt
 *  - Pauza: pauza davomiyligi qadar deadline surilib, tranzaksiyada yangilanadi
 *  - Deadline'dan keyin kelgan javob (grace dan tashqari) QABUL QILINMAYDI; offline navbat vaqtni uzaytirmaydi
 */
export interface DeadlineInput {
  startedAt: Date;
  durationMinutes: number;
  examEndsAt: Date;
  extraSeconds?: number;
}

export function computeDeadline(p: DeadlineInput): Date {
  if (!(p.durationMinutes > 0)) throw new RangeError('durationMinutes musbat bo\'lishi kerak');
  if ((p.extraSeconds ?? 0) < 0) throw new RangeError('extraSeconds manfiy bo\'lmasin');
  const byDuration = p.startedAt.getTime() + p.durationMinutes * 60_000;
  return new Date(Math.min(byDuration, p.examEndsAt.getTime()) + (p.extraSeconds ?? 0) * 1000);
}

export function shiftForPause(deadline: Date, pausedAt: Date, resumedAt: Date): Date {
  const paused = resumedAt.getTime() - pausedAt.getTime();
  if (paused < 0) throw new RangeError('Davom ettirish vaqti pauzadan oldin bo\'lishi mumkin emas');
  return new Date(deadline.getTime() + paused);
}

export const isExpired = (now: Date, deadline: Date) => now.getTime() > deadline.getTime();

export type SubmitDecision = 'accepted' | 'rejected_late';

/** `graceSeconds` (0..60) — tarmoq kechikishi uchun kichik imtiyoz; faqat serverga yetib kelgan vaqt hisoblanadi. */
export function classifySubmission(receivedAt: Date, deadline: Date, graceSeconds = 0): SubmitDecision {
  const g = Math.min(Math.max(graceSeconds, 0), 60);
  return receivedAt.getTime() <= deadline.getTime() + g * 1000 ? 'accepted' : 'rejected_late';
}
