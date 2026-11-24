import { isSuspiciouslyFast } from '../src';
import { describe, it, expect } from 'vitest';
import { difficultyLabel, summarizeResults } from '../src';

describe('natijalar statistikasi', () => {
  it('bo\'sh ro\'yxat', () => {
    expect(summarizeResults([], 60)).toMatchObject({ count: 0, average: 0, passRate: 0 });
  });
  it('o\'rtacha, mediana, o\'tish ulushi, guruhlar', () => {
    const s = summarizeResults([100, 90, 60, 59.99, 30], 60);
    expect(s.count).toBe(5);
    expect(s.average).toBe(68);
    expect(s.median).toBe(60);
    expect(s.passRate).toBe(60);
    expect(s.buckets).toEqual([0, 0, 0, 1, 0, 1, 1, 0, 0, 2]); // 30->3, 59.99->5, 60->6, 90 va 100 -> 9
  });
  it('juft sonli mediana', () => {
    expect(summarizeResults([10, 20, 30, 40], 50).median).toBe(25);
  });
  it('savol qiyinligi', () => {
    expect(difficultyLabel(null, 0)).toBe('kam_malumot');
    expect(difficultyLabel(20, 3)).toBe('kam_malumot');
    expect(difficultyLabel(20, 10)).toBe('qiyin');
    expect(difficultyLabel(90, 10)).toBe('oson');
    expect(difficultyLabel(50, 10)).toBe('ortacha');
  });
});

describe('isSuspiciouslyFast', () => {
  it('yuqori natija + vaqtning 20% idan kam = signal', () => {
    expect(isSuspiciouslyFast({ percent: 95, elapsedSeconds: 300, durationMinutes: 40 })).toBe(true); // 5 daq / 40
    expect(isSuspiciouslyFast({ percent: 95, elapsedSeconds: 1200, durationMinutes: 40 })).toBe(false);
    expect(isSuspiciouslyFast({ percent: 70, elapsedSeconds: 60, durationMinutes: 40 })).toBe(false);
    expect(isSuspiciouslyFast({ percent: null, elapsedSeconds: 60, durationMinutes: 40 })).toBe(false);
    expect(isSuspiciouslyFast({ percent: 100, elapsedSeconds: null, durationMinutes: 40 })).toBe(false);
  });
});
