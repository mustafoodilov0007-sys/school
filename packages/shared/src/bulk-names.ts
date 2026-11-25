export type NameOrder = 'last_first' | 'first_last';

export interface ParsedNameRow {
  line: number;
  firstName: string;
  lastName: string;
}
export interface ParsedNameError {
  line: number;
  text: string;
  message: string;
}

/**
 * Matn maydonidan ommaviy ro'yxat: har qatorda bitta o'quvchi.
 * "last_first": "Karimov Aziz" (birinchi so'z — familiya, qolgani — ism).
 * "first_last": "Aziz Karimov" (oxirgi so'z — familiya, qolgani — ism).
 * Bo'sh qatorlar o'tkazib yuboriladi. Sonlar/oldidagi tartib raqami ("1.", "2)") olib tashlanadi.
 */
export function parseBulkNameLines(text: string, order: NameOrder = 'last_first') {
  const rows: ParsedNameRow[] = [];
  const errors: ParsedNameError[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const cleaned = raw.replace(/^\s*\d+\s*[.)\-:]?\s+/, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    const words = cleaned.split(' ');
    if (words.length < 2) {
      errors.push({ line: i + 1, text: cleaned, message: 'Ism va familiya kerak (kamida 2 ta so\'z)' });
      return;
    }
    if (order === 'last_first') {
      const [last, ...rest] = words;
      rows.push({ line: i + 1, lastName: last as string, firstName: rest.join(' ') });
    } else {
      const last = words[words.length - 1] as string;
      rows.push({ line: i + 1, lastName: last, firstName: words.slice(0, -1).join(' ') });
    }
  });
  return { rows, errors };
}
