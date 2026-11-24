/**
 * 3/4-bosqich integratsion testlari: natijalar, monitoring, bildirishnomalar haqiqiy PostgreSQL da.
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

import { getExamResults, getMonitor, getQuestionStats, publishResults, recordEvents, recordHeartbeat, listStudentResults, exportResultsCsv } from '../src/services/results';
import { getMedia, getMediaForStudent, saveMedia } from '../src/services/media';
import { claimDue, reportResult, scheduleReminders } from '../src/services/notifications';

describe.skipIf(!URL_)('3/4-bosqich: natijalar, monitoring, bildirishnomalar (PostgreSQL)', () => {
  let pool: Pool;
  let releaseLock: () => Promise<void> = async () => undefined;
  let examId = '';
  let s1 = '';
  let s2 = '';
  let s3 = '';

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

    const classId = (await createClass(pool, SYS, '9-B')).id;
    s1 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Aziz', lastName: 'Karimov' })).id;
    s2 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Nilufar', lastName: 'Ergasheva' })).id;
    s3 = (await createStudent(pool, cfg, SYS, { classId, firstName: 'Bobur', lastName: 'Olimov' })).id;
    // s1 va s2 Telegram'ga bog'langan, s3 yo'q
    await pool.query(`UPDATE students SET telegram_id = 700001, telegram_linked_at = now() WHERE id = $1`, [s1]);
    await pool.query(`UPDATE students SET telegram_id = 700002, telegram_linked_at = now() WHERE id = $1`, [s2]);

    const single = (body: string) => ({
      type: 'text' as const, body, difficulty: 2, tags: [], points: 1,
      options: [{ body: 'to\'g\'ri', isCorrect: true }, { body: 'xato1', isCorrect: false }, { body: 'xato2', isCorrect: false }],
    });
    const qIds = [await createQuestion(pool, SYS, single('S1')), await createQuestion(pool, SYS, single('S2'))];
    const now = Date.now();
    examId = await createExam(pool, SYS, {
      title: 'Hafta 2', source: 'manual', classIds: [classId], startsAt: new Date(now - 60_000), endsAt: new Date(now + 2 * 3600_000),
      durationMinutes: 40, questionIds: qIds, passPercent: 60, shuffleQuestions: false, shuffleOptions: false, retakeAllowed: false,
      finalAttemptPolicy: 'best', lateSubmitGraceSeconds: 0, resultsPolicy: 'manual',
    } as never);
    await transitionExam(pool, SYS, examId, 'scheduled');
    await transitionExam(pool, SYS, examId, 'running');
  });

  afterAll(async () => {
    await pool?.end();
    await releaseLock();
  });

  it('monitoring, heartbeat va hodisalar: faol urinish ko\'rinadi, hodisalar sanaladi', async () => {
    const a1 = await startAttempt(pool, s1, examId);
    const hb = await recordHeartbeat(pool, s1, a1.id);
    expect(hb.status).toBe('in_progress');
    const n = await recordEvents(pool, s1, a1.id, [{ kind: 'visibility_hidden' }, { kind: 'reconnect' }]);
    expect(n).toBe(2);
    await expect(recordHeartbeat(pool, s2, a1.id)).rejects.toThrow(); // boshqa o'quvchining urinishi
    const m = await getMonitor(pool, examId);
    const row = m.rows.find((x: { attemptId: string }) => x.attemptId === a1.id);
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ leaves: 1, reconnects: 1 });
  });

  it('natijalar: yakunlangan urinishlar, statistika, CSV; boshlamagan o\'quvchi hisoblanadi', async () => {
    const a1 = await startAttempt(pool, s1, examId);
    await answerAll(s1, a1.id, true);
    await finishAttempt(pool, a1.id, 'student', s1);
    const a2 = await startAttempt(pool, s2, examId);
    await answerAll(s2, a2.id, false);
    await finishAttempt(pool, a2.id, 'student', s2);

    const res = await getExamResults(pool, examId);
    expect(res.notStarted).toBe(1); // s3
    const r1 = res.rows.find((x) => x.studentId === s1)!;
    const r2 = res.rows.find((x) => x.studentId === s2)!;
    expect(r1).toMatchObject({ percent: 100, passed: true });
    expect(r2).toMatchObject({ percent: 0, passed: false });

    const stats = await getQuestionStats(pool, examId);
    expect(stats).toHaveLength(2);
    const csv = await exportResultsCsv(pool, SYS, examId);
    expect(csv).toContain('Karimov');
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'exam.export_results'`);
    expect(audit.rowCount).toBe(1);
  });

  it('natijani e\'lon qilish: avval o\'quvchi ko\'rmaydi; faqat finished da; bildirishnoma faqat bog\'langan va topshirganlarga, takrorlanmaydi', async () => {
    expect(await listStudentResults(pool, s1)).toHaveLength(0); // policy=manual, hali e'lon qilinmagan
    await expect(publishResults(pool, SYS, examId)).rejects.toThrow(); // imtihon hali running
    await transitionExam(pool, SYS, examId, 'finished');

    const p1 = await publishResults(pool, SYS, examId);
    expect(p1.notified).toBe(2); // s1, s2 (s3 telegram'siz va topshirmagan)
    const p2 = await publishResults(pool, SYS, examId);
    expect(p2.notified).toBe(0); // dedupe

    const mine = await listStudentResults(pool, s1);
    expect(mine).toHaveLength(1);
    expect(await listStudentResults(pool, s3)).toHaveLength(0);
  });

  it('bildirishnoma navbati: claim ijara beradi, ikki marta berilmaydi; xato -> qayta urinish; doimiy xato -> failed; muvaffaqiyat -> sent', async () => {
    const first = await claimDue(pool, 10);
    const results = first.filter((x) => x.kind === 'results_published');
    expect(results.length).toBe(2);
    expect((await claimDue(pool, 10)).filter((x) => x.kind === 'results_published')).toHaveLength(0); // ijara (5 daqiqa)

    const [a, b] = results as [typeof results[0], typeof results[0]];
    await reportResult(pool, a.id, { ok: true });
    await reportResult(pool, b.id, { ok: false, error: 'blocked', permanent: true });
    const st = await pool.query<{ id: string; status: string }>('SELECT id, status FROM notifications WHERE id = ANY($1)', [[a.id, b.id]]);
    expect(st.rows.find((x) => x.id === a.id)?.status).toBe('sent');
    expect(st.rows.find((x) => x.id === b.id)?.status).toBe('failed');

    // vaqtinchalik xato: pending qoladi va keyingi urinish kechiktiriladi
    const q = await pool.query<{ id: string }>(
      `INSERT INTO notifications (student_id, exam_id, kind, dedupe_key) VALUES ($1, $2, 'custom', 'test:retry') RETURNING id`, [s1, examId]);
    const id = q.rows[0]!.id;
    await pool.query('UPDATE notifications SET attempt_count = 1 WHERE id = $1', [id]);
    await reportResult(pool, id, { ok: false, error: 'timeout' });
    const after = await pool.query<{ status: string; later: boolean }>('SELECT status, next_attempt_at > now() AS later FROM notifications WHERE id = $1', [id]);
    expect(after.rows[0]).toMatchObject({ status: 'pending', later: true });
  });

  it('eslatmalar: scheduleReminders ikki marta chaqirilsa ikki baravar qo\'shmaydi', async () => {
    const e2 = await pool.query<{ id: string }>(`SELECT id FROM exams LIMIT 1`);
    expect(e2.rows).toHaveLength(1);
    const a = await scheduleReminders(pool);
    const b = await scheduleReminders(pool);
    expect(b).toBe(0);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it('media: rasm/PDF saqlanadi, takroriy fayl bitta yozuv, SVG rad; o\'quvchi faqat o\'z imtihoni PDF\'sini ko\'radi', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rasm-1')]);
    const m1 = await saveMedia(pool, SYS, png, 'image');
    const m2 = await saveMedia(pool, SYS, png, 'image');
    expect(m2.id).toBe(m1.id);
    await expect(saveMedia(pool, SYS, Buffer.from('<svg><script>1</script></svg>'), 'image')).rejects.toThrow();
    await expect(saveMedia(pool, SYS, png, 'pdf')).rejects.toThrow(); // tur mos emas
    expect((await getMedia(pool, m1.id)).mime).toBe('image/png');

    const pdf = await saveMedia(pool, SYS, Buffer.from('%PDF-1.4\nmazmun'), 'pdf');
    await pool.query('UPDATE exams SET pdf_media_id = $2 WHERE id = $1', [examId, pdf.id]);
    expect((await getMediaForStudent(pool, s1, pdf.id)).mime).toBe('application/pdf'); // s1 urinishi bor
    await expect(getMediaForStudent(pool, s3, pdf.id)).rejects.toThrow(); // s3 urinishi yo'q
    await expect(getMediaForStudent(pool, s1, m1.id)).rejects.toThrow(); // rasm s1 savolida emas
  });
});
