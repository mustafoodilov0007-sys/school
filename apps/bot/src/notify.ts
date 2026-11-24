import type { BotApi, DueNotification } from './api-client';

const TZ = 'Asia/Tashkent';
const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export interface Rendered {
  text: string;
  /** Mini App tugmasi (faqat https) */
  webApp?: string;
}

/** Toza funksiya (testlanadi): bildirishnoma turi va ma'lumotidan matn. */
export function renderNotification(n: Pick<DueNotification, 'kind' | 'payload'>, studentAppUrl: string): Rendered | null {
  const title = n.payload.examTitle ?? 'Imtihon';
  const when = fmt(n.payload.startsAt);
  const web = studentAppUrl.startsWith('https://') ? studentAppUrl : undefined;
  switch (n.kind) {
    case 'exam_24h':
      return { text: `⏰ Ertaga imtihon: «${title}»\nBoshlanishi: ${when} (Toshkent vaqti).\nTayyorlaning va Mini App orqali kiring.`, webApp: web };
    case 'exam_30m':
      return { text: `⏰ 30 daqiqadan keyin imtihon boshlanadi: «${title}»\nBoshlanishi: ${when}.`, webApp: web };
    case 'exam_started':
      return { text: `📝 Imtihon boshlandi: «${title}»\nKirish uchun tugmani bosing. Vaqt serverda hisoblanadi.`, webApp: web };
    case 'exam_cancelled':
      return { text: `❌ Imtihon bekor qilindi: «${title}». Yangi vaqt haqida o'qituvchi xabar beradi.` };
    case 'exam_changed':
      return { text: `ℹ️ Imtihon vaqti o'zgardi: «${title}». Yangi vaqt: ${when}.`, webApp: web };
    case 'results_published':
      return { text: `📊 «${title}» natijalari e'lon qilindi. Mini App → Natijalarim.`, webApp: web };
    case 'custom':
      return n.payload.text ? { text: `📢 ${n.payload.text.slice(0, 1000)}`, webApp: web } : null;
    default:
      return null;
  }
}

/** Telegram xatosi qayta urinishga arziydimi? 403 (bot bloklangan), 400 "chat not found" — yo'q. 429/5xx — ha. */
export function isPermanentTelegramError(code: number | undefined, description: string | undefined): boolean {
  if (code === 403) return true;
  if (code === 400 && /chat not found|user is deactivated|bot was blocked/i.test(description ?? '')) return true;
  return false;
}

export interface Sender {
  send(telegramId: number, r: Rendered): Promise<void>;
}

/** Bitta aylanish: navbatdagilarni oladi, yuboradi, natijani xabar qiladi. Qaytaradi: yuborilganlar soni. */
export async function pumpNotifications(api: BotApi, sender: Sender, studentAppUrl: string, limit = 20): Promise<number> {
  const due = await api.claimNotifications(limit);
  let sent = 0;
  for (const n of due) {
    const r = renderNotification(n, studentAppUrl);
    if (!r) {
      await api.reportNotification(n.id, { ok: false, error: `noma'lum tur: ${n.kind}`, permanent: true });
      continue;
    }
    try {
      await sender.send(n.telegramId, r);
      await api.reportNotification(n.id, { ok: true });
      sent++;
    } catch (e) {
      const err = e as { error_code?: number; description?: string; message?: string };
      await api.reportNotification(n.id, {
        ok: false,
        error: (err.description ?? err.message ?? 'xato').slice(0, 300),
        permanent: isPermanentTelegramError(err.error_code, err.description),
      });
    }
    await new Promise((res) => setTimeout(res, 40)); // Telegram chegarasi (~30 xabar/s) dan ancha past
  }
  return sent;
}
