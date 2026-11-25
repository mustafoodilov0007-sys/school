import { describe, expect, it } from 'vitest';
import { readXlsx, rowsToCsv, unzip, writeXlsx, zip } from '../src/lib/xlsx';
import { winAnsi, writePdfTable } from '../src/lib/pdf';

describe('xlsx: yozish -> o\'qish', () => {
  it('matn, raqam, maxsus belgilar va o\'zbek harflari saqlanadi', () => {
    const buf = writeXlsx([{ name: 'Natijalar', rows: [['Ism', 'Ball'], ['Oʻktam G‘ofurov <&>', 87.5], ['=1+1', 'a"b'], [null, 'oxirgi']] }]);
    const rows = readXlsx(buf);
    expect(rows[0]).toEqual(['Ism', 'Ball']);
    expect(rows[1]).toEqual(['Oʻktam G‘ofurov <&>', '87.5']);
    expect(rows[2]).toEqual(['=1+1', 'a"b']); // formula emas, matn
    expect(rows[3]).toEqual(['', 'oxirgi']);
  });
  it('ZIP aylanishi va buzuq fayl rad etilishi', () => {
    const z = zip([{ name: 'a.txt', data: Buffer.from('salom'.repeat(100)) }]);
    expect(unzip(z).get('a.txt')?.toString()).toBe('salom'.repeat(100));
    expect(() => readXlsx(Buffer.from('bu zip emas'))).toThrow();
    expect(() => readXlsx(zip([{ name: 'x.txt', data: Buffer.from('1') }]))).toThrow();
  });
  it('bir nechta varaq; rowsToCsv tirnoqlaydi', () => {
    const buf = writeXlsx([{ name: 'A', rows: [['x']] }, { name: 'B/C?', rows: [['y']] }]);
    expect(readXlsx(buf)).toEqual([['x']]);
    expect(rowsToCsv([['a,b', 'c"d'], ['1', '2']])).toBe('"a,b","c""d"\n1,2');
  });
});

describe('pdf: jadval yozuvchi', () => {
  it('to\'g\'ri tuzilma: %PDF, xref, sahifalar soni', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`O'quvchi ${i}`, i, 'Oʻtdi']);
    const pdf = writePdfTable({ title: 'Hafta 1 — natijalar', subtitle: 'Sinf 8-A', head: ['Ism', 'Ball', 'Holat'], rows });
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const pages = Number(/\/Count (\d+)/.exec(s)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    const startx = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(startx, startx + 4)).toBe('xref');
  });
  it('maxsus belgilar qochiriladi, noma\'lum belgi ? bo\'ladi', () => {
    expect([...winAnsi('a(b)\\')].map((x) => String.fromCharCode(x)).join('')).toBe('a(b)\\');
    expect(winAnsi('Привет').toString('latin1')).toBe('??????');
    expect(winAnsi('oʻ').toString('latin1')).toBe("o'");
    const pdf = writePdfTable({ title: 'x', head: ['a'], rows: [['(qavs) \\ ']] }).toString('latin1');
    expect(pdf).toContain('\\(qavs\\)');
  });
});
