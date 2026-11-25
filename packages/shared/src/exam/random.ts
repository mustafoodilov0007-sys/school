/** [0, maxExclusive) oralig'ida butun son. Node'da `crypto.randomInt`, testlarda deterministik funksiya beriladi. */
export type RandomInt = (maxExclusive: number) => number;

/** Fisher–Yates; yangi massiv qaytaradi. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}
