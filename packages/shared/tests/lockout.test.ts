import { describe, it, expect } from 'vitest';
import { evaluateLockout, type AttemptRecord } from '../src/lockout';

const T0 = new Date('2026-11-20T10:00:00Z').getTime();
const at = (sec: number, success = false): AttemptRecord => ({ at: new Date(T0 + sec * 1000), success });
const now = (sec: number) => new Date(T0 + sec * 1000);

describe('evaluateLockout', () => {
  it('urinishlar yo\'q — blok yo\'q, 5 ta urinish qolgan', () => {
    const s = evaluateLockout([], now(0));
    expect(s.locked).toBe(false);
    expect(s.attemptsLeft).toBe(5);
  });

  it('4 ta xato — hali blok yo\'q, 1 ta qoldi', () => {
    const s = evaluateLockout([at(0), at(5), at(10), at(15)], now(20));
    expect(s.locked).toBe(false);
    expect(s.attemptsLeft).toBe(1);
  });

  it('5 ta ketma-ket xato — 10 daqiqa blok', () => {
    const s = evaluateLockout([at(0), at(5), at(10), at(15), at(20)], now(30));
    expect(s.locked).toBe(true);
    expect(s.retryAfterSeconds).toBe(590);
    expect(s.lockedUntil?.getTime()).toBe(T0 + 20_000 + 600_000);
  });

  it('blok aynan tugaganda ochiladi va hisoblagich noldan boshlanadi', () => {
    const attempts = [at(0), at(1), at(2), at(3), at(4)];
    expect(evaluateLockout(attempts, now(4 + 599)).locked).toBe(true);
    const s = evaluateLockout(attempts, now(4 + 600));
    expect(s.locked).toBe(false);
    expect(s.attemptsLeft).toBe(5);
  });

  it('muvaffaqiyatli urinish seriyani nolga tushiradi', () => {
    const s = evaluateLockout([at(0), at(1), at(2), at(3), at(4, true), at(5)], now(10));
    expect(s.locked).toBe(false);
    expect(s.streak).toBe(1);
  });

  it('blok davomida yozilgan (kutilmagan) urinishlar blokni uzaytirmaydi', () => {
    const attempts = [at(0), at(1), at(2), at(3), at(4), at(100), at(200)];
    const s = evaluateLockout(attempts, now(300));
    expect(s.lockedUntil?.getTime()).toBe(T0 + 4_000 + 600_000);
  });

  it('blokdan keyin yana 5 ta xato — yana blok', () => {
    const first = [at(0), at(1), at(2), at(3), at(4)];
    const second = [at(700), at(701), at(702), at(703), at(704)];
    const s = evaluateLockout([...first, ...second], now(710));
    expect(s.locked).toBe(true);
    expect(s.lockedUntil?.getTime()).toBe(T0 + 704_000 + 600_000);
  });

  it('tartibsiz kelgan yozuvlar ham to\'g\'ri hisoblanadi', () => {
    const s = evaluateLockout([at(4), at(0), at(3), at(1), at(2)], now(10));
    expect(s.locked).toBe(true);
  });

  it('sozlanadigan chegara', () => {
    const s = evaluateLockout([at(0), at(1), at(2)], now(5), { maxFailures: 3, lockSeconds: 60 });
    expect(s.locked).toBe(true);
    expect(s.retryAfterSeconds).toBe(57);
  });
});
