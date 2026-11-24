import { canTransition, validateExam } from '@pep/shared';
import type { ExamInput } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { Actor } from './audit';
import { writeAudit } from './audit';
import { finishAttempt, refreshFinal } from './attempts';
import { enqueueResultNotifications } from './results';
import { enqueueExamNotice } from './notifications';

export async function createExam(pool: Pool, actor: Actor, e: ExamInput): Promise<string> {
  const errs = validateExam(e);
  if (errs.length) throw badRequest('Imtihon noto\'g\'ri', errs);
  return withTx(pool, async (tx) => {
    const cls = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM classes WHERE id = ANY($1::uuid[]) AND NOT is_archived', [e.classIds]);
    if ((cls.rows[0] as { n: number }).n !== e.classIds.length) throw badRequest('Sinf topilmadi yoki arxivlangan');
    if (e.questionIds.length) {
      const qs = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM questions WHERE id = ANY($1::uuid[]) AND is_active AND NOT is_archived', [e.questionIds]);
      if ((qs.rows[0] as { n: number }).n !== e.questionIds.length) throw badRequest('Ba\'zi savollar topilmadi yoki arxivlangan');
    }
    const pdfMode = !!e.pdfAnswerKey;
    if (e.pdfMediaId) {
      const m = await tx.query<{ kind: string }>('SELECT kind FROM media WHERE id = $1', [e.pdfMediaId]);
      if (m.rows[0]?.kind !== 'pdf') throw badRequest('PDF fayl topilmadi');
    }
    const r = await tx.query<{ id: string }>(
      `INSERT INTO exams (title, source, week_label, starts_at, ends_at, duration_minutes, question_count, topic_distribution, pass_percent,
                          shuffle_questions, shuffle_options, retake_allowed, final_attempt_policy, late_submit_grace_seconds, results_policy, created_by,
                          pdf_media_id, mode, allow_calculator, allow_formula_sheet, watermark_enabled, track_focus_events, focus_warn_threshold, show_rankings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
      [e.title, e.source, e.weekLabel ?? null, e.startsAt, e.endsAt, e.durationMinutes, pdfMode ? (e.pdfAnswerKey as string).length : (e.questionCount ?? null),
        e.topicDistribution ? JSON.stringify(e.topicDistribution) : null, e.passPercent,
        // PDF rejimida tartib/variantlar aralashtirilmaydi: varaqdagi tartib va A-D harflari saqlansin
        pdfMode ? false : e.shuffleQuestions, pdfMode ? false : e.shuffleOptions,
        e.retakeAllowed, e.finalAttemptPolicy, e.lateSubmitGraceSeconds, e.resultsPolicy, actor.type === 'admin' ? actor.adminId : null,
        e.pdfMediaId ?? null, pdfMode ? 'pdf' : 'bank', e.allowCalculator ?? false, e.allowFormulaSheet ?? false, e.watermarkEnabled ?? true, e.trackFocusEvents ?? true, e.focusWarnThreshold ?? 3, e.showRankings ?? false],
    );
    const id = (r.rows[0] as { id: string }).id;
    for (const c of e.classIds) await tx.query('INSERT INTO exam_classes (exam_id, class_id) VALUES ($1,$2)', [id, c]);
    if (pdfMode) {
      // Javoblar kaliti: har bir PDF topshirig'i uchun yashirin (arxivlangan) savol; to'g'ri javob faqat serverda.
      const key = e.pdfAnswerKey as string;
      for (let i = 0; i < key.length; i++) {
        const q = await tx.query<{ id: string }>(
          `INSERT INTO questions (type, body, difficulty, tags, points, is_archived, created_by) VALUES ('text', $1, 2, ARRAY['pdf-exam'], 1, true, $2) RETURNING id`,
          [`${i + 1}-topshiriq (PDF varaqqa qarang)`, actor.type === 'admin' ? actor.adminId : null],
        );
        const qid = (q.rows[0] as { id: string }).id;
        for (let k = 0; k < 4; k++) {
          const letter = 'ABCD'[k] as string;
          await tx.query('INSERT INTO question_options (question_id, body, is_correct, position) VALUES ($1,$2,$3,$4)', [qid, letter, letter === key[i], k]);
        }
        await tx.query('INSERT INTO exam_questions (exam_id, question_id, position) VALUES ($1,$2,$3)', [id, qid, i]);
      }
    } else {
      for (let i = 0; i < e.questionIds.length; i++) {
        await tx.query('INSERT INTO exam_questions (exam_id, question_id, position) VALUES ($1,$2,$3)', [id, e.questionIds[i], i]);
      }
    }
    await writeAudit(tx, actor, { action: 'exam.create', entityType: 'exam', entityId: id, after: { title: e.title, source: e.source, mode: pdfMode ? 'pdf' : 'bank' } });
    return id;
  });
}

export async function listExams(db: Db, limit = 50, offset = 0) {
  const r = await db.query(
    `SELECT e.id, e.title, e.status, e.source, e.starts_at, e.ends_at, e.duration_minutes, e.question_count,
            (SELECT count(*)::int FROM attempts a WHERE a.exam_id = e.id) AS attempts,
            (SELECT array_agg(c.name ORDER BY c.name) FROM exam_classes ec JOIN classes c ON c.id = ec.class_id WHERE ec.exam_id = e.id) AS classes
       FROM exams e ORDER BY e.starts_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return r.rows;
}

/**
 * Holat o'zgartirish. Pauza: faol urinishlar deadline'i pauza davomiyligicha suriladi (davom ettirilganda).
 * Bekor qilish/yakunlash: faol urinishlar baholanib yopiladi (chaqiruvchi `finishAttempt` bilan).
 */
export async function transitionExam(pool: Pool, actor: Actor, examId: string, to: string, reason?: string): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query<{ status: string; paused_at: Date | null; now: Date; question_count: number | null; source: string }>(
      'SELECT status, paused_at, now() AS now, question_count, source FROM exams WHERE id = $1 FOR UPDATE',
      [examId],
    );
    const e = r.rows[0];
    if (!e) throw notFound('Imtihon topilmadi');
    if (!canTransition(e.status, to)) throw conflict(`"${e.status}" holatdan "${to}" ga o'tib bo'lmaydi`);
    if (to === 'scheduled') {
      const n = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM exam_questions WHERE exam_id = $1', [examId]);
      if (e.source === 'manual' && (n.rows[0] as { n: number }).n === 0) throw badRequest('Savollarsiz imtihonni e\'lon qilib bo\'lmaydi');
    }
    if ((to === 'paused' || to === 'cancelled') && !reason?.trim()) throw badRequest('Sabab majburiy');

    if (to === 'paused') {
      await tx.query(`UPDATE exams SET status='paused', paused_at=now(), pause_reason=$2, updated_at=now() WHERE id=$1`, [examId, reason ?? null]);
    } else if (to === 'running' && e.status === 'paused') {
      const paused = (e.paused_at as Date);
      await tx.query(
        `UPDATE attempts SET deadline_at = deadline_at + (now() - $2::timestamptz), updated_at = now() WHERE exam_id = $1 AND status = 'in_progress'`,
        [examId, paused],
      );
      // imtihon oynasi ham pauza davomiyligicha uzayadi, aks holda urinishlar oynadan keyin qoladi
      await tx.query(`UPDATE exams SET status='running', ends_at = ends_at + (now() - $2::timestamptz), paused_at=NULL, pause_reason=NULL, updated_at=now() WHERE id=$1`, [examId, paused]);
    } else {
      await tx.query(`UPDATE exams SET status=$2, updated_at=now() WHERE id=$1`, [examId, to]);
    }
    await writeAudit(tx, actor, { action: `exam.${to}`, entityType: 'exam', entityId: examId, before: { status: e.status }, after: { status: to }, reason: reason ?? null });
  });
  if (to === 'cancelled') await enqueueExamNotice(pool, examId, 'exam_cancelled');
  if (to === 'finished' || to === 'cancelled') {
    // faol urinishlarni yopish (har biri alohida tranzaksiya, idempotent)
    const act = await pool.query<{ id: string }>(`SELECT id FROM attempts WHERE exam_id = $1 AND status = 'in_progress'`, [examId]);
    for (const a of act.rows) await finishAttempt(pool, a.id, to === 'cancelled' ? 'exam_cancelled' : 'timeout');
    if (to === 'finished') {
      const pol = await pool.query<{ p: string }>('SELECT results_policy AS p FROM exams WHERE id = $1', [examId]);
      if (pol.rows[0]?.p === 'after_end') await enqueueResultNotifications(pool, examId);
    }
  }
}

