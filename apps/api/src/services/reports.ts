/** Hisobotlar: Excel (.xlsx) va PDF. Faqat admin; har bir eksport auditga yoziladi. Javoblar kaliti faqat `includeKey` bilan va admin ruxsatida. */
import type { Pool } from '../db/pool';
import type { StudentDto } from '@pep/shared';
import { notFound } from '../lib/errors';
import { writePdfTable } from '../lib/pdf';
import type { PdfTable } from '../lib/pdf';
import { writeXlsx } from '../lib/xlsx';
import type { Sheet } from '../lib/xlsx';
import { writeAudit } from './audit';
import type { Actor } from './audit';
import { getExamResults, getQuestionStats } from './results';
import { listStudents } from './students';

export interface Report { xlsx: Buffer; pdf: Buffer; baseName: string }

const tz = (d: string | Date | null) =>
  d ? new Date(d).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 40) || 'hisobot';
const pct = (v: number | null) => (v === null ? '' : Math.round(v * 10) / 10);

/* ───────────── Imtihon hisoboti ───────────── */

export async function examReport(pool: Pool, actor: Actor, examId: string, includeKey: boolean): Promise<Report> {
  const res = await getExamResults(pool, examId);
  const stats = await getQuestionStats(pool, examId);
  const pass = res.exam.passPercent;
  const head = ['Sinf', 'Familiya, ism', 'ID', 'Urinishlar', 'Ball', 'Maks.', 'Foiz', 'Natija', 'Yakun sababi', 'Daqiqa'];
  const done = res.rows.filter((r) => r.percent !== null);
  const table = done.map((r) => [r.className, r.name, r.code, r.attempts, r.score, r.maxScore, pct(r.percent), r.passed ? 'O\'tdi' : 'O\'tmadi', r.finishReason ?? '', r.durationMinutes]);
  const notStarted = res.rows.filter((r) => r.attempts === 0).map((r) => [r.className, r.name, r.code]);
  const below = done.filter((r) => (r.percent ?? 0) < pass).map((r) => [r.className, r.name, r.code, pct(r.percent)]);
  const s = res.summary;
  const summary: (string | number)[][] = [
    ['Ko\'rsatkich', 'Qiymat'], ['Imtihon', res.exam.title], ['Holat', res.exam.status], ['O\'tish foizi', pass],
    ['Topshirganlar', done.length], ['Topshirmaganlar', notStarted.length], ['O\'rtacha %', s.average === null ? '' : Math.round(s.average * 10) / 10],
    ['Eng yuqori %', s.max ?? ''], ['Eng past %', s.min ?? ''], ['O\'tganlar %', s.passRate === null ? '' : Math.round(s.passRate * 10) / 10],
  ];
  const sheets: Sheet[] = [
    { name: 'Xulosa', rows: summary, colWidths: [24, 40] },
    { name: 'Natijalar', rows: [head, ...table], colWidths: [10, 30, 14, 10, 8, 8, 8, 10, 14, 8] },
    { name: 'Topshirmaganlar', rows: [['Sinf', 'Familiya, ism', 'ID'], ...notStarted], colWidths: [10, 30, 14] },
    { name: `${pass}% dan past`, rows: [['Sinf', 'Familiya, ism', 'ID', 'Foiz'], ...below], colWidths: [10, 30, 14, 8] },
    { name: 'Savollar', rows: [['Savol', 'Ko\'rsatilgan', 'Javob berilgan', 'To\'g\'ri', 'To\'g\'ri %', 'Qiyinlik', 'Bekor'], ...stats.map((q) => [q.body.slice(0, 120), q.shown, q.answered, q.correct, q.correctPercent ?? '', q.difficulty, q.voided ? 'ha' : ''])], colWidths: [60, 12, 14, 10, 10, 12, 8] },
  ];
  if (includeKey) {
    const key = await pool.query<{ body: string; answer: string }>(
      `SELECT q.body, CASE WHEN q.param_spec IS NOT NULL THEN 'parametrli: ' || (q.param_spec->'answer'->>'expr')
                           WHEN q.answer_spec IS NOT NULL THEN (q.answer_spec->>'expected')
                           ELSE coalesce((SELECT string_agg(o.body, ' | ' ORDER BY o.position) FROM question_options o WHERE o.question_id = q.id AND o.is_correct), '') END AS answer
         FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = $1 ORDER BY eq.position NULLS LAST`,
      [examId],
    );
    sheets.push({ name: 'Javob kaliti', rows: [['Savol', 'To\'g\'ri javob'], ...key.rows.map((k) => [k.body.slice(0, 150), k.answer])], colWidths: [70, 40] });
  }
  const pdfT: PdfTable = {
    title: `${res.exam.title} — natijalar`,
    subtitle: `Topshirgan: ${done.length}, topshirmagan: ${notStarted.length}, o'rtacha: ${s.average === null ? '-' : Math.round(s.average * 10) / 10}%, o'tish: ${pass}%`,
    head: ['Sinf', 'Familiya, ism', 'ID', 'Ball', 'Foiz', 'Natija'],
    widths: [1, 4, 2, 1.2, 1, 1.4],
    rows: done.map((r) => [r.className, r.name, r.code, `${r.score}/${r.maxScore}`, pct(r.percent), r.passed ? 'O\'tdi' : 'O\'tmadi']),
  };
  await writeAudit(pool, actor, { action: 'report.export', entityType: 'exam', entityId: examId, after: { kind: 'exam', includeKey } });
  return { xlsx: writeXlsx(sheets), pdf: writePdfTable(pdfT), baseName: `natijalar_${slug(res.exam.title)}` };
}

