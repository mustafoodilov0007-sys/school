import { describe, it, expect } from 'vitest';
import {
  classifySubmission, computeDeadline, evaluate, findUnknownPlaceholders, generateParams, hasPassed, isCorrect,
  renderTemplate, scoreAttempt, selectQuestions, shiftForPause, shuffle, totalPoints, validateParamSpec,
} from '../src/index';
import type { ParamSpec, PoolQuestion } from '../src/index';

/** Deterministik "tasodifiy": LCG */
function rng(seed = 1) {
  let s = seed >>> 0;
  return (max: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % max;
  };
}

describe('shuffle', () => {
  it('elementlarni saqlaydi, asl massivni o\'zgartirmaydi', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(src, rng(7));
    expect([...out].sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).not.toEqual(src);
  });
  it('turli urug\'larda turli tartib', () => {
    const src = Array.from({ length: 10 }, (_, i) => i);
    expect(shuffle(src, rng(1))).not.toEqual(shuffle(src, rng(2)));
  });
});

const mkPool = (n: number, topic: (i: number) => string, seen: (i: number) => number = () => 0): PoolQuestion[] =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i}`, topicId: topic(i), seenCount: seen(i) }));

describe('selectQuestions', () => {
  it('70 tadan 25 ta, takrorlarsiz', () => {
    const r = selectQuestions({ pool: mkPool(70, (i) => `t${i % 5}`), count: 25, randomInt: rng(3) });
    expect(r.ids).toHaveLength(25);
    expect(new Set(r.ids).size).toBe(25);
    expect(r.warnings).toEqual([]);
  });
  it('oldin ko\'rilmagan savollarga ustuvorlik', () => {
    const pool = mkPool(40, () => 't', (i) => (i < 25 ? 0 : 3)); // 25 tasi yangi
    const r = selectQuestions({ pool, count: 25, randomInt: rng(9) });
    expect(r.ids.every((id) => Number(id.slice(1)) < 25)).toBe(true);
  });
  it('mavzu bo\'yicha taqsimot', () => {
    const pool = mkPool(60, (i) => `t${i % 3}`);
    const r = selectQuestions({ pool, count: 10, topicCounts: { t0: 5, t1: 3 }, randomInt: rng(4) });
    const byTopic = (t: string) => r.ids.filter((id) => pool[Number(id.slice(1))]?.topicId === t).length;
    expect(byTopic('t0')).toBeGreaterThanOrEqual(5);
    expect(byTopic('t1')).toBeGreaterThanOrEqual(3);
    expect(r.ids).toHaveLength(10);
  });
  it('yetarli bo\'lmasa ogohlantiradi (xato otmaydi)', () => {
    const r = selectQuestions({ pool: mkPool(8, () => 't'), count: 10, randomInt: rng(1) });
    expect(r.ids).toHaveLength(8);
    expect(r.warnings.join(' ')).toContain('yetarli emas');
    const r2 = selectQuestions({ pool: mkPool(20, () => 'a'), count: 10, topicCounts: { b: 4 }, randomInt: rng(1) });
    expect(r2.warnings.join(' ')).toContain('Mavzu b');
    expect(r2.ids).toHaveLength(10);
  });
  it('dublikat ID lar bir marta; noto\'g\'ri taqsimot rad etiladi', () => {
    const dup = [...mkPool(5, () => 't'), ...mkPool(5, () => 't')];
    expect(selectQuestions({ pool: dup, count: 5, randomInt: rng(1) }).ids).toHaveLength(5);
    expect(() => selectQuestions({ pool: dup, count: 3, topicCounts: { t: 4 }, randomInt: rng(1) })).toThrow();
    expect(() => selectQuestions({ pool: dup, count: 0, randomInt: rng(1) })).toThrow();
  });
});

describe('ball hisoblash', () => {
  it('single: to\'g\'ri/noto\'g\'ri/javobsiz', () => {
    expect(isCorrect({ kind: 'single', correct: ['a'], selected: ['a'] })).toBe(true);
    expect(isCorrect({ kind: 'single', correct: ['a'], selected: ['b'] })).toBe(false);
    expect(isCorrect({ kind: 'single', correct: ['a'], selected: [] })).toBe(false);
    expect(isCorrect({ kind: 'single', correct: ['a'], selected: ['a', 'b'] })).toBe(false);
  });
  it('multi: faqat to\'liq mos kelsa; takroriy variant rad etiladi', () => {
    expect(isCorrect({ kind: 'multi', correct: ['a', 'b'], selected: ['b', 'a'] })).toBe(true);
    expect(isCorrect({ kind: 'multi', correct: ['a', 'b'], selected: ['a'] })).toBe(false);
    expect(isCorrect({ kind: 'multi', correct: ['a', 'b'], selected: ['a', 'b', 'c'] })).toBe(false);
    expect(isCorrect({ kind: 'multi', correct: ['a', 'b'], selected: ['a', 'a'] })).toBe(false);
  });
  it('sonli javob: absolyut va nisbiy tolerantlik', () => {
    const n = (value: number | null, tol = {}) => ({ kind: 'numeric' as const, expected: 100, tolerance: tol, value });
    expect(isCorrect(n(100))).toBe(true);
    expect(isCorrect(n(100.4))).toBe(false);
    expect(isCorrect(n(100.4, { abs: 0.5 }))).toBe(true);
    expect(isCorrect(n(101, { rel: 0.01 }))).toBe(true);
    expect(isCorrect(n(102, { rel: 0.01 }))).toBe(false);
    expect(isCorrect(n(null, { abs: 99 }))).toBe(false);
  });
  it('scoreAttempt: ballar, foiz, bekor qilingan savol', () => {
    const ok = { kind: 'single' as const, correct: ['a'], selected: ['a'] };
    const bad = { kind: 'single' as const, correct: ['a'], selected: ['b'] };
    const none = { kind: 'single' as const, correct: ['a'], selected: [] };
    const r = scoreAttempt([
      { points: 1, voided: false, answer: ok },
      { points: 2, voided: false, answer: bad },
      { points: 1.5, voided: false, answer: ok },
      { points: 1, voided: false, answer: none },
      { points: 5, voided: true, answer: bad },
    ]);
    expect(r).toEqual({ score: 2.5, maxScore: 5.5, percent: 45.45, correct: 2, wrong: 1, unanswered: 1 });
    expect(hasPassed(60, 60)).toBe(true);
    expect(hasPassed(59.99, 60)).toBe(false);
  });
  it('suzuvchi nuqta xatosi yo\'q (0.1+0.2 ball)', () => {
    const ok = { kind: 'single' as const, correct: ['a'], selected: ['a'] };
    const r = scoreAttempt([{ points: 0.1, voided: false, answer: ok }, { points: 0.2, voided: false, answer: ok }]);
    expect(r.score).toBe(0.3);
    expect(totalPoints([0.1, 0.2, 0.7])).toBe(1);
  });
  it('bo\'sh imtihon 0%, manfiy ball rad etiladi', () => {
    expect(scoreAttempt([]).percent).toBe(0);
    expect(() => scoreAttempt([{ points: 0, voided: false, answer: { kind: 'single', correct: [], selected: [] } }])).toThrow();
  });
});

describe('deadline siyosati', () => {
  const start = new Date('2026-11-20T10:00:00Z');
  it('davomiylik va imtihon tugashidan kichigi + qo\'shimcha vaqt', () => {
    expect(computeDeadline({ startedAt: start, durationMinutes: 40, examEndsAt: new Date('2026-11-20T12:00:00Z') }).toISOString()).toBe('2026-11-20T10:40:00.000Z');
    expect(computeDeadline({ startedAt: start, durationMinutes: 40, examEndsAt: new Date('2026-11-20T10:20:00Z') }).toISOString()).toBe('2026-11-20T10:20:00.000Z');
    expect(computeDeadline({ startedAt: start, durationMinutes: 40, examEndsAt: new Date('2026-11-20T10:20:00Z'), extraSeconds: 300 }).toISOString()).toBe('2026-11-20T10:25:00.000Z');
  });
  it('pauza deadline ni aynan pauza davomiyligicha suradi', () => {
    const d = shiftForPause(new Date('2026-11-20T10:40:00Z'), new Date('2026-11-20T10:10:00Z'), new Date('2026-11-20T10:17:30Z'));
    expect(d.toISOString()).toBe('2026-11-20T10:47:30.000Z');
    expect(() => shiftForPause(d, new Date('2026-11-20T11:00:00Z'), new Date('2026-11-20T10:00:00Z'))).toThrow();
  });
  it('kech kelgan javob rad etiladi; grace 60 s bilan cheklangan', () => {
    const dl = new Date('2026-11-20T10:40:00Z');
    expect(classifySubmission(new Date('2026-11-20T10:40:00Z'), dl)).toBe('accepted');
    expect(classifySubmission(new Date('2026-11-20T10:40:01Z'), dl)).toBe('rejected_late');
    expect(classifySubmission(new Date('2026-11-20T10:40:05Z'), dl, 10)).toBe('accepted');
    expect(classifySubmission(new Date('2026-11-20T10:41:30Z'), dl, 9999)).toBe('rejected_late');
  });
  it('noto\'g\'ri kirishlar', () => {
    expect(() => computeDeadline({ startedAt: start, durationMinutes: 0, examEndsAt: start })).toThrow();
  });
});

describe('xavfsiz ifoda hisoblagich', () => {
  it('arifmetika va ustuvorlik', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('-2 ^ 2')).toBe(-4);
    expect(evaluate('2 ^ -1')).toBe(0.5);
    expect(evaluate('m * a', { m: 5, a: 2 })).toBe(10);
    expect(evaluate('sqrt(2*g*h)', { h: 5 })).toBeCloseTo(Math.sqrt(2 * 9.81 * 5), 10);
    expect(evaluate('round(10/3, 2)')).toBe(3.33);
    expect(evaluate('max(1, 5, 3)')).toBe(5);
    expect(evaluate('3 > 2')).toBe(1);
    expect(evaluate('1e3 + 1')).toBe(1001);
  });
  it('xavfli va noto\'g\'ri ifodalarni rad etadi', () => {
    const bad = [
      'process.exit()', 'constructor', '__proto__', 'this', 'globalThis', 'require("fs")', 'a.b', '"x"', '`x`',
      'x[0]', '{}', 'Math.sqrt(4)', 'toString', 'hasOwnProperty', '1 +', '(1', '1 2', '1/0', 'sqrt(-1)', 'unknownfn(1)',
      '2'.repeat(201), '('.repeat(40) + '1' + ')'.repeat(40), '1+'.repeat(130) + '1', ';',
    ];
    for (const e of bad) expect(() => evaluate(e, {})).toThrow();
  });
  it('prototip nomlari o\'zgaruvchi sifatida ishlamaydi', () => {
    expect(() => evaluate('constructor', { a: 1 })).toThrow();
    expect(() => evaluate('toString + 1', {})).toThrow();
  });
});

describe('parametrli savollar', () => {
  const spec: ParamSpec = {
    params: [
      { name: 'm', min: 2, max: 10, step: 1 },
      { name: 'a', min: 1, max: 5, step: 0.5 },
    ],
    constraints: ['m * a <= 40'],
    answer: { expr: 'm * a', decimals: 2, tolerance: { abs: 0.01 } },
  };
  it('F = ma: qiymatlar diapazonda va qadamga mos, javob to\'g\'ri', () => {
    const r = rng(11);
    for (let i = 0; i < 300; i++) {
      const g = generateParams(spec, r);
      expect(g.values.m).toBeGreaterThanOrEqual(2);
      expect(g.values.m).toBeLessThanOrEqual(10);
      expect(Number.isInteger(g.values.m)).toBe(true);
      expect(Number.isInteger((g.values.a as number) * 2)).toBe(true);
      expect(g.answer).toBe(Number(((g.values.m as number) * (g.values.a as number)).toFixed(2)));
      expect((g.values.m as number) * (g.values.a as number)).toBeLessThanOrEqual(40);
    }
  });
  it('bir xil urug\' — bir xil natija; turli urug\' — odatda turli', () => {
    expect(generateParams(spec, rng(5))).toEqual(generateParams(spec, rng(5)));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(generateParams(spec, rng(i + 100)).values)));
    expect(seen.size).toBeGreaterThan(5);
  });
  it('0.1 qadamlarda suzuvchi nuqta xatosi yo\'q', () => {
    const s: ParamSpec = { params: [{ name: 'x', min: 0, max: 1, step: 0.1 }], answer: { expr: 'x', decimals: 1, tolerance: {} } };
    for (let i = 0; i < 100; i++) expect(String(generateParams(s, rng(i)).values.x).length).toBeLessThanOrEqual(3);
  });
  it('bajarib bo\'lmaydigan shart — aniq xato', () => {
    expect(() => generateParams({ ...spec, constraints: ['m > 100'] }, rng(1), 50)).toThrow(/topilmadi/);
  });
  it('spetsifikatsiya tekshiruvi', () => {
    expect(validateParamSpec(spec)).toEqual([]);
    expect(validateParamSpec({ ...spec, params: [{ name: 'sqrt', min: 1, max: 2, step: 1 }] }).join()).toContain('band nom');
    expect(validateParamSpec({ ...spec, params: [{ name: 'm', min: 5, max: 1, step: 1 }] }).join()).toContain('min < max');
    expect(validateParamSpec({ ...spec, params: [{ name: 'm', min: 0, max: 1, step: 0 }] }).join()).toContain('step');
    expect(validateParamSpec({ ...spec, answer: { ...spec.answer, expr: 'process.exit()' } }).length).toBeGreaterThan(0);
    expect(validateParamSpec({ ...spec, answer: { ...spec.answer, expr: 'q * 2' } }).join()).toContain('Noma\'lum');
    expect(validateParamSpec({ ...spec, params: [{ name: 'm', min: 0, max: 1e9, step: 1 }] }).join()).toContain('juda ko\'p');
  });
  it('shablon: {{m}} almashtiriladi, KaTeX {…} tegilmaydi', () => {
    expect(renderTemplate('Massasi {{m}} kg, tezlanish {{ a }} m/s². $\\frac{a}{b}$ {{zzz}}', { m: 4, a: 2.5 })).toBe(
      'Massasi 4 kg, tezlanish 2.5 m/s². $\\frac{a}{b}$ {{zzz}}',
    );
    expect(findUnknownPlaceholders('{{m}} {{x}}', spec)).toEqual(['x']);
  });
});
