import { describe, it, expect } from 'vitest';
import { applyOutcome, backoffMs, clockOffsetMs, enqueue, formatRemaining, rebase, remainingMs, splitMath } from '../src';
import type { QueuedAnswer } from '../src';

const op = (q: string, id: string, base = 0): QueuedAnswer => ({ clientOpId: id, attemptQuestionId: q, selectedOptionIds: [], numericValue: null, isFlagged: false, baseVersion: base });

describe('javoblar navbati', () => {
  it('bir savol uchun faqat oxirgi amal qoladi', () => {
    let q = enqueue([], op('a', '1'));
    q = enqueue(q, op('b', '2'));
    q = enqueue(q, op('a', '3'));
    expect(q.map((x) => x.clientOpId)).toEqual(['2', '3']);
  });
  it('saqlandi/takror/konflikt: amal olib tashlanadi, versiya qaytadi', () => {
    const q = enqueue([], op('a', '1'));
    for (const kind of ['saved', 'duplicate', 'conflict'] as const) {
      const r = applyOutcome(q, op('a', '1'), { kind, version: 4 });
      expect(r.queue).toEqual([]);
      expect(r.version).toBe(4);
      expect(r.stop).toBeNull();
    }
  });
  it('tarmoq xatosi: navbat saqlanadi va to\'xtaydi; kech: navbat bo\'shatiladi', () => {
    const q = enqueue(enqueue([], op('a', '1')), op('b', '2'));
    const n = applyOutcome(q, op('a', '1'), { kind: 'network' });
    expect(n.queue).toHaveLength(2);
    expect(n.stop).toBe('network');
    const l = applyOutcome(q, op('a', '1'), { kind: 'late' });
    expect(l.queue).toEqual([]);
    expect(l.stop).toBe('late');
  });
  it('yuborish paytida yangi amal qo\'shilgan bo\'lsa, u o\'chib ketmaydi', () => {
    const sending = op('a', '1');
    const q = enqueue(enqueue([], sending), op('a', '9')); // '1' allaqachon almashtirilgan
    const r = applyOutcome(q, sending, { kind: 'saved', version: 1 });
    expect(r.queue.map((x) => x.clientOpId)).toEqual(['9']);
  });
  it('rebase va backoff', () => {
    const q = rebase([op('a', '1', 1), op('b', '2', 0)], 'a', 5);
    expect(q.map((x) => x.baseVersion)).toEqual([5, 0]);
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(50)).toBe(30000);
  });
});

describe('server soati bilan taymer', () => {
  it('mijoz soati orqada bo\'lsa ham server vaqtiga ko\'ra hisoblanadi', () => {
    const clientNow = 1_000_000;
    const serverNow = new Date(clientNow + 120_000).toISOString(); // mijoz 2 daqiqa orqada
    const off = clockOffsetMs(serverNow, clientNow);
    expect(off).toBe(120_000);
    const deadline = new Date(clientNow + 120_000 + 60_000).toISOString(); // serverda 1 daqiqa qoldi
    expect(remainingMs(deadline, clientNow, off)).toBe(60_000);
    expect(remainingMs(deadline, clientNow + 999_999, off)).toBe(0);
  });
  it('format', () => {
    expect(formatRemaining(65_000)).toBe('01:05');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
    expect(formatRemaining(0)).toBe('00:00');
  });
});

describe('KaTeX matnni bo\'lish', () => {
  it('oddiy, qator ichidagi va alohida formulalar', () => {
    expect(splitMath('F = $ma$ bo\'ladi')).toEqual([
      { kind: 'text', value: 'F = ' }, { kind: 'math', value: 'ma', display: false }, { kind: 'text', value: ' bo\'ladi' },
    ]);
    expect(splitMath('$$E=mc^2$$')).toEqual([{ kind: 'math', value: 'E=mc^2', display: true }]);
  });
  it('\\$ va yopilmagan $ oddiy matn; bo\'sh formula matn', () => {
    expect(splitMath('narxi \\$5')).toEqual([{ kind: 'text', value: 'narxi $5' }]);
    expect(splitMath('5$ va 6')).toEqual([{ kind: 'text', value: '5$ va 6' }]);
    expect(splitMath('$ $')).toEqual([{ kind: 'text', value: '$ $' }]);
  });
  it('HTML belgilari matn bo\'lib qoladi (React o\'zi escape qiladi)', () => {
    expect(splitMath('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'text', value: '<img src=x onerror=alert(1)>' }]);
  });
  it('formula ichidagi \\} va \\$ qismlari buzilmaydi', () => {
    expect(splitMath('$\\frac{a}{b}$')).toEqual([{ kind: 'math', value: '\\frac{a}{b}', display: false }]);
  });
});

import { isoToTashkentLocal, tashkentLocalToIso } from '../src';
describe('Toshkent vaqti <-> UTC', () => {
  it('almashtirish ikki tomonga to\'g\'ri', () => {
    expect(tashkentLocalToIso('2026-11-22T09:00')).toBe('2026-11-22T04:00:00.000Z');
    expect(tashkentLocalToIso('2026-11-22T02:30')).toBe('2026-11-21T21:30:00.000Z'); // sana orqaga o'tadi
    expect(isoToTashkentLocal('2026-11-21T21:30:00.000Z')).toBe('2026-11-22T02:30');
    expect(tashkentLocalToIso('noto\'g\'ri')).toBeNull();
  });
});