/* ───────────── Sinf hisoboti ───────────── */

export async function classReport(pool: Pool, actor: Actor, classId: string): Promise<Report> {
  const c = await pool.query<{ name: string }>('SELECT name FROM classes WHERE id = $1', [classId]);
  if (!c.rows[0]) throw notFound('Sinf topilmadi');
  const exams = await pool.query<{ id: string; title: string }>(
    `SELECT e.id, e.title FROM exams e JOIN exam_classes ec ON ec.exam_id = e.id WHERE ec.class_id = $1 AND e.status = 'finished' ORDER BY e.starts_at DESC LIMIT 12`,
    [classId],
  );
  const list = [...exams.rows].reverse();
  const students = await pool.query<{ id: string; name: string }>(`SELECT id, last_name || ' ' || first_name AS name FROM students WHERE class_id = $1 AND is_active ORDER BY last_name, first_name`, [classId]);
  const fin = await pool.query<{ student_id: string; exam_id: string; percent: string }>(
    `SELECT a.student_id, a.exam_id, a.percent FROM attempts a WHERE a.is_final AND a.status IN ('submitted','expired') AND a.exam_id = ANY($1::uuid[])`,
    [list.map((e) => e.id)],
  );
  const map = new Map(fin.rows.map((f) => [`${f.student_id}|${f.exam_id}`, Number(f.percent)]));
  const rows = students.rows.map((s) => {
    const vals = list.map((e) => map.get(`${s.id}|${e.id}`) ?? null);
    const got = vals.filter((v): v is number => v !== null);
    return { name: s.name, vals, avg: got.length ? Math.round((got.reduce((a, b) => a + b, 0) / got.length) * 10) / 10 : null };
  });
  const head = ['Familiya, ism', ...list.map((e) => e.title.slice(0, 18)), 'O\'rtacha'];
  const body = rows.map((r) => [r.name, ...r.vals.map((v) => (v === null ? '—' : pct(v))), r.avg ?? '']);
  await writeAudit(pool, actor, { action: 'report.export', entityType: 'class', entityId: classId, after: { kind: 'class' } });
  return {
    xlsx: writeXlsx([{ name: 'Sinf', rows: [head, ...body], colWidths: [30, ...list.map(() => 14), 10] }]),
    pdf: writePdfTable({ title: `${c.rows[0].name} sinf — natijalar (%)`, subtitle: `Tugagan imtihonlar: ${list.length}`, head, rows: body, widths: [4, ...list.map(() => 1.4), 1.2], landscape: true }),
    baseName: `sinf_${slug(c.rows[0].name)}`,
  };
}

/* ───────────── O'quvchi hisoboti ───────────── */

