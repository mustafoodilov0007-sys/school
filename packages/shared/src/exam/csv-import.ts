import { QUESTION_TYPES, questionInputSchema, validateQuestion } from './definitions';
import type { QuestionInput } from './definitions';

/**
 * Savollarni CSV dan import qilish (Excel: "Boshqacha saqlash → CSV UTF-8").
 * Ustunlar (sarlavha qatori majburiy, tartib erkin): type, body, topic, grade, difficulty, points, correct, option1..option8,
 * answer, tol_abs, tol_rel_percent, explanation. `correct` — to'g'ri variant(lar) raqami: "2" yoki "1;3" (multi uchun).
 */
export const MAX_IMPORT_ROWS = 300;

/** RFC 4180: qo'shtirnoq, "" escape, qator ichidagi yangi qator; ajratgich (, ; tab) birinchi qatordan aniqlanadi. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => firstLine.split(c).length - 1;
  const delim = count(';') > count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
    i++;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

export interface ImportItem {
  /** Fayldagi qator raqami (sarlavha = 1) */
  row: number;
  topicName: string | null;
  grade: number | null;
  input: QuestionInput;
}
export interface ImportResult {
  items: ImportItem[];
  errors: { row: number; message: string }[];
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

export function rowsToQuestions(table: string[][]): ImportResult {
  const out: ImportResult = { items: [], errors: [] };
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  if (!header.includes('body')) {
    out.errors.push({ row: 1, message: 'Sarlavha qatorida "body" ustuni yo\'q' });
    return out;
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    out.errors.push({ row: 1, message: `Bir martada ko'pi bilan ${MAX_IMPORT_ROWS} ta savol import qilinadi` });
    return out;
  }
  const idx = (name: string) => header.indexOf(name);
  for (let r = 1; r < table.length; r++) {
    const line = table[r] as string[];
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (line[i] ?? '').trim() : '';
    };
    const rowNo = r + 1;
    const fail = (message: string) => out.errors.push({ row: rowNo, message });

    const type = (get('type') || 'text').toLowerCase();
    if (!(QUESTION_TYPES as readonly string[]).includes(type)) {
      fail(`Noma'lum tur "${type}". Mumkin: ${QUESTION_TYPES.join(', ')}`);
      continue;
    }
    const difficulty = num(get('difficulty'));
    const points = num(get('points'));
    const grade = num(get('grade'));
    if ([difficulty, points, grade].some((v) => v !== null && Number.isNaN(v))) {
      fail('difficulty/points/grade son bo\'lishi kerak');
      continue;
    }

    const options: { body: string; isCorrect: boolean }[] = [];
    const base: Record<string, unknown> = {
      type, body: get('body'), explanation: get('explanation') || null,
      difficulty: difficulty ?? 2, points: points ?? 1, tags: [] as string[],
    };

    if (type === 'numeric') {
      const expected = num(get('answer'));
      if (expected === null || Number.isNaN(expected)) {
        fail('Sonli savol uchun "answer" (son) kerak');
        continue;
      }
      const abs = num(get('tol_abs'));
      const rel = num(get('tol_rel_percent'));
      if ([abs, rel].some((v) => v !== null && Number.isNaN(v))) {
        fail('tol_abs/tol_rel_percent son bo\'lishi kerak');
        continue;
      }
      const tolerance: { abs?: number; rel?: number } = {};
      if (abs !== null) tolerance.abs = abs;
      if (rel !== null) tolerance.rel = rel / 100;
      base.options = [];
      base.answerSpec = { expected, tolerance };
    } else {
      const correct = new Set(
        get('correct').split(/[;,\s]+/).filter(Boolean).map((x) => Number(x)),
      );
      for (let k = 1; k <= 8; k++) {
        const body = get(`option${k}`);
        if (body !== '') options.push({ body, isCorrect: correct.has(k) });
      }
      const maxIdx = options.length;
      if ([...correct].some((c) => !Number.isInteger(c) || c < 1 || c > maxIdx)) {
        fail(`"correct" 1 dan ${maxIdx} gacha raqam(lar) bo'lishi kerak`);
        continue;
      }
      base.options = options;
    }

    const parsed = questionInputSchema.safeParse(base);
    if (!parsed.success) {
      fail(parsed.error.issues.map((i) => `${i.path.join('.') || 'savol'}: ${i.message}`).join('; '));
      continue;
    }
    const errs = validateQuestion(parsed.data);
    if (errs.length) {
      fail(errs.join('; '));
      continue;
    }
    out.items.push({ row: rowNo, topicName: get('topic') || null, grade: grade === null ? null : Math.round(grade), input: parsed.data });
  }
  return out;
}

export const importTemplateCsv = [
  'type,body,topic,grade,difficulty,points,correct,option1,option2,option3,option4,answer,tol_abs,tol_rel_percent,explanation',
  'text,"Jism tezligi 10 m/s, vaqt 5 s. Yo\'l necha metr?",Kinematika,9,2,1,2,25 m,50 m,100 m,2 m,,,,"s = v·t"',
  'multi,"Qaysilari vektor kattalik?",Kinematika,9,2,1,"1;3",Tezlanish,Massa,Kuch,Vaqt,,,,',
  'numeric,"$F = ma$, m = 2 kg, a = 3 m/s². F (N)?",Dinamika,9,2,1,,,,,,6,0.1,,',
].join('\n');
