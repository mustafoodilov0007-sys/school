import { ErrorCode } from '@pep/shared';
import { z } from 'zod';
import { hmacSha256Hex, safeEqual } from './crypto';
import { AppError } from './errors';

/**
 * Telegram Mini App `initData` ni rasmiy algoritm bo'yicha tekshiradi:
 * secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN); hash = HMAC_SHA256(key=secret, msg=data_check_string)
 * `initDataUnsafe` ga hech qachon tayanilmaydi — faqat shu yerda tekshirilgan qiymat ishlatiladi.
 */
const userSchema = z.object({
  id: z.number().int().positive().safe(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export interface VerifiedInitData {
  user: z.infer<typeof userSchema>;
  authDate: Date;
}

export function verifyInitData(
  initData: string,
  botToken: string,
  opts: { maxAgeSeconds: number; now?: Date },
): VerifiedInitData {
  const invalid = () => new AppError(401, ErrorCode.INIT_DATA_INVALID, 'Telegram ma\'lumotlari tasdiqlanmadi');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw invalid();

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = Buffer.from(hmacSha256Hex('WebAppData', botToken), 'hex');
  const computed = hmacSha256Hex(secret, dataCheckString);
  if (!safeEqual(computed, hash)) throw invalid();

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSec) || authDateSec <= 0) throw invalid();
  const nowMs = (opts.now ?? new Date()).getTime();
  const ageSec = (nowMs - authDateSec * 1000) / 1000;
  if (ageSec < -60) throw invalid(); // kelajakdagi sana
  if (ageSec > opts.maxAgeSeconds) {
    throw new AppError(401, ErrorCode.INIT_DATA_EXPIRED, 'Sessiya muddati tugagan. Mini Appni qayta oching');
  }

  let userJson: unknown;
  try {
    userJson = JSON.parse(params.get('user') ?? '');
  } catch {
    throw invalid();
  }
  const user = userSchema.safeParse(userJson);
  if (!user.success) throw invalid();
  return { user: user.data, authDate: new Date(authDateSec * 1000) };
}

/** Faqat testlar va lokal vositalar uchun: to'g'ri imzolangan initData yaratadi. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const secret = Buffer.from(hmacSha256Hex('WebAppData', botToken), 'hex');
  const hash = hmacSha256Hex(secret, pairs.join('\n'));
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}
