import { describe, it, expect } from 'vitest';
import { signInitData, verifyInitData } from '../src/lib/telegram-auth';

const TOKEN = '123456789:AAFakeTokenForTestsOnly_0123456789abc';
const NOW = new Date('2026-11-20T10:00:00Z');
const sec = (d: Date) => String(Math.floor(d.getTime() / 1000));
const user = JSON.stringify({ id: 777001, first_name: 'Aziz', username: 'aziz' });

const fields = (authDate: Date) => ({ query_id: 'AAH123', user, auth_date: sec(authDate) });

describe('verifyInitData', () => {
  it('to\'g\'ri imzolangan va yangi ma\'lumotni qabul qiladi', () => {
    const init = signInitData(fields(new Date(NOW.getTime() - 60_000)), TOKEN);
    const r = verifyInitData(init, TOKEN, { maxAgeSeconds: 900, now: NOW });
    expect(r.user.id).toBe(777001);
    expect(r.user.username).toBe('aziz');
  });

  it('boshqa bot tokeni bilan imzolangan ma\'lumotni rad etadi', () => {
    const init = signInitData(fields(NOW), '999:AAOtherBotTokenOtherBotToken_123456');
    expect(() => verifyInitData(init, TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow(/tasdiqlanmadi/);
  });

  it('o\'zgartirilgan maydonni (user.id) aniqlaydi', () => {
    const init = signInitData(fields(NOW), TOKEN);
    const tampered = init.replace(encodeURIComponent('777001'), encodeURIComponent('1'));
    expect(tampered).not.toBe(init);
    expect(() => verifyInitData(tampered, TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
  });

  it('hash yo\'q yoki noto\'g\'ri formatda bo\'lsa rad etadi', () => {
    expect(() => verifyInitData('user=%7B%7D&auth_date=1', TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
    expect(() => verifyInitData(`auth_date=1&hash=zzz`, TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
    expect(() => verifyInitData('', TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
  });

  it('eskirgan ma\'lumotni INIT_DATA_EXPIRED bilan rad etadi', () => {
    const init = signInitData(fields(new Date(NOW.getTime() - 901_000)), TOKEN);
    try {
      verifyInitData(init, TOKEN, { maxAgeSeconds: 900, now: NOW });
      throw new Error('xato kutilgan edi');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INIT_DATA_EXPIRED');
    }
  });

  it('kelajakdagi auth_date ni rad etadi (soat siljishiga 60s chidamlilik)', () => {
    const future = signInitData(fields(new Date(NOW.getTime() + 120_000)), TOKEN);
    expect(() => verifyInitData(future, TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
    const nearFuture = signInitData(fields(new Date(NOW.getTime() + 30_000)), TOKEN);
    expect(verifyInitData(nearFuture, TOKEN, { maxAgeSeconds: 900, now: NOW }).user.id).toBe(777001);
  });

  it('user maydoni yaroqsiz JSON bo\'lsa rad etadi', () => {
    const init = signInitData({ user: 'not-json', auth_date: sec(NOW) }, TOKEN);
    expect(() => verifyInitData(init, TOKEN, { maxAgeSeconds: 900, now: NOW })).toThrow();
  });
});
