import { shuffle } from './random';
import type { RandomInt } from './random';

export interface PoolQuestion {
  id: string;
  topicId: string | null;
  /** shu o'quvchi oldingi urinishlarda bu savolni necha marta ko'rgan */
  seenCount: number;
}

export interface SelectOptions {
  pool: readonly PoolQuestion[];
  count: number;
  /** mavzu ID -> nechta savol (yig'indisi `count` dan oshmasligi kerak). Qolganlari umumiy bazadan to'ldiriladi. */
  topicCounts?: Record<string, number>;
  randomInt: RandomInt;
}

export interface SelectResult {
  ids: string[];
  /** Yetarli bo'lmaganda imtihon yaratishda ko'rsatiladigan ogohlantirishlar */
  warnings: string[];
}

/** Kam ko'rilganlar oldin; bir xil ko'rilganlar ichida tasodifiy tartib. */
function byPriority(items: PoolQuestion[], randomInt: RandomInt): PoolQuestion[] {
  const groups = new Map<number, PoolQuestion[]>();
  for (const q of items) {
    const g = groups.get(q.seenCount);
    if (g) g.push(q);
    else groups.set(q.seenCount, [q]);
  }
  return [...groups.keys()].sort((a, b) => a - b).flatMap((k) => shuffle(groups.get(k) as PoolQuestion[], randomInt));
}

export function selectQuestions(opts: SelectOptions): SelectResult {
  const { count, randomInt } = opts;
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count musbat butun son bo\'lishi kerak');
  const topicCounts = opts.topicCounts ?? {};
  const wanted = Object.values(topicCounts).reduce((s, n) => s + n, 0);
  if (Object.values(topicCounts).some((n) => !Number.isInteger(n) || n < 0)) throw new RangeError('Mavzu soni manfiy yoki butun emas');
  if (wanted > count) throw new RangeError(`Mavzular bo'yicha yig'indi (${wanted}) umumiy sondan (${count}) oshib ketdi`);

  // Bir savol bir marta (ID bo'yicha dublikatlar olib tashlanadi)
  const uniq = [...new Map(opts.pool.map((q) => [q.id, q])).values()];
  const chosen = new Set<string>();
  const ids: string[] = [];
  const warnings: string[] = [];
  const take = (q: PoolQuestion) => {
    chosen.add(q.id);
    ids.push(q.id);
  };

  for (const [topic, n] of Object.entries(topicCounts)) {
    const cands = byPriority(uniq.filter((q) => q.topicId === topic && !chosen.has(q.id)), randomInt);
    cands.slice(0, n).forEach(take);
    if (cands.length < n) warnings.push(`Mavzu ${topic}: ${n} ta kerak, bazada faqat ${cands.length} ta bor`);
  }

  const need = count - ids.length;
  if (need > 0) {
    byPriority(uniq.filter((q) => !chosen.has(q.id)), randomInt).slice(0, need).forEach(take);
  }
  if (ids.length < count) warnings.push(`Savollar yetarli emas: ${count} ta kerak, tanlandi ${ids.length} ta`);
  return { ids, warnings };
}
