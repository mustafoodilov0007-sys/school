/**
 * O'quvchi ID (kod) yordamchilari. Brauzer va Node'da ishlaydi (crypto'ga bog'liq emas).
 * Format: {PREFIX}-{SINF}-{RAQAMLAR}, masalan PH-8A-0417.
 * DB'dagi CHECK bilan mos: ^[A-Z0-9]{1,8}-[A-Z0-9]{1,6}-[0-9]{4,8}$
 */

/** Kirill harflaridan Lotin harflariga o'xshash belgilar (o'qituvchi kirillda yozishi mumkin). */
const LOOKALIKES: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
  а: 'A', в: 'B', с: 'C', е: 'E', н: 'H', к: 'K', м: 'M', о: 'O', р: 'P', т: 'T', х: 'X',
};

function mapLookalikes(input: string): string {
  let out = '';
  for (const ch of input) out += LOOKALIKES[ch] ?? ch;
  return out;
}

export const STUDENT_CODE_RE = /^[A-Z0-9]{1,8}-[A-Z0-9]{1,6}-[0-9]{4,8}$/;
export const CLASS_LABEL_RE = /^[A-Z0-9]{1,6}$/;

/** "8-A" -> "8A", "10 б" -> "10B" (kirill o'xshash harflar Lotinga o'giriladi). Yaroqsiz bo'lsa null. */
export function normalizeClassLabel(name: string): string | null {
  const label = mapLookalikes(name.normalize('NFKC'))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return CLASS_LABEL_RE.test(label) ? label : null;
}

/**
 * Foydalanuvchi kiritgan ID ni bir xil ko'rinishga keltiradi:
 * bo'sh joy, uzun chiziqlar, nuqta va pastki chiziq -> '-', katta harf, kirill o'xshashlari -> Lotin.
 * Juda uzun kirishlar rad etiladi (bo'sh qator qaytadi).
 */
export function normalizeStudentCodeInput(raw: string): string {
  if (raw.length > 40) return '';
  return mapLookalikes(raw.normalize('NFKC'))
    .toUpperCase()
    .replace(/[‐-―−\s_.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidStudentCodeFormat(code: string): boolean {
  return STUDENT_CODE_RE.test(code);
}

/** Loglar uchun: PH-8A-0417 -> PH-8A-****  (xom ID hech qachon logga yozilmaydi). */
export function maskStudentCode(code: string): string {
  const parts = code.split('-');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${parts[0]}-${parts[1]}-${'*'.repeat(parts[2].length)}`;
  }
  return '***';
}

export interface GenerateCodeOptions {
  prefix: string;
  classLabel: string;
  /** 4..8 */
  suffixLength: number;
  /** [0, max) oralig'ida tasodifiy butun son (Node: crypto.randomInt). */
  randomInt: (max: number) => number;
}

/** Yangi nomzod kod. Noyoblikni DB UNIQUE kafolatlaydi; chaqiruvchi to'qnashuvda qayta urinadi. */
export function generateStudentCode(opts: GenerateCodeOptions): string {
  const { prefix, classLabel, suffixLength, randomInt } = opts;
  if (!Number.isInteger(suffixLength) || suffixLength < 4 || suffixLength > 8) {
    throw new RangeError('suffixLength 4..8 oralig\'ida bo\'lishi kerak');
  }
  if (!CLASS_LABEL_RE.test(classLabel)) throw new RangeError('classLabel yaroqsiz');
  if (!/^[A-Z0-9]{1,8}$/.test(prefix)) throw new RangeError('prefix yaroqsiz');
  const n = randomInt(10 ** suffixLength);
  const code = `${prefix}-${classLabel}-${String(n).padStart(suffixLength, '0')}`;
  if (!STUDENT_CODE_RE.test(code)) throw new Error('Yaratilgan kod formati yaroqsiz');
  return code;
}
