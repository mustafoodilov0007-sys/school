/**
 * Bog'liqliksiz minimal PDF jadval yozuvchi (Helvetica, WinAnsi). Hisobotlar uchun: sarlavha + jadval + sahifalash.
 * Cheklov: faqat Latin (o‘, g‘, sh, ch kabi o'zbek lotin harflari ishlaydi); kirill va boshqa belgilar "?" bo'ladi.
 */

/** Matnni WinAnsi baytlariga o'tkazadi; PDF satr literali uchun xavfsiz. */
export function winAnsi(s: string): Buffer {
  const out: number[] = [];
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) as number;
    let b: number;
    if (c === 0x2018) b = 0x91; else if (c === 0x2019) b = 0x92; else if (c === 0x201c) b = 0x93; else if (c === 0x201d) b = 0x94;
    else if (c === 0x2013) b = 0x96; else if (c === 0x2014) b = 0x97; else if (c === 0x2026) b = 0x85;
    else if (c === 0x2bb || c === 0x2bc || c === 0x60 || c === 0xb4) b = 0x27; // oʻ, gʻ -> '
    else if (c < 32) b = 0x20;
    else if (c < 128 || (c >= 0xa0 && c <= 0xff)) b = c;
    else b = 0x3f;
    out.push(b);
  }
  return Buffer.from(out);
}

const lit = (s: string) => {
  const b = winAnsi(s);
  const parts: number[] = [0x28];
  for (const x of b) { if (x === 0x28 || x === 0x29 || x === 0x5c) parts.push(0x5c); parts.push(x); }
  parts.push(0x29);
  return Buffer.from(parts);
};

export interface PdfTable { title: string; subtitle?: string; head: string[]; rows: (string | number | null | undefined)[][]; widths?: number[]; landscape?: boolean }

/** Taxminiy Helvetica kengligi: o'rtacha 0.52 em. */
const fit = (s: string, widthPt: number, size: number) => {
  const max = Math.max(1, Math.floor(widthPt / (size * 0.52)));
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`;
};

export function writePdfTable(t: PdfTable): Buffer {
  const W = t.landscape ? 842 : 595, H = t.landscape ? 595 : 842, M = 36;
  const usable = W - 2 * M;
  const n = t.head.length;
  const w = (t.widths && t.widths.length === n ? t.widths : Array(n).fill(1)) as number[];
  const sum = w.reduce((a, b) => a + b, 0);
  const cols = w.map((x) => (x / sum) * usable);
  const size = 9, lead = 14;
  const pages: string[][] = [];
  let cur: Buffer[] = [];
  const pageHeight = H - 2 * M;
  const headerLines = t.subtitle ? 3 : 2;
  const perFirst = Math.floor(pageHeight / lead) - headerLines - 1;
  const perNext = Math.floor(pageHeight / lead) - 2;
  const chunks: (typeof t.rows)[] = [];
  let i = 0;
  chunks.push(t.rows.slice(i, i + perFirst)); i += perFirst;
  while (i < t.rows.length) { chunks.push(t.rows.slice(i, i + perNext)); i += perNext; }
  void pages; void cur;

  const objs: Buffer[] = [];
  const add = (b: Buffer | string) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objs.length; };
  const catalog = add(''); const pagesObj = add(''); const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];
  chunks.forEach((rows, pi) => {
    const ops: Buffer[] = [];
    const text = (x: number, y: number, s: string, bold = false, sz = size) => {
      ops.push(Buffer.from(`BT /${bold ? 'F2' : 'F1'} ${sz} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td `, 'latin1'), lit(s), Buffer.from(' Tj ET\n', 'latin1'));
    };
    let y = H - M;
    if (pi === 0) {
      text(M, y - 12, fit(t.title, usable, 14), true, 14); y -= lead + 8;
      if (t.subtitle) { text(M, y - 8, fit(t.subtitle, usable, 9), false, 9); y -= lead; }
    }
    const row = (cells: string[], bold: boolean) => {
      let x = M;
      cells.forEach((c, k) => { text(x + 2, y - 9, fit(c, (cols[k] as number) - 4, size), bold); x += cols[k] as number; });
      ops.push(Buffer.from(`0.8 w ${M} ${(y - 12).toFixed(1)} m ${W - M} ${(y - 12).toFixed(1)} l S\n`, 'latin1'));
      y -= lead;
    };
    row(t.head, true);
    for (const r of rows) row(r.map((v) => (v === null || v === undefined ? '' : String(v))), false);
    text(W - M - 60, M - 14, `${pi + 1} / ${chunks.length}`, false, 8);
    const content = Buffer.concat(ops);
    const cid = add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${cid} 0 R >>`));
  });
  objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`, 'latin1');
  objs[pagesObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((x) => `${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'latin1');
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let pos = parts[0]!.length;
  objs.forEach((o, k) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${k + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(b); pos += b.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
