import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';
import { csvCell, toCsv } from '../src/lib/csv';
import { randomToken, safeEqual, sha256Hex } from '../src/lib/crypto';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BOT_TOKEN: '123456789:AAFakeTokenForTestsOnly_0123456789abc',
  INTERNAL_API_KEY: 'k'.repeat(40),
  ADMIN_TELEGRAM_IDS: '111, 222',
  STUDENT_APP_URL: 'http://localhost:5173',
  ADMIN_WEB_URL: 'http://localhost:5174',
};

describe('loadConfig', () => {
  it('to\'g\'ri sozlamalarni o\'qiydi va standart qiymatlarni qo\'yadi', () => {
    const c = loadConfig(base as NodeJS.ProcessEnv);
    expect(c.adminTelegramIds).toEqual([111, 222]);
    expect(c.studentCodeSuffixLength).toBe(4);
    expect(c.initDataMaxAgeSeconds).toBe(900);
    expect(c.allowDevAuth).toBe(false);
    expect(c.corsOrigins).toContain('http://localhost:5173');
    expect(c.adminCookieName).toBe('pep_admin');
  });

  it('productionda ALLOW_DEV_AUTH=true bo\'lsa ishga tushmaydi', () => {
    const env = { ...base, NODE_ENV: 'production', STUDENT_APP_URL: 'https://a.uz', ADMIN_WEB_URL: 'https://b.uz', ALLOW_DEV_AUTH: 'true', DEV_STUDENT_TELEGRAM_ID: '1' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/ALLOW_DEV_AUTH/);
  });

  it('productionda http URL rad etiladi', () => {
    const env = { ...base, NODE_ENV: 'production' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/https/);
  });

  it('productionda __Host- cookie nomi', () => {
    const env = { ...base, NODE_ENV: 'production', STUDENT_APP_URL: 'https://a.uz', ADMIN_WEB_URL: 'https://b.uz' };
    expect(loadConfig(env as NodeJS.ProcessEnv).adminCookieName).toBe('__Host-pep_admin');
  });

  it('qisqa INTERNAL_API_KEY va yaroqsiz BOT_TOKEN rad etiladi, xato matnida sirlar chiqmaydi', () => {
    const env = { ...base, INTERNAL_API_KEY: 'short', BOT_TOKEN: 'secret-looking-value' };
    try {
      loadConfig(env as NodeJS.ProcessEnv);
      throw new Error('xato kutilgan edi');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('INTERNAL_API_KEY');
      expect(msg).toContain('BOT_TOKEN');
      expect(msg).not.toContain('secret-looking-value');
    }
  });

  it('ADMIN_TELEGRAM_IDS bo\'sh bo\'lsa rad etiladi', () => {
    expect(() => loadConfig({ ...base, ADMIN_TELEGRAM_IDS: ' ' } as NodeJS.ProcessEnv)).toThrow(/ADMIN_TELEGRAM_IDS/);
  });
});

describe('csv', () => {
  it('formula in\'ektsiyasini zararsizlantiradi', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2')).toBe("'-2");
  });
  it('vergul va yangi qatorni qo\'shtirnoqqa oladi', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });
  it('toCsv BOM va CRLF bilan', () => {
    const out = toCsv(['A', 'B'], [['1', 'Oʻktam']]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toContain('A,B\r\n1,Oʻktam\r\n');
  });
});

describe('crypto', () => {
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it('randomToken noyob va yetarlicha uzun', () => {
    const a = randomToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(randomToken());
    expect(sha256Hex('x')).toHaveLength(64);
  });
});
