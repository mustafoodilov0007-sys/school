/**
 * Yakuniy bosqich integratsion testlari: qo'shimcha vaqt, ball tuzatish, xabar, shikoyat, material, PDF-kalit imtihoni, qurilma siyosati, hisobotlar.
 * TEST_DATABASE_URL kerak (nomi `_test` bilan tugaydi; public sxema TOZALANADI).
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import type { Config } from '../src/config';
import { createPool } from '../src/db/pool';
import type { Pool } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';
import { createClass } from '../src/services/classes';
import { createStudent } from '../src/services/students';
import { createQuestion } from '../src/services/question-bank';
import { createExam, transitionExam } from '../src/services/exams';
import { finishAttempt, getAttemptForStudent, saveAnswer, startAttempt } from '../src/services/attempts';
import type { Actor } from '../src/services/audit';
import { acquireTestDbLock } from './helpers/db-lock';

const URL_ = process.env.TEST_DATABASE_URL ?? '';
const SYS: Actor = { type: 'system' };
const uuid = () => crypto.randomUUID();

import { getStudentAnalytics, listStudentResults, publishResults } from '../src/services/results';
import { getMediaForStudent, saveMedia } from '../src/services/media';
import { addExtraTime, adjustScore, broadcast, createComplaint, listComplaints, listMaterialsForStudent, resolveComplaint, saveMaterial } from '../src/services/extras';
import { bulkUpdateQuestions, duplicateQuestion, listQuestions } from '../src/services/question-bank';
import { classReport, codesReport, examReport, studentReport, weeklyReport } from '../src/services/reports';
import { enforceSingleDevice } from '../src/services/student-auth';
import { createSession } from '../src/services/sessions';
import { readXlsx } from '../src/lib/xlsx';

describe.skipIf(!URL_)('yakuniy bosqich (PostgreSQL)', () => {
  let pool: Pool;
  let releaseLock: () => Promise<void> = async () => undefined;
  let classId = '';
  let otherClassId = '';
  let examId = '';
  let s1 = '';
  let s2 = '';
  let s3 = '';
  let sOther = '';
  let qIds: string[] = [];

  async function answerAll(studentId: string, attemptId: string, correct: boolean) {
    const a = await getAttemptForStudent(pool, studentId, attemptId);
    for (const q of a.questions) {
      const r = await pool.query<{ ids: string[] }>(
        `SELECT coalesce((SELECT array_agg(o.id) FROM question_options o WHERE o.question_id = aq.question_id AND o.is_correct), '{}') AS ids FROM attempt_questions aq WHERE aq.id = $1`,
        [q.id],
      );
      const ids = r.rows[0]!.ids;
      const wrong = q.options.find((o) => !ids.includes(o.id));
      await saveAnswer(pool, studentId, attemptId, {
        clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: correct ? ids : wrong ? [wrong.id] : [], numericValue: null, isFlagged: false,
      });
    }
  }
  const mkExam = async (title: string, extra: Record<string, unknown> = {}) => {
    const id = await createExam(pool, SYS, {
      title, source: 'manual', classIds: [classId], startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 2 * 3600_000),
      durationMinutes: 40, questionIds: qIds, passPercent: 60, shuffleQuestions: false, shuffleOptions: false, retakeAllowed: false,
      finalAttemptPolicy: 'best', lateSubmitGraceSeconds: 0, resultsPolicy: 'after_end', ...extra,
    } as never);
    await transitionExam(pool, SYS, id, 'scheduled');
    await transitionExam(pool, SYS, id, 'running');
    return id;
  };

  beforeAll(async () => {
    if (!/_test(\?|$)/.test(URL_)) throw new Error('TEST_DATABASE_URL nomi _test bilan tugashi shart');
    const cfg: Config = loadConfig({
      NODE_ENV: 'test', DATABASE_URL: URL_, BOT_TOKEN: '123456789:AAFakeTokenForTestsOnly_0123456789abc',
      INTERNAL_API_KEY: 'k'.repeat(40), ADMIN_TELEGRAM_IDS: '900001',
      STUDENT_APP_URL: 'http://localhost:5173', ADMIN_WEB_URL: 'http://localhost:5174', LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);
    releaseLock = await acquireTestDbLock(URL_);
    pool = createPool(URL_, 6);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool, fileURLToPath(new URL('../../../db/migrations', import.meta.url)), () => undefined);

    classId = (await createClass(pool, SYS, '9-B')).id;
    otherClassId = (await createClass(pool, SYS, '10-A')).id;
    s1 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Aziz', lastName: 'Karimov' })).id;
    s2 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Nilufar', lastName: 'Ergasheva' })).id;
    s3 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Bobur', lastName: 'Olimov' })).id;
    sOther = (await createStudent(pool, cfg, SYS, { classId: otherClassId, firstName: 'Sardor', lastName: 'Aliyev' })).id;
    await pool.query(`UPDATE students SET telegram_id = 700001, telegram_linked_at = now() WHERE id = $1`, [s1]);
    await pool.query(`UPDATE students SET telegram_id = 700002, telegram_linked_at = now() WHERE id = $1`, [s2]);

    const single = (body: string) => ({
      type: 'text' as const, body, difficulty: 2, tags: [], points: 1,
      options: [{ body: 'to\'g\'ri', isCorrect: true }, { body: 'xato1', isCorrect: false }, { body: 'xato2', isCorrect: false }],
    });
    qIds = [await createQuestion(pool, SYS, single('S1')), await createQuestion(pool, SYS, single('S2'))];
    examId = await mkExam('Hafta 3');
  });

  afterAll(async () => {
    await pool?.end();
    await releaseLock();
  });

  it('qo\'shimcha vaqt: faol urinish muddati uzayadi, faol bo\'lmaganiga berilmaydi, audit yoziladi', async () => {
    await expect(addExtraTime(pool, SYS, examId, s1, 10, 'internet uzilishi')).rejects.toThrow(); // hali urinish yo'q
    const a = await startAttempt(pool, s1, examId);
    const before = new Date((await getAttemptForStudent(pool, s1, a.id)).deadlineAt).getTime();
    const r = await addExtraTime(pool, SYS, examId, s1, 10, 'internet uzilishi');
    expect(new Date(r.deadlineAt).getTime() - before).toBe(10 * 60_000);
    await expect(addExtraTime(pool, SYS, examId, s1, 0, 'xato')).rejects.toThrow();
    await expect(addExtraTime(pool, SYS, examId, s1, 10, 'x')).rejects.toThrow(); // sabab juda qisqa
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'attempt.extra_time'`)).rowCount).toBe(1);
    await answerAll(s1, a.id, true);
    await finishAttempt(pool, a.id, 'student', s1);
    await expect(addExtraTime(pool, SYS, examId, s1, 5, 'yana')).rejects.toThrow(); // yakunlangan
  });

  it('qo\'lda ball: sabab majburiy, maksimaldan oshmaydi, tarix saqlanadi, yakuniy natija yangilanadi', async () => {
    const att = (await pool.query<{ id: string }>(`SELECT id FROM attempts WHERE student_id = $1 AND exam_id = $2`, [s1, examId])).rows[0]!.id;
    await expect(adjustScore(pool, SYS, att, 1, '')).rejects.toThrow();
    await expect(adjustScore(pool, SYS, att, 99, 'ortiqcha')).rejects.toThrow();
    const r = await adjustScore(pool, SYS, att, 1, 'savol noto\'g\'ri baholangan');
    expect(r).toMatchObject({ score: 1, maxScore: 2, percent: 50, passed: false });
    const row = await pool.query<{ score: string; percent: string }>('SELECT score, percent FROM attempts WHERE id = $1', [att]);
    expect(Number(row.rows[0]!.score)).toBe(1);
    const hist = await pool.query<{ old_score: string; new_score: string }>('SELECT old_score, new_score FROM score_adjustments WHERE attempt_id = $1', [att]);
    expect(hist.rows).toHaveLength(1);
    expect(Number(hist.rows[0]!.old_score)).toBe(2);
    const live = await startAttempt(pool, s2, examId); // faol urinishga ball tuzatib bo'lmaydi
    await expect(adjustScore(pool, SYS, live.id, 1, 'sabab bor')).rejects.toThrow();
    await answerAll(s2, live.id, false);
    await finishAttempt(pool, live.id, 'student', s2);
  });

  it('xabar yuborish: faqat Telegram\'ga bog\'langan faol o\'quvchilar, boshqa sinfga bormaydi', async () => {
    const r = await broadcast(pool, SYS, { classIds: [classId], studentIds: [], text: 'Ertaga imtihon soat 10:00 da' });
    expect(r).toEqual({ queued: 2, withoutTelegram: 1 }); // s1, s2 bor; s3 yo'q
    const rows = await pool.query<{ student_id: string; payload: { text: string } }>(`SELECT student_id, payload FROM notifications WHERE kind = 'custom'`);
    expect(rows.rows.map((x) => x.student_id).sort()).toEqual([s1, s2].sort());
    expect(rows.rows[0]!.payload.text).toContain('Ertaga');
    await expect(broadcast(pool, SYS, { classIds: [], studentIds: [], text: 'x' })).rejects.toThrow();
    await expect(broadcast(pool, SYS, { classIds: [classId], studentIds: [], text: ' ' })).rejects.toThrow();
  });

  it('shikoyat: e\'lon qilinmaguncha mumkin emas; keyin bitta ochiq; begona urinishga mumkin emas; hal qilish o\'quvchiga xabar beradi', async () => {
    const att = (await pool.query<{ id: string }>(`SELECT id FROM attempts WHERE student_id = $1 AND exam_id = $2`, [s1, examId])).rows[0]!.id;
    await expect(createComplaint(pool, s1, att, null, 'Baho noto\'g\'ri')).rejects.toThrow(); // natija hali ko'rinmaydi
    await transitionExam(pool, SYS, examId, 'finished');
    await publishResults(pool, SYS, examId);
    const id = await createComplaint(pool, s1, att, null, 'Baho noto\'g\'ri');
    await expect(createComplaint(pool, s1, att, null, 'Yana bir marta')).rejects.toThrow(); // ochiq shikoyat bor
    await expect(createComplaint(pool, s2, att, null, 'Boshqaning natijasi')).rejects.toThrow(); // begona urinish
    const aq = (await pool.query<{ id: string }>('SELECT id FROM attempt_questions WHERE attempt_id = $1 LIMIT 1', [att])).rows[0]!.id;
    await createComplaint(pool, s1, att, aq, 'Bu savol noto\'g\'ri'); // boshqa obyekt — mumkin
    expect((await listComplaints(pool, 'open')).length).toBe(2);
    await resolveComplaint(pool, SYS, id, 'accepted', 'Ball tuzatildi');
    await expect(resolveComplaint(pool, SYS, id, 'rejected', 'qayta')).rejects.toThrow(); // allaqachon ko'rilgan
    const n = await pool.query(`SELECT 1 FROM notifications WHERE dedupe_key = $1`, [`complaint:${id}`]);
    expect(n.rowCount).toBe(1);
  });

  it('o\'quvchi tahlili: faqat e\'lon qilingan natijalar dinamikasi', async () => {
    const a = await getStudentAnalytics(pool, s1);
    expect(a.history).toHaveLength(1);
    expect(a.history[0]!.percent).toBe(50);
    expect((await listStudentResults(pool, s1))[0]).toMatchObject({ rank: null, rankTotal: null }); // reyting yoqilmagan
    expect((await getStudentAnalytics(pool, s3)).history).toHaveLength(0);
  });

  it('materiallar: o\'z sinfining NASHR QILINGANI ko\'rinadi; fayliga faqat shu sinf o\'quvchisi kira oladi', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('material-rasm')]);
    const media = await saveMedia(pool, SYS, png, 'image');
    const base = { classId, isPublished: true, title: 'Nyuton qonunlari', summary: 'Konspekt', mediaId: media.id };
    await saveMaterial(pool, SYS, null, base);
    await saveMaterial(pool, SYS, null, { ...base, title: 'Qoralama', isPublished: false, mediaId: null });
    await saveMaterial(pool, SYS, null, { ...base, classId: otherClassId, title: 'Boshqa sinf', mediaId: null });
    await expect(saveMaterial(pool, SYS, null, { ...base, videoUrl: 'javascript:alert(1)' })).rejects.toThrow();
    const mine = await listMaterialsForStudent(pool, s3);
    expect(mine.map((m) => (m as { title: string }).title)).toEqual(['Nyuton qonunlari']);
    expect((await getMediaForStudent(pool, s3, media.id)).mime).toBe('image/png');
    await expect(getMediaForStudent(pool, sOther, media.id)).rejects.toThrow();
  });

  it('PDF rejimi: kalitdan savollar yaratiladi, tartib aralashmaydi, kalit bankda ko\'rinmaydi', async () => {
    const pdf = await saveMedia(pool, SYS, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj'), 'pdf');
    const id = await mkExam('PDF nazorat', { questionIds: [], pdfMediaId: pdf.id, pdfAnswerKey: 'BADC', shuffleQuestions: true, shuffleOptions: true });
    const e = await pool.query<{ mode: string; shuffle_options: boolean; shuffle_questions: boolean; question_count: number }>('SELECT mode, shuffle_options, shuffle_questions, question_count FROM exams WHERE id = $1', [id]);
    expect(e.rows[0]).toMatchObject({ mode: 'pdf', shuffle_options: false, shuffle_questions: false, question_count: 4 });
    const a = await startAttempt(pool, s3, id);
    expect(a.pdfMediaId).toBe(pdf.id);
    expect(a.questions).toHaveLength(4);
    // har bir topshiriqda to'g'ri variant kalitdagi harfga mos (A–D tartibi saqlangan)
    const letters: string[] = [];
    for (const q of a.questions) {
      const r = await pool.query<{ body: string }>(
        `SELECT o.body FROM attempt_questions aq JOIN question_options o ON o.question_id = aq.question_id AND o.is_correct WHERE aq.id = $1`, [q.id]);
      letters.push(r.rows[0]!.body);
      expect(q.options.map((o) => o.body)).toEqual(['A', 'B', 'C', 'D']);
    }
    expect(letters.join('')).toBe('BADC');
    // o'quvchi javobida to'g'ri javob belgisi yo'q
    expect(JSON.stringify(a)).not.toContain('isCorrect');
    // PDF-kalit savollari savollar bankida ko'rinmaydi
    const bank = await listQuestions(pool, { includeArchived: true, limit: 100, offset: 0 } as never);
    expect(bank.some((q) => (q as { body: string }).body.includes('PDF varaqqa'))).toBe(false);
    await expect(mkExam('Noto\'g\'ri', { questionIds: [], pdfAnswerKey: 'AB' })).rejects.toThrow(); // PDF faylsiz
  });

  it('qurilma siyosati: faol imtihon boshqa qurilmada ochiq bo\'lsa rad; jim bo\'lsa egallanadi; faol urinish bo\'lmasa tegilmaydi', async () => {
    const cfg2 = { ttlHours: 24 };
    const open = await pool.query<{ id: string }>(`SELECT id FROM attempts WHERE student_id = $1 AND status = 'in_progress'`, [s3]);
    for (const o of open.rows) await finishAttempt(pool, o.id, 'student', s3);
    await createSession(pool, { subject: 'student', subjectId: s3, ttlHours: cfg2.ttlHours, deviceId: 'dev-A' });
    await enforceSingleDevice(pool, s3, 700003, 'dev-B'); // urinish yo'q — jim o'tadi
    const exam = await mkExam('Qurilma');
    const a = await startAttempt(pool, s3, exam);
    await pool.query('UPDATE attempts SET last_heartbeat_at = now() WHERE id = $1', [a.id]);
    await expect(enforceSingleDevice(pool, s3, 700003, 'dev-B')).rejects.toThrow(/boshqa qurilma/i);
    await enforceSingleDevice(pool, s3, 700003, 'dev-A'); // o'sha qurilma — mumkin
    await pool.query(`UPDATE attempts SET last_heartbeat_at = now() - interval '5 minutes' WHERE id = $1`, [a.id]);
    await enforceSingleDevice(pool, s3, 700003, 'dev-B'); // eski qurilma jim — egallanadi
    const revoked = await pool.query(`SELECT 1 FROM sessions WHERE student_id = $1 AND device_id = 'dev-A' AND revoked_at IS NOT NULL`, [s3]);
    expect(revoked.rowCount).toBeGreaterThan(0);
    const audit = await pool.query(`SELECT action FROM audit_logs WHERE action IN ('student.second_device_denied','student.device_takeover') ORDER BY created_at`);
    expect(audit.rows.map((x: { action: string }) => x.action)).toEqual(['student.second_device_denied', 'student.device_takeover']);
  });

  it('savollar banki: nusxalash va ommaviy tahrir', async () => {
    const copy = await duplicateQuestion(pool, SYS, qIds[0]!);
    expect(copy).not.toBe(qIds[0]);
    const opts = await pool.query('SELECT 1 FROM question_options WHERE question_id = $1', [copy]);
    expect(opts.rowCount).toBe(3);
    expect(await bulkUpdateQuestions(pool, SYS, [copy, qIds[1]!], { action: 'set_difficulty', difficulty: 5 })).toBe(2);
    expect(await bulkUpdateQuestions(pool, SYS, [copy], { action: 'add_tag', tag: 'dinamika' })).toBe(1);
    expect(await bulkUpdateQuestions(pool, SYS, [copy], { action: 'add_tag', tag: 'dinamika' })).toBe(0); // takror qo'shilmaydi
    const tagged = await listQuestions(pool, { tag: 'dinamika', limit: 50, offset: 0 } as never);
    expect(tagged).toHaveLength(1);
    expect(await bulkUpdateQuestions(pool, SYS, [copy], { action: 'archive' })).toBe(1);
    await expect(bulkUpdateQuestions(pool, SYS, [], { action: 'archive' })).rejects.toThrow();
    await expect(bulkUpdateQuestions(pool, SYS, [copy], { action: 'set_difficulty', difficulty: 9 })).rejects.toThrow();
  });

  it('hisobotlar: Excel/PDF haqiqiy fayl, audit, javob kaliti faqat so\'ralganda', async () => {
    const plain = await examReport(pool, SYS, examId, false);
    const withKey = await examReport(pool, SYS, examId, true);
    expect(plain.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const first = readXlsx(plain.xlsx);
    expect(first[0]).toEqual(['Ko\'rsatkich', 'Qiymat']); // 1-varaq: xulosa
    expect(withKey.xlsx.length).toBeGreaterThan(plain.xlsx.length); // "Javob kaliti" varag'i qo'shilgan
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'report.export'`)).rowCount).toBeGreaterThanOrEqual(2);
    const cls = await classReport(pool, SYS, classId);
    expect(readXlsx(cls.xlsx)[0]![0]).toBe('Familiya, ism');
    const st = await studentReport(pool, SYS, s1);
    expect(readXlsx(st.xlsx)[0]).toContain('Imtihon');
    const wk = await weeklyReport(pool, SYS, new Date(Date.now() - 7 * 86_400_000), new Date(Date.now() + 86_400_000));
    expect(wk.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const codes = await codesReport(pool, SYS, classId);
    expect(readXlsx(codes.xlsx).length).toBe(4); // sarlavha + 3 o'quvchi
    await expect(classReport(pool, SYS, uuid())).rejects.toThrow();
  });
});