/** Vaqt bo'yicha avtomatik holatlar: scheduled → running (boshlanish), running → finished (tugash). */
export async function advanceExamStatuses(pool: Pool): Promise<number> {
  const a = await pool.query<{ id: string }>(`UPDATE exams SET status='running', updated_at=now() WHERE status='scheduled' AND starts_at <= now() AND ends_at > now() RETURNING id`);
  for (const e of a.rows) await enqueueExamNotice(pool, e.id, 'exam_started');
  const due = await pool.query<{ id: string }>(`SELECT id FROM exams WHERE status = 'running' AND ends_at < now() - interval '1 minute'`);
  for (const e of due.rows) await transitionExam(pool, { type: 'system' }, e.id, 'finished');
  return (a.rowCount ?? 0) + due.rows.length;
}

/** Xato savolni bekor qilish: ball ham, maksimum ham hisobga olinmaydi; yakunlangan urinishlar qayta hisoblanadi. */
export async function voidQuestion(pool: Pool, actor: Actor, examId: string, questionId: string, reason: string): Promise<number> {
  if (!reason.trim()) throw badRequest('Sabab majburiy');
  return withTx(pool, async (tx) => {
    const r = await tx.query('UPDATE exam_questions SET is_voided = true WHERE exam_id = $1 AND question_id = $2', [examId, questionId]);
    if (r.rowCount === 0) throw notFound('Imtihonda bunday savol yo\'q');
    const upd = await tx.query<{ exam_id: string; student_id: string; policy: string }>(
      `WITH agg AS (
         SELECT a.id,
                coalesce(sum(aq.points) FILTER (WHERE NOT coalesce(eq.is_voided,false)), 0) AS max_score,
                coalesce(sum(an.points_awarded) FILTER (WHERE NOT coalesce(eq.is_voided,false)), 0) AS score
           FROM attempts a
           JOIN attempt_questions aq ON aq.attempt_id = a.id
           LEFT JOIN exam_questions eq ON eq.exam_id = a.exam_id AND eq.question_id = aq.question_id
           LEFT JOIN answers an ON an.attempt_question_id = aq.id
          WHERE a.exam_id = $1 AND a.status IN ('submitted','expired')
          GROUP BY a.id)
       UPDATE attempts a SET score = agg.score, max_score = agg.max_score,
              percent = CASE WHEN agg.max_score > 0 THEN round(agg.score * 100 / agg.max_score, 2) ELSE 0 END, updated_at = now()
         FROM agg WHERE a.id = agg.id
       RETURNING a.exam_id, a.student_id, (SELECT final_attempt_policy FROM exams WHERE id = a.exam_id) AS policy`,
      [examId],
    );
    for (const u of upd.rows) await refreshFinal(tx, u.exam_id, u.student_id, u.policy);
    await writeAudit(tx, actor, { action: 'exam.void_question', entityType: 'exam', entityId: examId, after: { questionId, recalculated: upd.rowCount }, reason });
    return upd.rowCount ?? 0;
  });
}

