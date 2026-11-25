/** Vaqtlar bazada UTC; interfeysda Asia/Tashkent (UTC+5, DST yo'q). */
export const APP_TIME_ZONE = 'Asia/Tashkent';

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "20.11.2026 05:39" */
export function formatTashkent(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** Server deadline asosida qolgan soniyalar (>= 0). Mijoz soatiga emas, server vaqtiga tayanadi. */
export function remainingSeconds(deadline: Date | string | number, serverNow: Date | string | number): number {
  const ms = new Date(deadline).getTime() - new Date(serverNow).getTime();
  return Math.max(0, Math.ceil(ms / 1000));
}

/** 93784 -> "1 kun 2 soat 3 daqiqa". 0 -> "0 daqiqa". */
export function formatCountdownUz(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d} kun`);
  if (h) parts.push(`${h} soat`);
  if (m || parts.length === 0) parts.push(`${m} daqiqa`);
  return parts.join(' ');
}

/** Toshkent doimiy UTC+5 (yozgi vaqt yo'q). `<input type="datetime-local">` qiymati (masalan "2026-11-22T09:00") -> UTC ISO. */
export function tashkentLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]! - 5, +m[5]!);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** UTC ISO -> Toshkent vaqtidagi `datetime-local` qiymati. */
export function isoToTashkentLocal(iso: string): string {
  const d = new Date(Date.parse(iso) + 5 * 3600_000);
  return d.toISOString().slice(0, 16);
}
