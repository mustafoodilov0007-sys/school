import { randomInt } from 'node:crypto';
import {
  classifySubmission,
  computeDeadline,
  generateParams,
  scoreAttempt,
  selectQuestions,
  shuffle,
  hasPassed,
} from '@pep/shared';
import type { AttemptDto, GradedItem, ParamSpec, StudentExamDto, Tolerance } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { conflict, notFound, badRequest, isUniqueViolation } from '../lib/errors';

/**
 * Urinishlar hayot sikli. Barcha vaqt qarorlari bazaning now() i bo'yicha (server vaqti).
 * To'g'ri javoblar (is_correct, computed_answer, answer_spec) hech qachon DTO ga kirmaydi.
 */

interface ExamRow {
  id: string;
  status: string;
  source: 'manual' | 'random';
  topic_distribution: Record<string, number> | null;
  starts_at: Date;
  ends_at: Date;
  duration_minutes: number;
  question_count: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  retake_allowed: boolean;
  late_submit_grace_seconds: number;
  final_attempt_policy: 'last' | 'best' | 'admin_choice';
  pass_percent: string;
  now: Date;
}

const rnd = (n: number) => randomInt(n);

async function loadExamForStudent(tx: Db, examId: string, studentId: string): Promise<ExamRow> {
  const r = await tx.query<ExamRow>(
    `SELECT e.id, e.status, e.source, e.topic_distribution, e.starts_at, e.ends_at, e.duration_minutes, e.question_count,
            e.shuffle_questions, e.shuffle_options, e.retake_allowed, e.late_submit_grace_seconds,
            e.final_attempt_policy, e.pass_percent, now() AS now
       FROM exams e
       JOIN exam_classes ec ON ec.exam_id = e.id
       JOIN students s ON s.class_id = ec.class_id
      WHERE e.id = $1 AND s.id = $2 AND s.is_active
      FOR SHARE OF e`,
    [examId, studentId],
  );
  const e = r.rows[0];
  if (!e) throw notFound('Imtihon topilmadi');
  return e;
}

