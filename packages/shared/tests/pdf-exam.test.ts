import { describe, expect, it } from 'vitest';
import { examInputSchema, validateExam } from '../src';

const MEDIA = '3f1e2b9c-8c7a-4d3e-9a1b-2c4d5e6f7a8b';
const base = {
  title: 'PDF nazorat', source: 'manual', classIds: ['11111111-1111-4111-8111-111111111111'],
  startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T12:00:00Z', durationMinutes: 40, questionIds: [], passPercent: 60,
};

describe('PDF rejimi: javoblar kaliti validatsiyasi', () => {
  it('kalit kichik harfda berilsa bosh harfga o\'giriladi', () => {
    const e = examInputSchema.parse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: ' abcd ' });
    expect(e.pdfAnswerKey).toBe('ABCD');
    expect(validateExam(e)).toEqual([]);
  });
  it('noto\'g\'ri harf, bo\'sh va juda uzun kalit rad etiladi', () => {
    expect(examInputSchema.safeParse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: 'ABX' }).success).toBe(false);
    expect(examInputSchema.safeParse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: '' }).success).toBe(false);
    expect(examInputSchema.safeParse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: 'A'.repeat(201) }).success).toBe(false);
  });
  it('PDF faylsiz, savollar tanlangan yoki tasodifiy rejimda xato beradi', () => {
    expect(validateExam(examInputSchema.parse({ ...base, pdfAnswerKey: 'ABC' }))).toContain('PDF rejimida PDF fayl yuklanishi shart');
    expect(validateExam(examInputSchema.parse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: 'ABC', questionIds: ['22222222-2222-4222-8222-222222222222'] }))).toContain('PDF rejimida savollar bankidan tanlanmaydi');
    expect(validateExam(examInputSchema.parse({ ...base, pdfMediaId: MEDIA, pdfAnswerKey: 'ABC', source: 'random', questionCount: 3 }))).toContain('PDF rejimi tasodifiy tanlashni qo\'llamaydi');
  });
  it('yangi sozlamalar uchun standart qiymatlar', () => {
    const e = examInputSchema.parse({ ...base, questionIds: ['22222222-2222-4222-8222-222222222222'] });
    expect(e).toMatchObject({ allowCalculator: false, allowFormulaSheet: false, watermarkEnabled: true, trackFocusEvents: true, focusWarnThreshold: 3, showRankings: false });
    expect(examInputSchema.safeParse({ ...base, questionIds: ['22222222-2222-4222-8222-222222222222'], focusWarnThreshold: 0 }).success).toBe(false);
  });
});
