/**
 * CSV maydonini xavfsiz yozadi. Excel/Sheets formulasi in'ektsiyasiga qarshi (=, +, -, @, tab, CR bilan boshlanganlar)
 * boshiga apostrof qo'yiladi; vergul, qo'shtirnoq va yangi qator bo'lsa qo'shtirnoq ichiga olinadi.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** UTF-8 BOM bilan (Excel o'zbekcha harflarni to'g'ri ochishi uchun). */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