export async function grantRetake(pool: Pool, actor: Actor, examId: string, studentId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw badRequest('Sabab majburiy');
  await withTx(pool, async (tx) => {
    const ok = await tx.query(
      `SELECT 1 FROM exams e JOIN exam_classes ec ON ec.exam_id = e.id JOIN students s ON s.class_id = ec.class_id WHERE e.id = $1 AND s.id = $2`,
      [examId, studentId],
    );
    if (!ok.rows[0]) throw notFound('Imtihon yoki o\'quvchi topilmadi');
    try {
      await tx.query('INSERT INTO retake_grants (exam_id, student_id, granted_by, reason) VALUES ($1,$2,$3,$4)', [examId, studentId, actor.type === 'admin' ? actor.adminId : null, reason]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('Bu o\'quvchiga ishlatilmagan ruxsat allaqachon berilgan');
      throw e;
    }
    await writeAudit(tx, actor, { action: 'exam.retake_grant', entityType: 'exam', entityId: examId, after: { studentId }, reason });
  });
}

export interface ExamDetail {
  id: string;
  title: string;
  status: string;
  questions: { id: string; body: string; isVoided: boolean }[];
  students: { id: string; name: string; className: string; attempts: number; bestPercent: number | null; hasOpenGrant: boolean }[];
}

/** Admin: imtihon ichi — savollar (bekor qilish uchun) va o'quvchilar (qayta topshirish ruxsati uchun). */
export async function getExamDetail(db: Db, examId: string): Promise<ExamDetail> {
  const e = await db.query<{ id: string; title: string; status: string }>('SELECT id, title, status FROM exams WHERE id = $1', [examId]);
  const ex = e.rows[0];
  if (!ex) throw notFound('Imtihon topilmadi');
  const q = await db.query<{ id: string; body: string; is_voided: boolean }>(
    `SELECT q.id, q.body, eq.is_voided FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = $1 ORDER BY eq.position NULLS LAST, q.created_at`,
    [examId],
  );
  const s = await db.query<{ id: string; name: string; class_name: string; attempts: number; best: string | null; grant: boolean }>(
    `SELECT s.id, s.last_name || ' ' || s.first_name AS name, c.name AS class_name,
            (SELECT count(*)::int FROM attempts a WHERE a.exam_id = $1 AND a.student_id = s.id) AS attempts,
            (SELECT max(a.percent) FROM attempts a WHERE a.exam_id = $1 AND a.student_id = s.id AND a.status IN ('submitted','expired')) AS best,
            EXISTS (SELECT 1 FROM retake_grants g WHERE g.exam_id = $1 AND g.student_id = s.id AND g.used_attempt_id IS NULL) AS grant
       FROM students s JOIN classes c ON c.id = s.class_id JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = $1
      WHERE s.is_active ORDER BY c.name, s.last_name, s.first_name`,
    [examId],
  );
  return {
    id: ex.id, title: ex.title, status: ex.status,
    questions: q.rows.map((r) => ({ id: r.id, body: r.body, isVoided: r.is_voided })),
    students: s.rows.map((r) => ({ id: r.id, name: r.name, className: r.class_name, attempts: r.attempts, bestPercent: r.best === null ? null : Number(r.best), hasOpenGrant: r.grant })),
  };
}