export async function studentReport(pool: Pool, actor: Actor, studentId: string): Promise<Report> {
  const s = await pool.query<{ name: string; code: string; class_name: string }>(
    `SELECT s.last_name || ' ' || s.first_name AS name, s.code, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`, [studentId]);
  const st = s.rows[0];
  if (!st) throw notFound('O\'quvchi topilmadi');
  const a = await pool.query<{ title: string; attempt_no: number; status: string; score: string; max_score: string; percent: string; submitted_at: Date; is_final: boolean; pass_percent: string }>(
    `SELECT e.title, a.attempt_no, a.status, a.score, a.max_score, a.percent, a.submitted_at, a.is_final, e.pass_percent
       FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.student_id = $1 AND a.status IN ('submitted','expired') ORDER BY a.submitted_at DESC LIMIT 200`, [studentId]);
  const head = ['Imtihon', 'Urinish', 'Ball', 'Foiz', 'Natija', 'Yakuniy', 'Sana'];
  const body = a.rows.map((r) => [r.title, r.attempt_no, `${Number(r.score)}/${Number(r.max_score)}`, Number(r.percent), Number(r.percent) >= Number(r.pass_percent) ? 'O\'tdi' : 'O\'tmadi', r.is_final ? 'ha' : '', tz(r.submitted_at)]);
  await writeAudit(pool, actor, { action: 'report.export', entityType: 'student', entityId: studentId, after: { kind: 'student' } });
  return {
    xlsx: writeXlsx([{ name: 'Natijalar', rows: [head, ...body], colWidths: [34, 9, 10, 8, 10, 9, 18] }]),
    pdf: writePdfTable({ title: `${st.name} — natijalar tarixi`, subtitle: `Sinf: ${st.class_name}, ID: ${st.code}`, head, rows: body, widths: [4, 1, 1.4, 1, 1.3, 1.1, 2.2] }),
    baseName: `oquvchi_${slug(st.name)}`,
  };
}

/* ───────────── Haftalik umumiy hisobot ───────────── */

export async function weeklyReport(pool: Pool, actor: Actor, from: Date, to: Date): Promise<Report> {
  const ex = await pool.query<{ id: string; title: string; starts_at: Date; pass_percent: string }>(
    `SELECT id, title, starts_at, pass_percent FROM exams WHERE status = 'finished' AND starts_at >= $1 AND starts_at < $2 ORDER BY starts_at`, [from, to]);
  const rows: (string | number)[][] = [];
  const weak: (string | number)[][] = [];
  for (const e of ex.rows) {
    const r = await getExamResults(pool, e.id);
    const done = r.rows.filter((x) => x.percent !== null);
    rows.push([e.title, tz(e.starts_at), done.length, r.notStarted, r.summary.average === null ? '' : Math.round(r.summary.average * 10) / 10, r.summary.passRate === null ? '' : Math.round(r.summary.passRate * 10) / 10]);
    for (const x of done.filter((d) => (d.percent ?? 0) < r.exam.passPercent)) weak.push([e.title, x.className, x.name, pct(x.percent)]);
  }
  const head = ['Imtihon', 'Sana', 'Topshirgan', 'Topshirmagan', 'O\'rtacha %', 'O\'tganlar %'];
  const range = `${tz(from)} — ${tz(to)}`;
  await writeAudit(pool, actor, { action: 'report.export', entityType: 'report', after: { kind: 'weekly', from, to } });
  return {
    xlsx: writeXlsx([
      { name: 'Haftalik', rows: [head, ...rows], colWidths: [34, 18, 12, 14, 12, 12] },
      { name: 'Past natijalar', rows: [['Imtihon', 'Sinf', 'O\'quvchi', 'Foiz'], ...weak], colWidths: [34, 10, 30, 8] },
    ]),
    pdf: writePdfTable({ title: 'Haftalik umumiy hisobot', subtitle: range, head, rows, widths: [4, 2.2, 1.3, 1.5, 1.4, 1.4], landscape: true }),
    baseName: `haftalik_${from.toISOString().slice(0, 10)}`,
  };
}

/* ───────────── O'quvchi ID'lari ───────────── */

export async function codesReport(pool: Pool, actor: Actor, classId?: string): Promise<Report> {
  if (classId) {
    const c = await pool.query('SELECT 1 FROM classes WHERE id = $1', [classId]);
    if (c.rowCount === 0) throw notFound('Sinf topilmadi');
  }
  const all: StudentDto[] = [];
  for (let offset = 0; ; offset += 200) {
    const { items } = await listStudents(pool, { classId, active: true, limit: 200, offset });
    all.push(...items);
    if (items.length < 200) break;
  }
  const head = ['Sinf', 'Familiya', 'Ism', 'ID', 'Telegram'];
  const body = all.map((s) => [s.className, s.lastName, s.firstName, s.code, s.isLinked ? 'bog\'langan' : 'bog\'lanmagan']);
  await writeAudit(pool, actor, { action: 'student.export_codes', entityType: 'class', entityId: classId ?? null, after: { count: all.length, format: 'xlsx/pdf' } });
  return {
    xlsx: writeXlsx([{ name: 'ID lar', rows: [head, ...body], colWidths: [10, 20, 20, 16, 14] }]),
    pdf: writePdfTable({ title: 'O\'quvchi ID\'lari', subtitle: 'Maxfiy: har bir o\'quvchiga faqat o\'zining ID\'sini bering', head, rows: body, widths: [1, 2, 2, 2, 1.6] }),
    baseName: 'oquvchi_idlari',
  };
}
