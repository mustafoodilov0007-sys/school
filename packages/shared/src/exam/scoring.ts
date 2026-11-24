/** Barcha ball hisoblash serverda; bu toza funksiyalar test qilinadi. Ballar sentiy (0.01) aniqligida butun sonlarda hisoblanadi. */

export interface Tolerance {
  abs?: number;
  rel?: number;
}

export type GradableAnswer =
  | { kind: 'single' | 'multi'; correct: readonly string[]; selected: readonly string[] }
  | { kind: 'numeric'; expected: number; tolerance: Tolerance; value: number | null };

export function isAnswered(a: GradableAnswer): boolean {
  return a.kind === 'numeric' ? a.value !== null && Number.isFinite(a.value) : a.selected.length > 0;
}

export function isCorrect(a: GradableAnswer): boolean {
  if (!isAnswered(a)) return false;
  if (a.kind === 'numeric') {
    const v = a.value as number;
    const allowed = Math.max(a.tolerance.abs ?? 0, (a.tolerance.rel ?? 0) * Math.abs(a.expected));
    return Math.abs(v - a.expected) <= allowed + 1e-12;
  }
  const sel = new Set(a.selected);
  if (sel.size !== a.selected.length) return false; // takroriy variant yuborilgan
  if (a.kind === 'single') return sel.size === 1 && a.correct.length === 1 && sel.has(a.correct[0] as string);
  // multi: to'liq mos kelishi shart (qisman ball yo'q)
  return sel.size === a.correct.length && a.correct.every((id) => sel.has(id));
}

export interface GradedItem {
  points: number;
  /** xato savol bekor qilingan: ball ham, maksimum ham hisobga olinmaydi */
  voided: boolean;
  answer: GradableAnswer;
}

export interface ScoreSummary {
  score: number;
  maxScore: number;
  percent: number;
  correct: number;
  wrong: number;
  unanswered: number;
}

const cents = (p: number) => Math.round(p * 100);

export function scoreAttempt(items: readonly GradedItem[]): ScoreSummary {
  let score = 0;
  let max = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const it of items) {
    if (it.voided) continue;
    if (!(it.points > 0)) throw new RangeError('Savol bali musbat bo\'lishi kerak');
    max += cents(it.points);
    if (!isAnswered(it.answer)) unanswered++;
    else if (isCorrect(it.answer)) {
      correct++;
      score += cents(it.points);
    } else wrong++;
  }
  return {
    score: score / 100,
    maxScore: max / 100,
    percent: max === 0 ? 0 : Math.round((score / max) * 10000) / 100,
    correct,
    wrong,
    unanswered,
  };
}

export const hasPassed = (percent: number, passPercent: number) => percent + 1e-9 >= passPercent;

/** Imtihon yaratishdan oldin: ballar yig'indisi to'g'rimi? (individual ballar bo'lsa ham) */
export function totalPoints(points: readonly number[]): number {
  return points.reduce((s, p) => s + cents(p), 0) / 100;
}
