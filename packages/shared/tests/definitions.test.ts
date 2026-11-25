import { describe, it, expect } from 'vitest';
import { canTransition, examInputSchema, questionInputSchema, validateExam, validateQuestion } from '../src';

const q = (o: Record<string, unknown>) => questionInputSchema.parse({ type: 'text', body: 'F = ma?', ...o });
const opts = (...c: boolean[]) => c.map((isCorrect, i) => ({ body: `v${i}`, isCorrect }));

describe('savol tekshiruvi', () => {
  it('bitta to\'g\'ri variantli savol to\'g\'ri', () => {
    expect(validateQuestion(q({ options: opts(true, false, false) }))).toEqual([]);
  });
  it('0 yoki 2 ta to\'g\'ri (single) rad etiladi; multi ga mumkin', () => {
    expect(validateQuestion(q({ options: opts(false, false) })).length).toBe(1);
    expect(validateQuestion(q({ options: opts(true, true) })).length).toBe(1);
    expect(validateQuestion(q({ type: 'multi', options: opts(true, true, false) }))).toEqual([]);
  });
  it('variantlar soni va takrorlanishi', () => {
    expect(validateQuestion(q({ options: opts(true) })).length).toBe(1);
    expect(validateQuestion(q({ options: [{ body: 'a', isCorrect: true }, { body: ' A ', isCorrect: false }] })).length).toBe(1);
  });
  it('sonli savol: variant yo\'q, javob yoki parametr kerak', () => {
    expect(validateQuestion(q({ type: 'numeric' })).length).toBe(1);
    expect(validateQuestion(q({ type: 'numeric', answerSpec: { expected: 9.8, tolerance: { abs: 0.1 } } }))).toEqual([]);
    expect(validateQuestion(q({ type: 'numeric', options: opts(true, false), answerSpec: { expected: 1, tolerance: { rel: 0.01 } } })).length).toBe(1);
  });
  it('parametrli savol: noma\'lum {{x}} va paramSpec yo\'q holat', () => {
    const spec = { params: [{ name: 'm', min: 1, max: 5, step: 1 }], answer: { expr: 'm*g', decimals: 2, tolerance: { rel: 0.01 } } };
    expect(validateQuestion(q({ type: 'numeric', body: 'Massa {{m}} kg', paramSpec: spec }))).toEqual([]);
    expect(validateQuestion(q({ type: 'numeric', body: 'Massa {{z}} kg', paramSpec: spec })).length).toBe(1);
    expect(validateQuestion(q({ body: 'Massa {{m}}', options: opts(true, false) })).length).toBe(1);
  });
  it('tolerantliksiz answerSpec Zod da rad etiladi', () => {
    expect(() => q({ type: 'numeric', answerSpec: { expected: 1, tolerance: {} } })).toThrow();
  });
});

describe('imtihon tekshiruvi', () => {
  const base = {
    title: 'Hafta 1', classIds: ['00000000-0000-4000-8000-000000000001'],
    startsAt: '2026-12-01T09:00:00Z', endsAt: '2026-12-01T11:00:00Z', durationMinutes: 40,
    questionIds: ['00000000-0000-4000-8000-0000000000a1'],
  };
  it('to\'g\'ri imtihon', () => {
    expect(validateExam(examInputSchema.parse(base))).toEqual([]);
  });
  it('davomiylik oynadan uzun / tugash oldin', () => {
    expect(validateExam(examInputSchema.parse({ ...base, durationMinutes: 180 })).length).toBe(1);
    expect(validateExam(examInputSchema.parse({ ...base, endsAt: '2026-12-01T08:00:00Z' })).length).toBeGreaterThan(0);
  });
  it('tasodifiy: savollar soni va taqsimot yig\'indisi', () => {
    const t1 = '00000000-0000-4000-8000-0000000000b1';
    expect(validateExam(examInputSchema.parse({ ...base, source: 'random', questionIds: [] })).length).toBe(1);
    expect(validateExam(examInputSchema.parse({ ...base, source: 'random', questionIds: [], questionCount: 5, topicDistribution: { [t1]: 6 } })).length).toBe(1);
    expect(validateExam(examInputSchema.parse({ ...base, source: 'random', questionIds: [], questionCount: 10, topicDistribution: { [t1]: 6 } }))).toEqual([]);
  });
  it('holat o\'tishlari', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('finished', 'running')).toBe(false);
    expect(canTransition('running', 'paused')).toBe(true);
  });
});