export async function startAttempt(pool: Pool, studentId: string, examId: string): Promise<AttemptDto> {
  try {
    const attemptId = await withTx(pool, async (tx) => {
      const exam = await loadExamForStudent(tx, examId, studentId);
      if (exam.status !== 'running') throw conflict('Imtihon hozir ochiq emas');
      if (exam.now < exam.starts_at || exam.now >= exam.ends_at) throw conflict('Imtihon vaqti tashqarisida');

      // Davom ettirish: faol urinish bor bo'lsa, o'shani qaytaramiz (bitta faol urinish DB da kafolatlangan).
      const active = await tx.query<{ id: string; deadline_at: Date }>(
        `SELECT id, deadline_at FROM attempts WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'`,
        [examId, studentId],
      );
      const a = active.rows[0];
      if (a) return a.id;

      const prev = await tx.query<{ n: number; max_no: number }>(
        'SELECT count(*)::int AS n, coalesce(max(attempt_no),0)::int AS max_no FROM attempts WHERE exam_id = $1 AND student_id = $2',
        [examId, studentId],
      );
      const { n, max_no } = prev.rows[0] as { n: number; max_no: number };
      let grantId: string | null = null;
      let grantedBy: string | null = null;
      if (n > 0) {
        const g = await tx.query<{ id: string; granted_by: string | null }>(
          `SELECT id, granted_by FROM retake_grants WHERE exam_id = $1 AND student_id = $2 AND used_attempt_id IS NULL FOR UPDATE`,
          [examId, studentId],
        );
        const grant = g.rows[0];
        if (grant) {
          grantId = grant.id;
          grantedBy = grant.granted_by;
        } else if (!exam.retake_allowed) {
          throw conflict('Bu imtihonni qayta topshirish mumkin emas');
        }
      }

      const questionIds = await pickQuestions(tx, exam, studentId);
      if (questionIds.length === 0) throw conflict('Imtihonda savollar yo\'q');

      const startedAt = exam.now;
      const deadline = computeDeadline({ startedAt, durationMinutes: exam.duration_minutes, examEndsAt: exam.ends_at });
      const ins = await tx.query<{ id: string }>(
        `INSERT INTO attempts (exam_id, student_id, attempt_no, started_at, deadline_at, retake_granted_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [examId, studentId, max_no + 1, startedAt, deadline, grantedBy],
      );
      const id = (ins.rows[0] as { id: string }).id;
      if (grantId) await tx.query('UPDATE retake_grants SET used_attempt_id = $1 WHERE id = $2', [id, grantId]);

      const ordered = exam.shuffle_questions ? shuffle(questionIds, rnd) : questionIds;
      const qs = await tx.query<{
        id: string; points: string; param_spec: ParamSpec | null; answer_spec: { expected: number; tolerance: Tolerance } | null;
        points_override: string | null; opts: string[];
      }>(
        `SELECT q.id, q.points, q.param_spec, q.answer_spec, eq.points_override,
                coalesce((SELECT array_agg(o.id ORDER BY o.position) FROM question_options o WHERE o.question_id = q.id), '{}') AS opts
           FROM questions q LEFT JOIN exam_questions eq ON eq.question_id = q.id AND eq.exam_id = $2
          WHERE q.id = ANY($1::uuid[])`,
        [ordered, examId],
      );
      const byId = new Map(qs.rows.map((q) => [q.id, q]));
      let pos = 0;
      for (const qid of ordered) {
        const q = byId.get(qid);
        if (!q) continue;
        const optionOrder = exam.shuffle_options ? shuffle(q.opts, rnd) : q.opts;
        let paramValues: unknown = null;
        let computed: unknown = null;
        if (q.param_spec) {
          const g = generateParams(q.param_spec, rnd);
          paramValues = g.values;
          computed = { value: g.answer, tolerance: q.param_spec.answer.tolerance };
        } else if (q.answer_spec) {
          computed = { value: q.answer_spec.expected, tolerance: q.answer_spec.tolerance };
        }
        await tx.query(
          `INSERT INTO attempt_questions (attempt_id, question_id, position, points, option_order, param_values, computed_answer)
           VALUES ($1,$2,$3,$4,$5::uuid[],$6,$7)`,
          [id, qid, pos++, q.points_override ?? q.points, optionOrder, JSON.stringify(paramValues), JSON.stringify(computed)],
        );
      }
      return id;
    });
    return await getAttemptForStudent(pool, studentId, attemptId);
  } catch (e) {
    // Poyga: ikki parallel "boshlash" — ikkinchisi unique indeksga urilib, mavjud urinishni oladi.
    if (isUniqueViolation(e, 'attempts_one_active_uq') || isUniqueViolation(e, 'attempts_exam_id_student_id_attempt_no_key')) {
      const r = await pool.query<{ id: string }>(
        `SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'`,
        [examId, studentId],
      );
      if (r.rows[0]) return getAttemptForStudent(pool, studentId, r.rows[0].id);
    }
    throw e;
  }
}

async function pickQuestions(tx: Db, exam: ExamRow, studentId: string): Promise<string[]> {
  let pool: { id: string; topic_id: string | null; seen: number }[];
  if (exam.source === 'random') {
    const topics = Object.keys(exam.topic_distribution ?? {});
    const r = await tx.query<{ id: string; topic_id: string | null; seen: number }>(
      `SELECT q.id, q.topic_id,
              (SELECT count(*)::int FROM attempt_questions aq JOIN attempts at ON at.id = aq.attempt_id
                WHERE aq.question_id = q.id AND at.student_id = $2) AS seen
         FROM questions q
        WHERE q.is_active AND NOT q.is_archived AND ($1::uuid[] = '{}' OR q.topic_id = ANY($1::uuid[]))
          AND (q.class_id IS NULL OR q.class_id = (SELECT class_id FROM students WHERE id = $2))`,
      [topics, studentId],
    );
    pool = r.rows;
  } else {
    const r = await tx.query<{ id: string; topic_id: string | null; seen: number }>(
      `SELECT q.id, q.topic_id,
              (SELECT count(*)::int FROM attempt_questions aq JOIN attempts at ON at.id = aq.attempt_id
                WHERE aq.question_id = q.id AND at.student_id = $2) AS seen
         FROM exam_questions eq JOIN questions q ON q.id = eq.question_id
        WHERE eq.exam_id = $1 AND NOT eq.is_voided AND q.is_active`,
      [exam.id, studentId],
    );
    pool = r.rows;
  }
  const count = Math.min(exam.question_count ?? pool.length, pool.length);
  const sel = selectQuestions({
    pool: pool.map((p) => ({ id: p.id, topicId: p.topic_id, seenCount: p.seen })),
    count,
    topicCounts: exam.source === 'random' ? (exam.topic_distribution ?? undefined) : undefined,
    randomInt: rnd,
  });
  return sel.ids;
}

/** O'quvchiga ko'rinadigan holat: to'g'ri javob belgilari YO'Q. */
export async function getAttemptForStudent(db: Db, studentId: string, attemptId: string): Promise<AttemptDto> {
  const a = await db.query<{ id: string; exam_id: string; status: string; started_at: Date; deadline_at: Date; now: Date; watermark: boolean; track: boolean; pdf: string | null; calc: boolean; sheet: boolean; warn: number }>(
    `SELECT a.id, a.exam_id, a.status, a.started_at, a.deadline_at, now() AS now, e.watermark_enabled AS watermark, e.track_focus_events AS track, e.pdf_media_id AS pdf, e.allow_calculator AS calc, e.allow_formula_sheet AS sheet, e.focus_warn_threshold AS warn
       FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1 AND a.student_id = $2`,
    [attemptId, studentId],
  );
  const at = a.rows[0];
  if (!at) throw notFound('Urinish topilmadi');
  const rows = await db.query<{
    id: string; position: number; type: string; body: string; image: string | null; points: string; param_values: Record<string, number> | null;
    option_order: string[]; sel: string[] | null; num: string | null; flagged: boolean | null; version: number | null;
    options: { id: string; body: string }[];
  }>(
    `SELECT aq.id, aq.position, q.type, q.body, q.image_media_id AS image, aq.points, aq.param_values, aq.option_order,
            an.selected_option_ids AS sel, an.numeric_value AS num, an.is_flagged AS flagged, an.version,
            coalesce((SELECT json_agg(json_build_object('id', o.id, 'body', o.body)) FROM question_options o WHERE o.question_id = q.id), '[]') AS options
       FROM attempt_questions aq
       JOIN questions q ON q.id = aq.question_id
       LEFT JOIN answers an ON an.attempt_question_id = aq.id
      WHERE aq.attempt_id = $1 ORDER BY aq.position`,
    [attemptId],
  );
  const { renderTemplate } = await import('@pep/shared');
  return {
    id: at.id,
    examId: at.exam_id,
    status: at.status,
    startedAt: at.started_at.toISOString(),
    deadlineAt: at.deadline_at.toISOString(),
    serverNow: at.now.toISOString(),
    watermark: at.watermark,
    trackEvents: at.track,
    pdfMediaId: at.pdf,
    allowCalculator: at.calc,
    allowFormulaSheet: at.sheet,
    focusWarnThreshold: at.warn,
    questions: rows.rows.map((r) => {
      const byId = new Map(r.options.map((o) => [o.id, o.body]));
      return {
        id: r.id,
        position: r.position,
        type: r.type,
        body: r.param_values ? renderTemplate(r.body, r.param_values) : r.body,
        imageMediaId: r.image,
        points: Number(r.points),
        options: r.option_order.filter((id) => byId.has(id)).map((id) => ({ id, body: byId.get(id) as string })),
        answer: r.version === null ? null : { selectedOptionIds: r.sel ?? [], numericValue: r.num === null ? null : Number(r.num), isFlagged: !!r.flagged, version: r.version },
      };
    }),
  };
}

export interface SaveAnswerArgs {
  clientOpId: string;
  attemptQuestionId: string;
  selectedOptionIds: string[];
  numericValue: number | null;
  isFlagged: boolean;
  /** Mijoz oxirgi ko'rgan versiya (0 — hali javob yo'q). Mos kelmasa javob QO'LLANMAYDI, server holati qaytadi. */
  baseVersion?: number;
}

export type SaveAnswerResult =
  | { status: 'saved' | 'duplicate'; version: number; deadlineAt: string }
  | { status: 'conflict'; version: number; selectedOptionIds: string[]; numericValue: number | null };

export async function saveAnswer(pool: Pool, studentId: string, attemptId: string, input: SaveAnswerArgs): Promise<SaveAnswerResult> {
  return withTx(pool, async (tx) => {
    const r = await tx.query<{ status: string; deadline_at: Date; now: Date; grace: number; exam_status: string }>(
      `SELECT a.status, a.deadline_at, now() AS now, e.late_submit_grace_seconds AS grace, e.status AS exam_status
         FROM attempts a JOIN exams e ON e.id = a.exam_id
        WHERE a.id = $1 AND a.student_id = $2 FOR UPDATE OF a`,
      [attemptId, studentId],
    );
    const a = r.rows[0];
    if (!a) throw notFound('Urinish topilmadi');
    if (a.status !== 'in_progress') throw conflict('Urinish yakunlangan', { reason: 'FINISHED' });
    if (a.exam_status === 'paused') throw conflict('Imtihon pauzada', { reason: 'PAUSED' });
    if (classifySubmission(a.now, a.deadline_at, a.grace) === 'rejected_late') {
      throw new LateError();
    }

    const q = await tx.query<{ option_order: string[] }>(
      'SELECT option_order FROM attempt_questions WHERE id = $1 AND attempt_id = $2',
      [input.attemptQuestionId, attemptId],
    );
    const aq = q.rows[0];
    if (!aq) throw notFound('Savol topilmadi');

    // Idempotentlik: shu client_op_id oldin qo'llangan bo'lsa — hech narsa o'zgarmaydi.
    const dup = await tx.query<{ applied_version: number }>('SELECT applied_version FROM answer_ops WHERE client_op_id = $1 AND attempt_id = $2', [
      input.clientOpId,
      attemptId,
    ]);
    if (dup.rows[0]) return { status: 'duplicate', version: dup.rows[0].applied_version, deadlineAt: a.deadline_at.toISOString() };

    const allowed = new Set(aq.option_order);
    if (new Set(input.selectedOptionIds).size !== input.selectedOptionIds.length || !input.selectedOptionIds.every((id) => allowed.has(id))) {
      throw badRequest('Noto\'g\'ri variant');
    }
    if (input.numericValue !== null && !Number.isFinite(input.numericValue)) throw badRequest('Noto\'g\'ri son');

    const cur = await tx.query<{ id: string; version: number; sel: string[]; num: string | null }>(
      'SELECT id, version, selected_option_ids AS sel, numeric_value AS num FROM answers WHERE attempt_question_id = $1 FOR UPDATE',
      [input.attemptQuestionId],
    );
    const existing = cur.rows[0];
    if (existing && input.baseVersion !== undefined && input.baseVersion < existing.version) {
      return { status: 'conflict', version: existing.version, selectedOptionIds: existing.sel, numericValue: existing.num === null ? null : Number(existing.num) };
    }
    let version = 1;
    if (existing) {
      version = existing.version + 1;
      await tx.query(
        `UPDATE answers SET selected_option_ids = $2::uuid[], numeric_value = $3, is_flagged = $4, version = $5, answered_at = now(), updated_at = now()
          WHERE id = $1`,
        [existing.id, input.selectedOptionIds, input.numericValue, input.isFlagged, version],
      );
    } else {
      await tx.query(
        `INSERT INTO answers (attempt_question_id, selected_option_ids, numeric_value, is_flagged) VALUES ($1,$2::uuid[],$3,$4)`,
        [input.attemptQuestionId, input.selectedOptionIds, input.numericValue, input.isFlagged],
      );
    }
    await tx.query(
      'INSERT INTO answer_ops (client_op_id, attempt_id, attempt_question_id, applied_version) VALUES ($1,$2,$3,$4)',
      [input.clientOpId, attemptId, input.attemptQuestionId, version],
    );
    await tx.query('UPDATE attempts SET last_sync_at = now() WHERE id = $1', [attemptId]);
    return { status: 'saved', version, deadlineAt: a.deadline_at.toISOString() };
  });
}

/** Deadline'dan keyingi javob. Marshrut qatlami 409 ga aylantiradi (kod: LATE). */
export class LateError extends Error {
  constructor() {
    super('Vaqt tugagan');
    this.name = 'LateError';
  }
}

export interface FinishResult {
  status: 'submitted' | 'expired';
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
}

/**
 * Urinishni yakunlaydi va baholaydi (idempotent: allaqachon yakunlangan bo'lsa shu natija qaytadi).
 * `reason='timeout'` bo'lsa yakunlash vaqti = deadline (kechikkan tugatish vaqtni uzaytirmaydi).
 */
export async function finishAttempt(
  pool: Pool,
  attemptId: string,
  reason: 'student' | 'timeout' | 'admin' | 'exam_cancelled',
  studentId?: string,
): Promise<FinishResult> {
  return withTx(pool, async (tx) => {
    const r = await tx.query<{
      id: string; exam_id: string; student_id: string; status: string; deadline_at: Date; now: Date; score: string | null;
      max_score: string | null; percent: string | null; pass_percent: string; policy: string;
    }>(
      `SELECT a.id, a.exam_id, a.student_id, a.status, a.deadline_at, now() AS now, a.score, a.max_score, a.percent,
              e.pass_percent, e.final_attempt_policy AS policy
         FROM attempts a JOIN exams e ON e.id = a.exam_id
        WHERE a.id = $1 ${studentId ? 'AND a.student_id = $2' : ''} FOR UPDATE OF a`,
      studentId ? [attemptId, studentId] : [attemptId],
    );
    const a = r.rows[0];
    if (!a) throw notFound('Urinish topilmadi');
    const passPct = Number(a.pass_percent);
    if (a.status !== 'in_progress') {
      return {
        status: a.status === 'expired' ? 'expired' : 'submitted',
        score: Number(a.score ?? 0), maxScore: Number(a.max_score ?? 0), percent: Number(a.percent ?? 0),
        passed: hasPassed(Number(a.percent ?? 0), passPct),
      };
    }
    const late = a.now.getTime() > a.deadline_at.getTime();
    const effReason = late && reason === 'student' ? 'timeout' : reason;
    const status = effReason === 'timeout' ? 'expired' : 'submitted';
    const submittedAt = effReason === 'timeout' ? a.deadline_at : a.now;

    const rows = await tx.query<{
      aq_id: string; points: string; is_voided: boolean | null; type: string; option_order: string[]; computed: { value: number; tolerance: Tolerance } | null;
      correct_ids: string[]; sel: string[] | null; num: string | null;
    }>(
      `SELECT aq.id AS aq_id, aq.points, eq.is_voided, q.type, aq.option_order, aq.computed_answer AS computed,
              coalesce((SELECT array_agg(o.id) FROM question_options o WHERE o.question_id = q.id AND o.is_correct), '{}') AS correct_ids,
              an.selected_option_ids AS sel, an.numeric_value AS num
         FROM attempt_questions aq
         JOIN questions q ON q.id = aq.question_id
         LEFT JOIN exam_questions eq ON eq.question_id = aq.question_id AND eq.exam_id = $2
         LEFT JOIN answers an ON an.attempt_question_id = aq.id
        WHERE aq.attempt_id = $1`,
      [attemptId, a.exam_id],
    );
    const items: GradedItem[] = rows.rows.map((x) => ({
      points: Number(x.points),
      voided: !!x.is_voided,
      answer:
        x.type === 'numeric' || x.computed
          ? { kind: 'numeric', expected: x.computed?.value ?? NaN, tolerance: x.computed?.tolerance ?? {}, value: x.num === null ? null : Number(x.num) }
          : { kind: x.type === 'multi' ? 'multi' : 'single', correct: x.correct_ids, selected: x.sel ?? [] },
    }));
    const s = scoreAttempt(items);

    for (let i = 0; i < rows.rows.length; i++) {
      const x = rows.rows[i] as (typeof rows.rows)[number];
      const it = items[i] as GradedItem;
      if (x.sel === null && x.num === null) continue;
      const one = scoreAttempt([{ ...it, voided: false }]);
      await tx.query('UPDATE answers SET is_correct = $2, points_awarded = $3 WHERE attempt_question_id = $1', [
        x.aq_id, one.correct === 1, one.score,
      ]);
    }

    await tx.query(
      `UPDATE attempts SET status = $2, finish_reason = $3, submitted_at = $4, score = $5, max_score = $6, percent = $7, updated_at = now()
        WHERE id = $1`,
      [attemptId, status, effReason, submittedAt, s.score, s.maxScore, s.percent],
    );
    await refreshFinal(tx, a.exam_id, a.student_id, a.policy);
    return { status, score: s.score, maxScore: s.maxScore, percent: s.percent, passed: hasPassed(s.percent, passPct) };
  });
}

/** Yakuniy urinishni siyosatga ko'ra belgilaydi (admin_choice — qo'lda; bu yerda tegilmaydi). */
export async function refreshFinal(tx: Db, examId: string, studentId: string, policy: string): Promise<void> {
  if (policy === 'admin_choice') return;
  const order = policy === 'best' ? 'percent DESC NULLS LAST, attempt_no DESC' : 'attempt_no DESC';
  await tx.query('UPDATE attempts SET is_final = false WHERE exam_id = $1 AND student_id = $2 AND is_final', [examId, studentId]);
  await tx.query(
    `UPDATE attempts SET is_final = true WHERE id = (
       SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2 AND status <> 'in_progress' AND status <> 'cancelled'
       ORDER BY ${order} LIMIT 1)`,
    [examId, studentId],
  );
}

/** Vaqti o'tgan faol urinishlarni yakunlaydi (davriy ish; grace dan keyin). */
export async function expireOverdueAttempts(pool: Pool, limit = 100): Promise<number> {
  const r = await pool.query<{ id: string }>(
    `SELECT a.id FROM attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.status = 'in_progress' AND a.deadline_at + make_interval(secs => e.late_submit_grace_seconds + 5) < now()
        AND e.status <> 'paused'
      ORDER BY a.deadline_at LIMIT $1`,
    [limit],
  );
  let n = 0;
  for (const row of r.rows) {
    try {
      await finishAttempt(pool, row.id, 'timeout');
      n++;
    } catch {
      /* keyingi aylanishda qayta uriniladi */
    }
  }
  return n;
}


/** O'quvchi sinfiga tegishli (draft va bekor qilinmagan) imtihonlar. */
export async function listStudentExams(db: Db, studentId: string): Promise<StudentExamDto[]> {
  const r = await db.query<{
    id: string; title: string; status: string; starts_at: Date; ends_at: Date; duration_minutes: number; question_count: number | null;
    retake_allowed: boolean; now: Date; active: string | null; used: number; grant: boolean;
  }>(
    `SELECT e.id, e.title, e.status, e.starts_at, e.ends_at, e.duration_minutes, e.question_count, e.retake_allowed, now() AS now,
            (SELECT a.id FROM attempts a WHERE a.exam_id = e.id AND a.student_id = s.id AND a.status = 'in_progress') AS active,
            (SELECT count(*)::int FROM attempts a WHERE a.exam_id = e.id AND a.student_id = s.id) AS used,
            EXISTS (SELECT 1 FROM retake_grants g WHERE g.exam_id = e.id AND g.student_id = s.id AND g.used_attempt_id IS NULL) AS grant
       FROM students s
       JOIN exam_classes ec ON ec.class_id = s.class_id
       JOIN exams e ON e.id = ec.exam_id
      WHERE s.id = $1 AND s.is_active AND e.status IN ('scheduled','running','paused','finished')
      ORDER BY e.starts_at DESC LIMIT 50`,
    [studentId],
  );
  return r.rows.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    startsAt: e.starts_at.toISOString(),
    endsAt: e.ends_at.toISOString(),
    durationMinutes: e.duration_minutes,
    questionCount: e.question_count,
    activeAttemptId: e.active,
    attemptsUsed: e.used,
    canStart: e.status === 'running' && e.now >= e.starts_at && e.now < e.ends_at && (e.active !== null || e.used === 0 || e.retake_allowed || e.grant),
  }));
}
