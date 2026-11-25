/**
 * 2-bosqich integratsion testlari: urinish hayot sikli haqiqiy PostgreSQL da.
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
import { createQuestion, importQuestions } from '../src/services/question-bank';
import { createExam, getExamDetail, grantRetake, transitionExam, voidQuestion } from '../src/services/exams';
import { expireOverdueAttempts, finishAttempt, getAttemptForStudent, listStudentExams, saveAnswer, startAttempt } from '../src/services/attempts';
import type { Actor } from '../src/services/audit';
import { acquireTestDbLock } from './helpers/db-lock';

const URL_ = process.env.TEST_DATABASE_URL ?? '';
const SYS: Actor = { type: 'system' };
const uuid = () => crypto.randomUUID();

describe.skipIf(!URL_)('2-bosqich: imtihon va urinishlar (PostgreSQL)', () => {
  let pool: Pool;
  let releaseLock: () => Promise<void> = async () => undefined;
  let cfg: Config;
  let classId = '';
  let s1 = '';
  let s2 = '';
  let examId = '';
  const qIds: string[] = [];

  beforeAll(async () => {
    if (!/_test(\?|$)/.test(URL_)) throw new Error('TEST_DATABASE_URL nomi _test bilan tugashi shart');
    cfg = loadConfig({
      NODE_ENV: 'test', DATABASE_URL: URL_, BOT_TOKEN: '123456789:AAFakeTokenForTestsOnly_0123456789abc',
      INTERNAL_API_KEY: 'k'.repeat(40), ADMIN_TELEGRAM_IDS: '900001',
      STUDENT_APP_URL: 'http://localhost:5173', ADMIN_WEB_URL: 'http://localhost:5174', LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);
    releaseLock = await acquireTestDbLock(URL_);
    pool = createPool(URL_, 6);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool, fileURLToPath(new URL('../../../db/migrations', import.meta.url)), () => undefined);

    classId = (await createClass(pool, SYS, '8-A')).id;
    s1 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Aziz', lastName: 'Karimov' })).id;
    s2 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Nilufar', lastName: 'Ergasheva' })).id;

    const single = (body: string) => ({
      type: 'text' as const, body, difficulty: 2, tags: [], points: 1,
      options: [{ body: 'to\'g\'ri', isCorrect: true }, { body: 'xato1', isCorrect: false }, { body: 'xato2', isCorrect: false }],
    });
    qIds.push(await createQuestion(pool, SYS, single('Savol 1')));
    qIds.push(await createQuestion(pool, SYS, single('Savol 2')));
    qIds.push(await createQuestion(pool, SYS, {
      type: 'numeric', body: 'Massa {{m}} kg, tezlanish {{a}} m/s². Kuch (N)?', difficulty: 2, tags: [], points: 2, options: [],
      paramSpec: { params: [{ name: 'm', min: 1, max: 9, step: 1 }, { name: 'a', min: 1, max: 5, step: 1 }], answer: { expr: 'm*a', decimals: 2, tolerance: { abs: 0.01 } } },
    }));

    const now = Date.now();
    examId = await createExam(pool, SYS, {
      title: 'Hafta 1', source: 'manual', classIds: [classId], startsAt: new Date(now - 60_000), endsAt: new Date(now + 2 * 3600_000),
      durationMinutes: 40, questionIds: qIds, passPercent: 60, shuffleQuestions: true, shuffleOptions: true, retakeAllowed: false,
      finalAttemptPolicy: 'best', lateSubmitGraceSeconds: 0, resultsPolicy: 'after_end',
    } as never);
    await transitionExam(pool, SYS, examId, 'scheduled');
    await transitionExam(pool, SYS, examId, 'running');
  });

  afterAll(async () => {
    await pool?.end();
    await releaseLock();
  });

  /** Testda to'g'ri javobni bazadan oladi (o'quvchi API'si buni hech qachon bermaydi). */
  async function correctFor(attemptId: string, aqId: string) {
    const r = await pool.query<{ ids: string[]; computed: { value: number } | null }>(
      `SELECT coalesce((SELECT array_agg(o.id) FROM question_options o WHERE o.question_id = aq.question_id AND o.is_correct), '{}') AS ids,
              aq.computed_answer AS computed FROM attempt_questions aq WHERE aq.id = $1 AND aq.attempt_id = $2`,
      [aqId, attemptId],
    );
    return r.rows[0] as { ids: string[]; computed: { value: number } | null };
  }

  async function answerAll(studentId: string, attemptId: string, correct: boolean) {
    const a = await getAttemptForStudent(pool, studentId, attemptId);
    for (const q of a.questions) {
      const c = await correctFor(attemptId, q.id);
      const wrong = q.options.find((o) => !c.ids.includes(o.id));
      await saveAnswer(pool, studentId, attemptId, {
        clientOpId: uuid(), attemptQuestionId: q.id,
        selectedOptionIds: c.computed ? [] : correct ? c.ids : wrong ? [wrong.id] : [],
        numericValue: c.computed ? (correct ? c.computed.value : c.computed.value + 100) : null, isFlagged: false,
      });
    }
  }

  it('boshlash: savollar, variant tartibi saqlanadi; to\'g\'ri javob DTO da yo\'q; takroriy/parallel boshlash bitta urinish', async () => {
    const [a, b] = await Promise.all([startAttempt(pool, s1, examId), startAttempt(pool, s1, examId)]);
    expect(b.id).toBe(a.id);
    expect(a.questions).toHaveLength(3);
    expect(JSON.stringify(a)).not.toMatch(/is_correct|isCorrect|computed/);
    const numeric = a.questions.find((q) => q.type === 'numeric');
    expect(numeric?.body).toMatch(/Massa \d/); // {{m}} almashtirilgan
    expect(numeric?.body).not.toContain('{{');
    const again = await startAttempt(pool, s1, examId);
    expect(again.id).toBe(a.id);
    expect(new Date(a.deadlineAt).getTime()).toBeGreaterThan(new Date(a.serverNow).getTime());
  });

  it('javob saqlash: idempotent, versiya konflikti, noto\'g\'ri variant, boshqa o\'quvchi ko\'ra olmaydi', async () => {
    const a = await startAttempt(pool, s1, examId);
    const q = a.questions.find((x) => x.type !== 'numeric')!;
    const op = uuid();
    const r1 = await saveAnswer(pool, s1, a.id, { clientOpId: op, attemptQuestionId: q.id, selectedOptionIds: [q.options[0]!.id], numericValue: null, isFlagged: false });
    expect(r1).toMatchObject({ status: 'saved', version: 1 });
    const dup = await saveAnswer(pool, s1, a.id, { clientOpId: op, attemptQuestionId: q.id, selectedOptionIds: [q.options[1]!.id], numericValue: null, isFlagged: false });
    expect(dup).toMatchObject({ status: 'duplicate', version: 1 });
    const r2 = await saveAnswer(pool, s1, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [q.options[1]!.id], numericValue: null, isFlagged: true, baseVersion: 1 });
    expect(r2).toMatchObject({ status: 'saved', version: 2 });
    const stale = await saveAnswer(pool, s1, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [q.options[2]!.id], numericValue: null, isFlagged: false, baseVersion: 1 });
    expect(stale.status).toBe('conflict');
    await expect(saveAnswer(pool, s1, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [uuid()], numericValue: null, isFlagged: false })).rejects.toThrow();
    await expect(getAttemptForStudent(pool, s2, a.id)).rejects.toThrow();
    await expect(saveAnswer(pool, s2, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [], numericValue: null, isFlagged: false })).rejects.toThrow();
  });

  it('yakunlash: ball serverda hisoblanadi (parametrli sonli savol ham), takroriy yakunlash bir xil natija, keyin javob rad', async () => {
    const a = await startAttempt(pool, s1, examId);
    await answerAll(s1, a.id, true);
    const r = await finishAttempt(pool, a.id, 'student', s1);
    expect(r).toMatchObject({ status: 'submitted', score: 4, maxScore: 4, percent: 100, passed: true });
    expect(await finishAttempt(pool, a.id, 'student', s1)).toEqual(r);
    const q = (await getAttemptForStudent(pool, s1, a.id)).questions[0]!;
    await expect(saveAnswer(pool, s1, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [], numericValue: null, isFlagged: false })).rejects.toThrow();
    const fin = await pool.query('SELECT is_final FROM attempts WHERE id = $1', [a.id]);
    expect(fin.rows[0].is_final).toBe(true);
  });

  it('qayta topshirish: ruxsatsiz rad; ruxsatdan keyin 2-urinish; "best" siyosati yuqori ballni yakuniy qiladi; ruxsat bir martalik', async () => {
    await expect(startAttempt(pool, s1, examId)).rejects.toThrow();
    await expect(grantRetake(pool, SYS, examId, s1, '  ')).rejects.toThrow();
    await grantRetake(pool, SYS, examId, s1, 'Kasal bo\'lgan');
    const exams = await listStudentExams(pool, s1);
    expect(exams[0]?.canStart).toBe(true);
    const a2 = await startAttempt(pool, s1, examId);
    await answerAll(s1, a2.id, false);
    const r2 = await finishAttempt(pool, a2.id, 'student', s1);
    expect(r2.percent).toBe(0);
    const rows = await pool.query('SELECT attempt_no, is_final FROM attempts WHERE student_id = $1 ORDER BY attempt_no', [s1]);
    expect(rows.rows.map((x) => [x.attempt_no, x.is_final])).toEqual([[1, true], [2, false]]);
    await expect(startAttempt(pool, s1, examId)).rejects.toThrow(); // ruxsat ishlatildi
  });

  it('xato savolni bekor qilish: yakunlangan urinishlar qayta hisoblanadi', async () => {
    const a = await startAttempt(pool, s2, examId);
    await answerAll(s2, a.id, true);
    // bitta oddiy savolni xato qilib qo'yamiz: uning javobini noto'g'ri qilamiz
    const first = (await getAttemptForStudent(pool, s2, a.id)).questions.find((q) => q.type !== 'numeric')!;
    const c = await correctFor(a.id, first.id);
    const wrong = first.options.find((o) => !c.ids.includes(o.id))!;
    await saveAnswer(pool, s2, a.id, { clientOpId: uuid(), attemptQuestionId: first.id, selectedOptionIds: [wrong.id], numericValue: null, isFlagged: false });
    const r = await finishAttempt(pool, a.id, 'student', s2);
    expect(r.score).toBe(3);
    expect(r.maxScore).toBe(4);
    const qid = (await pool.query<{ question_id: string }>('SELECT question_id FROM attempt_questions WHERE id = $1', [first.id])).rows[0]!.question_id;
    const n = await voidQuestion(pool, SYS, examId, qid, 'Savol matni xato');
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await pool.query('SELECT score, max_score, percent FROM attempts WHERE id = $1', [a.id]);
    expect(Number(after.rows[0].max_score)).toBe(3);
    expect(Number(after.rows[0].score)).toBe(3);
    expect(Number(after.rows[0].percent)).toBe(100);
  });

  it('pauza: javob rad etiladi, davom ettirilganda deadline pauza davomiyligicha suriladi', async () => {
    const exam2 = await createExam(pool, SYS, {
      title: 'Pauza', source: 'manual', classIds: [classId], startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3 * 3600_000),
      durationMinutes: 60, questionIds: [qIds[0]!, qIds[1]!], passPercent: 50, shuffleQuestions: false, shuffleOptions: false, retakeAllowed: false,
      finalAttemptPolicy: 'last', lateSubmitGraceSeconds: 0, resultsPolicy: 'after_end',
    } as never);
    await transitionExam(pool, SYS, exam2, 'scheduled');
    await transitionExam(pool, SYS, exam2, 'running');
    const a = await startAttempt(pool, s1, exam2);
    await expect(transitionExam(pool, SYS, exam2, 'paused', ' ')).rejects.toThrow();
    await transitionExam(pool, SYS, exam2, 'paused', 'Elektr o\'chdi');
    const q = a.questions[0]!;
    await expect(saveAnswer(pool, s1, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [q.options[0]!.id], numericValue: null, isFlagged: false })).rejects.toThrow();
    await pool.query(`UPDATE exams SET paused_at = now() - interval '10 minutes' WHERE id = $1`, [exam2]);
    await transitionExam(pool, SYS, exam2, 'running');
    const after = await getAttemptForStudent(pool, s1, a.id);
    const shiftMs = new Date(after.deadlineAt).getTime() - new Date(a.deadlineAt).getTime();
    expect(shiftMs).toBeGreaterThan(9.9 * 60_000);
    expect(shiftMs).toBeLessThan(10.5 * 60_000);
    await expect(transitionExam(pool, SYS, exam2, 'draft')).rejects.toThrow(); // noto'g'ri o'tish
  });

  it('vaqt tugashi: muddati o\'tgan urinish "expired" bo\'ladi, yakunlash vaqti = deadline, kech javob rad', async () => {
    const exam3 = await createExam(pool, SYS, {
      title: 'Vaqt', source: 'manual', classIds: [classId], startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3 * 3600_000),
      durationMinutes: 30, questionIds: [qIds[0]!], passPercent: 50, shuffleQuestions: false, shuffleOptions: false, retakeAllowed: false,
      finalAttemptPolicy: 'last', lateSubmitGraceSeconds: 0, resultsPolicy: 'after_end',
    } as never);
    await transitionExam(pool, SYS, exam3, 'scheduled');
    await transitionExam(pool, SYS, exam3, 'running');
    const a = await startAttempt(pool, s2, exam3);
    const q = a.questions[0]!;
    await pool.query(`UPDATE attempts SET started_at = now() - interval '2 hours', deadline_at = now() - interval '1 minute' WHERE id = $1`, [a.id]);
    await expect(saveAnswer(pool, s2, a.id, { clientOpId: uuid(), attemptQuestionId: q.id, selectedOptionIds: [q.options[0]!.id], numericValue: null, isFlagged: false })).rejects.toThrow();
    expect(await expireOverdueAttempts(pool)).toBeGreaterThanOrEqual(1);
    const row = (await pool.query('SELECT status, finish_reason, submitted_at, deadline_at FROM attempts WHERE id = $1', [a.id])).rows[0];
    expect(row.status).toBe('expired');
    expect(row.finish_reason).toBe('timeout');
    expect(new Date(row.submitted_at).getTime()).toBe(new Date(row.deadline_at).getTime());
  });

  it('tasodifiy imtihon: savollar soni va takrorsizlik', async () => {
    const exam4 = await createExam(pool, SYS, {
      title: 'Tasodifiy', source: 'random', classIds: [classId], startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3 * 3600_000),
      durationMinutes: 30, questionCount: 2, questionIds: [], passPercent: 50, shuffleQuestions: true, shuffleOptions: true, retakeAllowed: false,
      finalAttemptPolicy: 'last', lateSubmitGraceSeconds: 0, resultsPolicy: 'after_end',
    } as never);
    await transitionExam(pool, SYS, exam4, 'scheduled');
    await transitionExam(pool, SYS, exam4, 'running');
    const a = await startAttempt(pool, s1, exam4);
    expect(a.questions).toHaveLength(2);
    const ids = await pool.query('SELECT DISTINCT question_id FROM attempt_questions WHERE attempt_id = $1', [a.id]);
    expect(ids.rowCount).toBe(2);
  });

  it('CSV import: ko\'rib chiqish hech narsa yozmaydi; xato bo\'lsa hammasi rad; to\'g\'ri bo\'lsa savollar va yangi mavzu yaratiladi', async () => {
    const good = ['type,body,topic,grade,correct,option1,option2,answer,tol_abs',
      'text,"Import 1",Optika,9,1,a,b,,', 'numeric,"Import 2",Optika,9,,,,12.5,0.1'].join('\n');
    const before = (await pool.query('SELECT count(*)::int AS n FROM questions')).rows[0].n;
    const prev = await importQuestions(pool, SYS, good, false);
    expect(prev).toMatchObject({ committed: false, valid: 2, newTopics: ['Optika'] });
    expect((await pool.query('SELECT count(*)::int AS n FROM questions')).rows[0].n).toBe(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM topics WHERE name = 'Optika'")).rows[0].n).toBe(0);

    const bad = good + '\ntext,"Xato qator",Optika,9,,a,b,,';
    const rejected = await importQuestions(pool, SYS, bad, true);
    expect(rejected.committed).toBe(false);
    expect(rejected.errors).toHaveLength(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM questions')).rows[0].n).toBe(before);

    const done = await importQuestions(pool, SYS, good, true);
    expect(done.committed).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM questions')).rows[0].n).toBe(before + 2);
    const again = await importQuestions(pool, SYS, good, true); // mavzu qayta yaratilmaydi
    expect(again.newTopics).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS n FROM topics WHERE name = 'Optika'")).rows[0].n).toBe(1);
  });

  it('imtihon tafsiloti: savollar va o\'quvchilar (bekor qilingan savol belgilanadi)', async () => {
    const d = await getExamDetail(pool, examId);
    expect(d.questions).toHaveLength(3);
    expect(d.questions.filter((q) => q.isVoided)).toHaveLength(1); // oldingi testda bekor qilingan
    expect(d.students.map((x) => x.id).sort()).toEqual([s1, s2].sort());
    expect(d.students.find((x) => x.id === s1)?.attempts).toBeGreaterThanOrEqual(2);
  });
});
