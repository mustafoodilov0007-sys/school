import { describe, it, expect } from 'vitest';
import type { BotApi, DueNotification } from '../src/api-client';
import { isPermanentTelegramError, pumpNotifications, renderNotification } from '../src/notify';

const n = (kind: string, id = '1'): DueNotification => ({ id, kind, telegramId: 7, attempt: 1, payload: { examTitle: 'Hafta 3', startsAt: '2026-11-22T04:00:00.000Z' } });

describe('bildirishnoma matnlari', () => {
  it('vaqt Toshkent bo\'yicha, https bo\'lsa Mini App tugmasi', () => {
    const r = renderNotification(n('exam_24h'), 'https://app.example.uz');
    expect(r?.text).toContain('Hafta 3');
    expect(r?.text).toContain('09:00');
    expect(r?.webApp).toBe('https://app.example.uz');
    expect(renderNotification(n('exam_30m'), 'http://localhost:5173')?.webApp).toBeUndefined();
  });
  it('bekor qilishda tugma yo\'q; noma\'lum tur null', () => {
    expect(renderNotification(n('exam_cancelled'), 'https://x.uz')?.webApp).toBeUndefined();
    expect(renderNotification(n('custom'), 'https://x.uz')).toBeNull();
  });
  it('doimiy Telegram xatolari', () => {
    expect(isPermanentTelegramError(403, 'Forbidden: bot was blocked by the user')).toBe(true);
    expect(isPermanentTelegramError(400, 'Bad Request: chat not found')).toBe(true);
    expect(isPermanentTelegramError(429, 'Too Many Requests')).toBe(false);
    expect(isPermanentTelegramError(500, 'x')).toBe(false);
  });
});

describe('yuborish aylanishi', () => {
  function fake(items: DueNotification[]) {
    const reports: { id: string; ok: boolean; permanent?: boolean }[] = [];
    const api = { claimNotifications: async () => items, reportNotification: async (id: string, r: { ok: boolean; permanent?: boolean }) => void reports.push({ id, ...r }) } as unknown as BotApi;
    return { api, reports };
  }
  it('muvaffaqiyat, vaqtinchalik xato, bloklangan bot', async () => {
    const { api, reports } = fake([n('exam_started', 'a'), n('exam_started', 'b'), n('exam_started', 'c'), n('custom', 'd')]);
    let i = 0;
    const sender = {
      send: async () => {
        i++;
        if (i === 2) throw { error_code: 429, description: 'Too Many Requests' };
        if (i === 3) throw { error_code: 403, description: 'Forbidden: bot was blocked by the user' };
      },
    };
    const sent = await pumpNotifications(api, sender, 'https://x.uz');
    expect(sent).toBe(1);
    expect(reports).toEqual([
      { id: 'a', ok: true },
      { id: 'b', ok: false, error: 'Too Many Requests', permanent: false },
      { id: 'c', ok: false, error: 'Forbidden: bot was blocked by the user', permanent: true },
      { id: 'd', ok: false, error: 'noma\'lum tur: custom', permanent: true },
    ]);
  });
});
