export interface ResultsSummary {
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
  /** o'tganlar ulushi, 0..100 */
  passRate: number;
  /** 0-10, 10-20, ... 90-100 (100% oxirgi guruhda) */
  buckets: number[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeResults(percents: readonly number[], passPercent: number): ResultsSummary {
  const buckets = new Array<number>(10).fill(0);
  if (percents.length === 0) return { count: 0, average: 0, median: 0, min: 0, max: 0, passRate: 0, buckets };
  const sorted = [...percents].sort((a, b) => a - b);
  const n = sorted.length;
  for (const p of sorted) buckets[Math.min(9, Math.max(0, Math.floor(p / 10)))]! += 1;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const passed = sorted.filter((p) => p + 1e-9 >= passPercent).length;
  return {
    count: n,
    average: r2(sorted.reduce((a, b) => a + b, 0) / n),
    median: r2(median),
    min: r2(sorted[0] as number),
    max: r2(sorted[n - 1] as number),
    passRate: r2((passed * 100) / n),
    buckets,
  };
}

/** Savol bo'yicha qiyinlik: to'g'ri javoblar ulushi (javob berganlar orasida). */
export function difficultyLabel(correctPercent: number | null, answered: number): 'kam_malumot' | 'qiyin' | 'ortacha' | 'oson' {
  if (correctPercent === null || answered < 5) return 'kam_malumot';
  if (correctPercent < 35) return 'qiyin';
  if (correctPercent > 80) return 'oson';
  return 'ortacha';
}

/**
 * "Shubhali tez" signal: yuqori natija ruxsat etilgan vaqtning juda kichik qismida topshirilgan.
 * Bu ISBOT EMAS — faqat admin e'tibori uchun (kuchli o'quvchi tez yechishi mumkin).
 */
export function isSuspiciouslyFast(p: { percent: number | null; elapsedSeconds: number | null; durationMinutes: number }): boolean {
  if (p.percent === null || p.elapsedSeconds === null || p.elapsedSeconds < 0) return false;
  return p.percent >= 90 && p.elapsedSeconds <= p.durationMinutes * 60 * 0.2;
}
