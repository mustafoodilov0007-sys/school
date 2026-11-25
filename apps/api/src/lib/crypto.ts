import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmacSha256Hex = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest('hex');

/** Kriptografik tasodifiy token (URL-xavfsiz). Bazada faqat sha256 hash saqlanadi. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Doimiy vaqtli taqqoslash (uzunliklari har xil bo'lsa ham xavfsiz). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
