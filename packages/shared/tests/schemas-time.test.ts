import { describe, it, expect } from 'vitest';
import {
  bulkStudentsSchema,
  createClassSchema,
  createStudentSchema,
  formatCountdownUz,
  formatTashkent,
  listStudentsQuerySchema,
  parseBulkNameLines,
  personNameSchema,
  reasonSchema,
  remainingSeconds,
  t,
} from '../src/index';

describe('personNameSchema', () => {
  it('o\'zbekcha ismlar va apostrof qabul qilinadi', () => {
    expect(personNameSchema.parse("  O'ktam  ")).toBe("O'ktam");
    expect(personNameSchema.parse('Gʻulom')).toBe('Gʻulom');
    expect(personNameSchema.parse('Анвар')).toBe('Анвар');
    expect(personNameSchema.parse('Ali   Valiyevich')).toBe('Ali Valiyevich');
  });
  it('xavfli belgilarni rad etadi (CSV/HTML in\'ektsiya)', () => {
    expect(personNameSchema.safeParse('=cmd|calc').success).toBe(false);
    expect(personNameSchema.safeParse('<script>').success).toBe(false);
    expect(personNameSchema.safeParse('@admin').success).toBe(false);
    expect(personNameSchema.safeParse('').success).toBe(false);
    expect(personNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });
});

describe('boshqa sxemalar', () => {
  const classId = '3f2b8c1e-9d4a-4e2b-8a7c-1b2c3d4e5f60';
  it('createClass yaroqsiz nomni rad etadi', () => {
    expect(createClassSchema.safeParse({ name: '8-A' }).success).toBe(true);
    expect(createClassSchema.safeParse({ name: '###' }).success).toBe(false);
  });
  it('createStudent', () => {
    expect(createStudentSchema.safeParse({ classId, firstName: 'Aziz', lastName: 'Karimov' }).success).toBe(true);
    expect(createStudentSchema.safeParse({ classId: 'x', firstName: 'Aziz', lastName: 'K' }).success).toBe(false);
  });
  it('bulk: 300 tadan ko\'p va bo\'sh ro\'yxat rad etiladi', () => {
    const s = { firstName: 'A', lastName: 'B' };
    expect(bulkStudentsSchema.safeParse({ classId, students: [] }).success).toBe(false);
    expect(bulkStudentsSchema.safeParse({ classId, students: Array(301).fill(s) }).success).toBe(false);
    const ok = bulkStudentsSchema.parse({ classId, students: [s] });
    expect(ok.dryRun).toBe(false);
  });
  it('reason majburiy', () => {
    expect(reasonSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(reasonSchema.safeParse({ reason: 'Telefon almashtirildi' }).success).toBe(true);
  });
  it('list query: standart qiymatlar va bool o\'girish', () => {
    const q = listStudentsQuerySchema.parse({ linked: 'false', active: 'true' });
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
    expect(q.linked).toBe(false);
    expect(q.active).toBe(true);
    expect(listStudentsQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});

describe('parseBulkNameLines', () => {
  it('familiya-ism tartibi va tartib raqamlarini olib tashlash', () => {
    const { rows, errors } = parseBulkNameLines('1. Karimov Aziz\n2) Ergasheva Nilufar Akmal qizi\n\nBittasi', 'last_first');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
    expect(rows).toEqual([
      { line: 1, lastName: 'Karimov', firstName: 'Aziz' },
      { line: 2, lastName: 'Ergasheva', firstName: 'Nilufar Akmal qizi' },
    ]);
  });
  it('ism-familiya tartibi', () => {
    const { rows } = parseBulkNameLines('Aziz Karimov', 'first_last');
    expect(rows[0]).toEqual({ line: 1, firstName: 'Aziz', lastName: 'Karimov' });
  });
});

describe('vaqt yordamchilari', () => {
  it('formatTashkent UTC+5 ga o\'giradi', () => {
    expect(formatTashkent('2026-11-20T00:39:00Z')).toBe('20.11.2026 05:39');
    expect(formatTashkent('2026-12-31T20:00:00Z')).toBe('01.01.2027 01:00');
    expect(formatTashkent('invalid')).toBe('—');
  });
  it('remainingSeconds manfiy bo\'lmaydi', () => {
    expect(remainingSeconds('2026-11-20T10:00:10Z', '2026-11-20T10:00:00Z')).toBe(10);
    expect(remainingSeconds('2026-11-20T10:00:00Z', '2026-11-20T10:05:00Z')).toBe(0);
  });
  it('formatCountdownUz', () => {
    expect(formatCountdownUz(93784)).toBe('1 kun 2 soat 3 daqiqa');
    expect(formatCountdownUz(0)).toBe('0 daqiqa');
    expect(formatCountdownUz(3600)).toBe('1 soat');
  });
});

describe('i18n', () => {
  it('o\'zgaruvchilarni almashtiradi', () => {
    expect(t('bot_code_invalid', { left: 3 })).toContain('Qolgan urinishlar: 3.');
    expect(t('bot_locked', { minutes: 10 })).toContain('10 daqiqadan');
  });
});
