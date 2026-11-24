import { describe, it, expect } from 'vitest';
import {
  generateStudentCode,
  isValidStudentCodeFormat,
  maskStudentCode,
  normalizeClassLabel,
  normalizeStudentCodeInput,
} from '../src/student-code';

describe('normalizeClassLabel', () => {
  it('oddiy sinf nomlari', () => {
    expect(normalizeClassLabel('8-A')).toBe('8A');
    expect(normalizeClassLabel(' 10 b ')).toBe('10B');
    expect(normalizeClassLabel('11-AB')).toBe('11AB');
  });
  it('kirill o\'xshash harflarni lotinga o\'giradi', () => {
    expect(normalizeClassLabel('8-А')).toBe('8A'); // kirill А
    expect(normalizeClassLabel('9-в')).toBe('9B'); // kirill в
  });
  it('yaroqsiz nomlarni rad etadi', () => {
    expect(normalizeClassLabel('---')).toBeNull();
    expect(normalizeClassLabel('')).toBeNull();
    expect(normalizeClassLabel('1234567')).toBeNull(); // 6 belgidan uzun
  });
});

describe('normalizeStudentCodeInput', () => {
  it('katta harf, bo\'sh joy va turli chiziqlarni birlashtiradi', () => {
    expect(normalizeStudentCodeInput('ph-8a-0417')).toBe('PH-8A-0417');
    expect(normalizeStudentCodeInput('  PH 8A 0417 ')).toBe('PH-8A-0417');
    expect(normalizeStudentCodeInput('PH–8A–0417')).toBe('PH-8A-0417'); // en dash
    expect(normalizeStudentCodeInput('PH—8A—0417')).toBe('PH-8A-0417'); // em dash
  });
  it('kirill o\'xshash harflarni o\'giradi', () => {
    expect(normalizeStudentCodeInput('РН-8А-0417')).toBe('PH-8A-0417');
  });
  it('juda uzun kirishni rad etadi', () => {
    expect(normalizeStudentCodeInput('A'.repeat(41))).toBe('');
  });
});

describe('format va mask', () => {
  it('format tekshiruvi', () => {
    expect(isValidStudentCodeFormat('PH-8A-0417')).toBe(true);
    expect(isValidStudentCodeFormat('PH-8A-041')).toBe(false);
    expect(isValidStudentCodeFormat('ph-8a-0417')).toBe(false);
    expect(isValidStudentCodeFormat("PH-8A-0417'; DROP")).toBe(false);
  });
  it('maskStudentCode raqamlarni yashiradi', () => {
    expect(maskStudentCode('PH-8A-0417')).toBe('PH-8A-****');
    expect(maskStudentCode('garbage')).toBe('***');
  });
});

describe('generateStudentCode', () => {
  it('nol bilan to\'ldiriladi va formatga mos', () => {
    const code = generateStudentCode({ prefix: 'PH', classLabel: '8A', suffixLength: 4, randomInt: () => 17 });
    expect(code).toBe('PH-8A-0017');
    expect(isValidStudentCodeFormat(code)).toBe(true);
  });
  it('suffix uzunligi sozlanadi', () => {
    const code = generateStudentCode({ prefix: 'PH', classLabel: '10B', suffixLength: 6, randomInt: () => 123456 });
    expect(code).toBe('PH-10B-123456');
  });
  it('randomInt chegarasini to\'g\'ri uzatadi', () => {
    let seen = 0;
    generateStudentCode({ prefix: 'PH', classLabel: '8A', suffixLength: 5, randomInt: (m) => ((seen = m), 0) });
    expect(seen).toBe(100000);
  });
  it('noto\'g\'ri parametrlarda xato beradi', () => {
    const base = { prefix: 'PH', classLabel: '8A', suffixLength: 4, randomInt: () => 1 };
    expect(() => generateStudentCode({ ...base, suffixLength: 3 })).toThrow();
    expect(() => generateStudentCode({ ...base, suffixLength: 9 })).toThrow();
    expect(() => generateStudentCode({ ...base, classLabel: 'bad label' })).toThrow();
    expect(() => generateStudentCode({ ...base, prefix: 'p-h' })).toThrow();
  });
});
