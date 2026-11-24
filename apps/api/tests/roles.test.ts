import { describe, expect, it } from 'vitest';
import { teacherGuard } from '../src/middleware/auth';
import { newParentCode } from '../src/services/parents';

function run(role: 'admin' | 'teacher', method: string, path: string): unknown {
  let out: unknown = 'pending';
  teacherGuard({ admin: { me: { role } }, method, path } as never, {} as never, ((e?: unknown) => { out = e ?? 'next'; }) as never);
  return out;
}

describe('o\'qituvchi ruxsat qoidalari', () => {
  it('administrator hamma yo\'lga kiradi', () => {
    expect(run('admin', 'POST', '/teachers')).toBe('next');
  });
  it('o\'qituvchi jurnal, davomat, jadval (o\'qish) va dashboardga kiradi', () => {
    for (const [m, p] of [['GET', '/dashboard'], ['GET', '/classes'], ['GET', '/students'], ['GET', '/journal/abc-1'], ['POST', '/grades'], ['DELETE', '/grades/x1'], ['GET', '/attendance/c1'], ['PUT', '/attendance/c1'], ['GET', '/schedule/c1']] as const) {
      expect(run('teacher', m, p), `${m} ${p}`).toBe('next');
    }
  });
  it('o\'qituvchi boshqaruv yo\'llariga kira olmaydi', () => {
    for (const [m, p] of [['POST', '/teachers'], ['GET', '/teachers'], ['GET', '/parents'], ['PUT', '/schedule/c1'], ['DELETE', '/schedule/slot/x'], ['GET', '/audit'], ['GET', '/exams'], ['POST', '/broadcast'], ['GET', '/students/abc'], ['GET', '/backups']] as const) {
      const r = run('teacher', m, p) as { status?: number };
      expect(r?.status, `${m} ${p}`).toBe(403);
    }
  });
});

describe('ota-ona kodi', () => {
  it('OT-XXXXXX formatida va noyob ko\'rinishda', () => {
    const set = new Set(Array.from({ length: 500 }, newParentCode));
    for (const c of set) expect(c).toMatch(/^OT-[A-Z2-9]{6}$/);
    expect(set.size).toBeGreaterThan(495);
  });
});
