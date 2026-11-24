import { difficultyLabel, hasPassed, isSuspiciouslyFast, renderTemplate, summarizeResults } from '@pep/shared';
import type { ResultsSummary, ReviewQuestion, StudentAnalyticsDto, StudentResultDto } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { toCsv } from '../lib/csv';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { Actor } from './audit';
import { writeAudit } from './audit';
import { refreshFinal } from './attempts';

/** Natijalar o'quvchiga ko'rinadimi: darhol / imtihon tugagach / admin e'lon qilganda (yoki istalgan siyosatda erta e'lon qilingan bo'lsa). */
const VISIBLE_SQL = `(e.results_published_at IS NOT NULL OR e.results_policy = 'immediate' OR (e.results_policy = 'after_end' AND e.status = 'finished'))`;

/* ───────────────────────── Admin: natijalar ───────────────────────── */

export interface ResultRow {
  studentId: string;
  name: string;
  className: string;
  code: string;
  attempts: number;
  attemptId: string | null;
  status: string | null;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  passed: boolean | null;
  finishReason: string | null;
  submittedAt: string | null;
  durationMinutes: number | null;
  /** Signal (isbot emas): yuqori natija vaqtning 20% idan kamida topshirilgan */
  suspiciousFast: boolean;
}

export interface ExamResults {
  exam: { id: string; title: string; status: string; passPercent: number; resultsPolicy: string; resultsPublishedAt: string | null; finalPolicy: string };
  summary: ResultsSummary;
  notStarted: number;
  rows: ResultRow[];
}

export async function getExamResults(db: Db, examId: string): Promise<ExamResults> {
  const e = await db.query<{ id: string; title: string; status: string; pass_percent: string; results_policy: string; published: Date | null; policy: string; duration_minutes: number }>(
    'SELECT id, title, status, pass_percent, results_policy, results_published_at AS published, final_attempt_policy AS policy, duration_minutes FROM exams WHERE id = $1',
    [examId],
  );
  const ex = e.rows[0];
  if (!ex) throw notFound('Imtihon topilmadi');
  const pass = Number(ex.pass_percent);
  const r = await db.query<{
    id: string; name: string; class_name: string; code: string; attempts: number; attempt_id: string | null; status: string | null;
    score: string | null; max_score: string | null; percent: string | null; finish_reason: string | null; submitted_at: Date | null; started_at: Date | null;
  }>(
    `SELECT s.id, s.last_name || ' ' || s.first_name AS name, c.name AS class_name, s.code,
            (SELECT count(*)::int FROM attempts a WHERE a.exam_id = $1 AND a.student_id = s.id) AS attempts,
            f.id AS attempt_id, f.status, f.score, f.max_score, f.percent, f.finish_reason, f.submitted_at, f.started_at
       FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = $1
       LEFT JOIN LATERAL (
         SELECT a.* FROM attempts a WHERE a.exam_id = $1 AND a.student_id = s.id AND a.status IN ('submitted','expired')
          ORDER BY a.is_final DESC, a.attempt_no DESC LIMIT 1) f ON true
      WHERE s.is_active
      ORDER BY c.name, s.last_name, s.first_name`,
    [examId],
  );
  const rows: ResultRow[] = r.rows.map((x) => {
    const percent = x.percent === null ? null : Number(x.percent);
    return {
      studentId: x.id, name: x.name, className: x.class_name, code: x.code, attempts: x.attempts, attemptId: x.attempt_id, status: x.status,
      score: x.score === null ? null : Number(x.score), maxScore: x.max_score === null ? null : Number(x.max_score), percent,
      passed: percent === null ? null : hasPassed(percent, pass), finishReason: x.finish_reason, submittedAt: x.submitted_at?.toISOString() ?? null,
      durationMinutes: x.submitted_at && x.started_at ? Math.round((x.submitted_at.getTime() - x.started_at.getTime()) / 60_000) : null,
      suspiciousFast: isSuspiciouslyFast({ percent, elapsedSeconds: x.submitted_at && x.started_at ? (x.submitted_at.getTime() - x.started_at.getTime()) / 1000 : null, durationMinutes: ex.duration_minutes }),
    };
  });
  const done = rows.filter((x) => x.percent !== null).map((x) => x.percent as number);
  return {
    exam: { id: ex.id, title: ex.title, status: ex.status, passPercent: pass, resultsPolicy: ex.results_policy, resultsPublishedAt: ex.published?.toISOString() ?? null, finalPolicy: ex.policy },
    summary: summarizeResults(done, pass),
    notStarted: rows.filter((x) => x.attempts === 0).length,
    rows,
  };
}

export async function exportResultsCsv(pool: Pool, actor: Actor, examId: string): Promise<string> {
  const res = await getExamResults(pool, examId);
  await writeAudit(pool, actor, { action: 'exam.export_results', entityType: 'exam', entityId: examId, after: { rows: res.rows.length } });
  return toCsv(
    ['Sinf', 'Familiya Ism', 'ID', 'Urinishlar', 'Ball', 'Maksimum', 'Foiz', 'Natija', 'Yakunlanish sababi', 'Topshirgan vaqti (UTC)', 'Davomiyligi (daq)'],
    res.rows.map((r) => [
      r.className, r.name, r.code, r.attempts, r.score ?? '', r.maxScore ?? '', r.percent ?? '',
      r.percent === null ? 'topshirmagan' : r.passed ? 'o\'tdi' : 'o\'tmadi', r.finishReason ?? '', r.submittedAt ?? '', r.durationMinutes ?? '',
    ]),
  );
}

export interface QuestionStat {
  questionId: string;
  body: string;
  shown: number;
  answered: number;
  correct: number;
  correctPercent: number | null;
  difficulty: ReturnType<typeof difficultyLabel>;
  voided: boolean;
}

export async function getQuestionStats(db: Db, examId: string): Promise<QuestionStat[]> {
  const r = await db.query<{ id: string; body: string; shown: number; answered: number; correct: number; voided: boolean }>(
    `SELECT q.id, q.body, count(aq.id)::int AS shown,
            count(an.id) FILTER (WHERE cardinality(an.selected_option_ids) > 0 OR an.numeric_value IS NOT NULL)::int AS answered,
            count(an.id) FILTER (WHERE an.is_correct)::int AS correct,
            coalesce(bool_or(eq.is_voided), false) AS voided
       FROM attempt_questions aq
       JOIN attempts a ON a.id = aq.attempt_id AND a.exam_id = $1 AND a.status IN ('submitted','expired')
       JOIN questions q ON q.id = aq.question_id
       LEFT JOIN exam_questions eq ON eq.exam_id = $1 AND eq.question_id = q.id
       LEFT JOIN answers an ON an.attempt_question_id = aq.id
      GROUP BY q.id, q.body`,
    [examId],
  );
  return r.rows
    .map((x) => {
      const pct = x.answered > 0 ? Math.round((x.correct * 10000) / x.answered) / 100 : null;
      return { questionId: x.id, body: x.body, shown: x.shown, answered: x.answered, correct: x.correct, correctPercent: pct, difficulty: difficultyLabel(pct, x.answered), voided: x.voided };
    })
    .sort((a, b) => (a.correctPercent ?? 101) - (b.correctPercent ?? 101));
}

/* ───────────────────────── Admin: jonli monitoring ───────────────────────── */

export interface MonitorRow {
  attemptId: string;
  studentId: string;
  name: string;
  className: string;
  startedAt: string;
  deadlineAt: string;
  answered: number;
  total: number;
  lastSyncAt: string | null;
  lastHeartbeatAt: string | null;
  leaves: number;
  reconnects: number;
  /** 'ok' | 'silent' (heartbeat/saqlash 2+ daqiqa yo'q) — signal, aybdorlik isboti emas */
  signal: 'ok' | 'silent';
}

export async function getMonitor(db: Db, examId: string) {
  const e = await db.query<{ status: string; now: Date }>('SELECT status, now() AS now FROM exams WHERE id = $1', [examId]);
  if (!e.rows[0]) throw notFound('Imtihon topilmadi');
  const now = e.rows[0].now;
  const r = await db.query<{
    id: string; student_id: string; name: string; class_name: string; started_at: Date; deadline_at: Date; sync: Date | null; hb: Date | null;
    total: number; answered: number; leaves: number; reconnects: number;
  }>(
    `SELECT a.id, a.student_id, s.last_name || ' ' || s.first_name AS name, c.name AS class_name, a.started_at, a.deadline_at,
            a.last_sync_at AS sync, a.last_heartbeat_at AS hb,
            (SELECT count(*)::int FROM attempt_questions aq WHERE aq.attempt_id = a.id) AS total,
            (SELECT count(*)::int FROM answers an JOIN attempt_questions aq ON aq.id = an.attempt_question_id
              WHERE aq.attempt_id = a.id AND (cardinality(an.selected_option_ids) > 0 OR an.numeric_value IS NOT NULL)) AS answered,
            (SELECT count(*)::int FROM attempt_events ev WHERE ev.attempt_id = a.id AND ev.kind IN ('visibility_hidden','blur')) AS leaves,
            (SELECT count(*)::int FROM attempt_events ev WHERE ev.attempt_id = a.id AND ev.kind = 'reconnect') AS reconnects
       FROM attempts a JOIN students s ON s.id = a.student_id JOIN classes c ON c.id = s.class_id
      WHERE a.exam_id = $1 AND a.status = 'in_progress'
      ORDER BY a.started_at`,
    [examId],
  );
  const counts = await db.query<{ total: number; started: number; finished: number }>(
    `SELECT (SELECT count(*)::int FROM students s JOIN exam_classes ec ON ec.class_id = s.class_id AND ec.exam_id = $1 WHERE s.is_active) AS total,
            (SELECT count(DISTINCT a.student_id)::int FROM attempts a WHERE a.exam_id = $1) AS started,
            (SELECT count(DISTINCT a.student_id)::int FROM attempts a WHERE a.exam_id = $1 AND a.status IN ('submitted','expired')) AS finished`,
    [examId],
  );
  const c = counts.rows[0] as { total: number; started: number; finished: number };
  const rows: MonitorRow[] = r.rows.map((x) => {
    const last = Math.max(x.sync?.getTime() ?? 0, x.hb?.getTime() ?? 0, x.started_at.getTime());
    return {
      attemptId: x.id, studentId: x.student_id, name: x.name, className: x.class_name, startedAt: x.started_at.toISOString(), deadlineAt: x.deadline_at.toISOString(),
      answered: x.answered, total: x.total, lastSyncAt: x.sync?.toISOString() ?? null, lastHeartbeatAt: x.hb?.toISOString() ?? null,
      leaves: x.leaves, reconnects: x.reconnects, signal: now.getTime() - last > 120_000 ? 'silent' : 'ok',
    };
  });
  return { serverNow: now.toISOString(), examStatus: e.rows[0].status, totalStudents: c.total, notStarted: c.total - c.started, inProgress: rows.length, finished: c.finished, rows };
}

/* ───────────────────────── Admin: yakuniy urinish, e'lon qilish ───────────────────────── */

export async function listStudentAttempts(db: Db, examId: string, studentId: string) {
  const r = await db.query(
    `SELECT id, attempt_no, status, score, max_score, percent, is_final, submitted_at, finish_reason
       FROM attempts WHERE exam_id = $1 AND student_id = $2 ORDER BY attempt_no`,
    [examId, studentId],
  );
  return r.rows;
}

/** "Yakuniy urinish — admin tanlaydi" siyosati yoki istisno uchun qo'lda belgilash. */
export async function setFinalAttempt(pool: Pool, actor: Actor, examId: string, attemptId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw badRequest('Sabab majburiy');
  await withTx(pool, async (tx) => {
    const a = await tx.query<{ student_id: string; status: string }>('SELECT student_id, status FROM attempts WHERE id = $1 AND exam_id = $2 FOR UPDATE', [attemptId, examId]);
    const at = a.rows[0];
    if (!at) throw notFound('Urinish topilmadi');
    if (at.status !== 'submitted' && at.status !== 'expired') throw conflict('Faqat yakunlangan urinishni tanlash mumkin');
    await tx.query('UPDATE attempts SET is_final = false WHERE exam_id = $1 AND student_id = $2 AND is_final', [examId, at.student_id]);
    await tx.query('UPDATE attempts SET is_final = true WHERE id = $1', [attemptId]);
    await writeAudit(tx, actor, { action: 'attempt.set_final', entityType: 'attempt', entityId: attemptId, after: { examId, studentId: at.student_id }, reason });
  });
}

export async function enqueueResultNotifications(db: Db, examId: string): Promise<number> {
  const r = await db.query(
    `INSERT INTO notifications (student_id, exam_id, kind, dedupe_key, payload)
     SELECT s.id, e.id, 'results_published', 'results_published:' || e.id || ':' || s.id, jsonb_build_object('examTitle', e.title)
       FROM exams e
       JOIN exam_classes ec ON ec.exam_id = e.id
       JOIN students s ON s.class_id = ec.class_id AND s.is_active AND s.telegram_id IS NOT NULL
      WHERE e.id = $1
        AND EXISTS (SELECT 1 FROM attempts a WHERE a.exam_id = e.id AND a.student_id = s.id AND a.status IN ('submitted','expired'))
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [examId],
  );
  return r.rowCount ?? 0;
}

export async function publishResults(pool: Pool, actor: Actor, examId: string): Promise<{ notified: number }> {
  return withTx(pool, async (tx) => {
    const e = await tx.query<{ status: string; published: Date | null }>('SELECT status, results_published_at AS published FROM exams WHERE id = $1 FOR UPDATE', [examId]);
    const ex = e.rows[0];
    if (!ex) throw notFound('Imtihon topilmadi');
    if (ex.status !== 'finished') throw conflict('Natijalarni faqat imtihon yakunlangandan keyin e\'lon qilish mumkin');
    if (!ex.published) await tx.query('UPDATE exams SET results_published_at = now(), updated_at = now() WHERE id = $1', [examId]);
    const notified = await enqueueResultNotifications(tx, examId);
    await writeAudit(tx, actor, { action: 'exam.publish_results', entityType: 'exam', entityId: examId, after: { notified } });
    return { notified };
  });
}

/* ───────────────────────── O'quvchi: natijalarim ───────────────────────── */

export async function listStudentResults(db: Db, studentId: string): Promise<StudentResultDto[]> {
  const r = await db.query<{
    exam_id: string; title: string; pass_percent: string; id: string; attempt_no: number; score: string; max_score: string; percent: string; submitted_at: Date;
    rank: number | null; rank_total: number | null;
  }>(
    `SELECT e.id AS exam_id, e.title, e.pass_percent, f.id, f.attempt_no, f.score, f.max_score, f.percent, f.submitted_at,
            CASE WHEN e.show_rankings THEN (SELECT count(*)::int + 1 FROM attempts a2 WHERE a2.exam_id = e.id AND a2.is_final AND a2.status IN ('submitted','expired') AND a2.percent > f.percent) END AS rank,
            CASE WHEN e.show_rankings THEN (SELECT count(*)::int FROM attempts a2 WHERE a2.exam_id = e.id AND a2.is_final AND a2.status IN ('submitted','expired')) END AS rank_total
       FROM students s
       JOIN exam_classes ec ON ec.class_id = s.class_id
       JOIN exams e ON e.id = ec.exam_id AND ${VISIBLE_SQL}
       JOIN LATERAL (
         SELECT a.* FROM attempts a WHERE a.exam_id = e.id AND a.student_id = s.id AND a.status IN ('submitted','expired')
          ORDER BY a.is_final DESC, a.attempt_no DESC LIMIT 1) f ON true
      WHERE s.id = $1
      ORDER BY f.submitted_at DESC LIMIT 100`,
    [studentId],
  );
  return r.rows.map((x) => ({
    examId: x.exam_id, title: x.title, attemptId: x.id, attemptNo: x.attempt_no, score: Number(x.score), maxScore: Number(x.max_score),
    percent: Number(x.percent), passed: hasPassed(Number(x.percent), Number(x.pass_percent)), submittedAt: x.submitted_at.toISOString(),
    rank: x.rank, rankTotal: x.rank_total,
  }));
}

/** O'quvchining o'z tahlili: natijalar dinamikasi va mavzular bo'yicha o'zlashtirish (faqat e'lon qilingan natijalar). */
export async function getStudentAnalytics(db: Db, studentId: string): Promise<StudentAnalyticsDto> {
  const h = await db.query<{ title: string; percent: string; submitted_at: Date }>(
    `SELECT e.title, a.percent, a.submitted_at FROM attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.student_id = $1 AND a.is_final AND a.status IN ('submitted','expired') AND ${VISIBLE_SQL} ORDER BY a.submitted_at ASC LIMIT 60`,
    [studentId],
  );
  const t = await db.query<{ topic: string | null; earned: string; total: string }>(
    `SELECT t.name AS topic, sum(coalesce(an.points_awarded, 0)) AS earned, sum(aq.points) AS total
       FROM attempts a JOIN exams e ON e.id = a.exam_id
       JOIN attempt_questions aq ON aq.attempt_id = a.id JOIN questions q ON q.id = aq.question_id
       LEFT JOIN topics t ON t.id = q.topic_id LEFT JOIN answers an ON an.attempt_question_id = aq.id
       LEFT JOIN exam_questions eq ON eq.exam_id = e.id AND eq.question_id = aq.question_id
      WHERE a.student_id = $1 AND a.is_final AND a.status IN ('submitted','expired') AND ${VISIBLE_SQL} AND coalesce(eq.is_voided, false) = false AND t.id IS NOT NULL
      GROUP BY t.id, t.name ORDER BY t.name`,
    [studentId],
  );
  return {
    history: h.rows.map((x) => ({ title: x.title, percent: Number(x.percent), submittedAt: x.submitted_at.toISOString() })),
    topics: t.rows.map((x) => ({ topic: x.topic ?? '—', earned: Number(x.earned), total: Number(x.total), percent: Number(x.total) > 0 ? Math.round((Number(x.earned) / Number(x.total)) * 1000) / 10 : 0 })),
  };
}

/** Natija ko'rinadigan bo'lsa — savollar bo'yicha tahlil (to'g'ri javoblar bilan). Ko'rinmasa 404. */
export async function getStudentReview(db: Db, studentId: string, attemptId: string): Promise<{ examTitle: string; questions: ReviewQuestion[] }> {
  const a = await db.query<{ exam_id: string; title: string }>(
    `SELECT e.id AS exam_id, e.title FROM attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.id = $1 AND a.student_id = $2 AND a.status IN ('submitted','expired') AND ${VISIBLE_SQL}`,
    [attemptId, studentId],
  );
  const at = a.rows[0];
  if (!at) throw notFound('Natija topilmadi yoki hali e\'lon qilinmagan');
  const r = await db.query<{
    aqid: string; image: string | null; position: number; type: string; body: string; points: string; param_values: Record<string, number> | null; option_order: string[];
    explanation: string | null; computed: { value: number } | null; sel: string[] | null; num: string | null; awarded: string | null; correct_flag: boolean | null;
    voided: boolean | null; options: { id: string; body: string; is_correct: boolean }[];
  }>(
    `SELECT aq.id AS aqid, q.image_media_id AS image, aq.position, q.type, q.body, aq.points, aq.param_values, aq.option_order, q.explanation, aq.computed_answer AS computed,
            an.selected_option_ids AS sel, an.numeric_value AS num, an.points_awarded AS awarded, an.is_correct AS correct_flag, eq.is_voided AS voided,
            coalesce((SELECT json_agg(json_build_object('id', o.id, 'body', o.body, 'is_correct', o.is_correct)) FROM question_options o WHERE o.question_id = q.id), '[]') AS options
       FROM attempt_questions aq
       JOIN questions q ON q.id = aq.question_id
       LEFT JOIN answers an ON an.attempt_question_id = aq.id
       LEFT JOIN exam_questions eq ON eq.exam_id = $2 AND eq.question_id = aq.question_id
      WHERE aq.attempt_id = $1 ORDER BY aq.position`,
    [attemptId, at.exam_id],
  );
  return {
    examTitle: at.title,
    questions: r.rows.map((x) => {
      const byId = new Map(x.options.map((o) => [o.id, o]));
      const isNum = x.computed !== null;
      return {
        id: x.aqid, imageMediaId: x.image, position: x.position, type: x.type, body: x.param_values ? renderTemplate(x.body, x.param_values) : x.body,
        points: Number(x.points), pointsAwarded: x.awarded === null ? null : Number(x.awarded), voided: !!x.voided, isCorrect: x.correct_flag,
        explanation: x.explanation,
        options: isNum ? [] : x.option_order.filter((id) => byId.has(id)).map((id) => ({ id, body: (byId.get(id) as { body: string }).body, selected: (x.sel ?? []).includes(id), correct: (byId.get(id) as { is_correct: boolean }).is_correct })),
        numeric: isNum ? { yours: x.num === null ? null : Number(x.num), expected: (x.computed as { value: number }).value } : null,
      };
    }),
  };
}

/* ───────────────────────── Urinish hodisalari va yurak urishi ───────────────────────── */

export const EVENT_KINDS = ['visibility_hidden', 'visibility_visible', 'blur', 'focus', 'reconnect', 'closing_attempt'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export async function recordHeartbeat(db: Db, studentId: string, attemptId: string): Promise<{ status: string; serverNow: string; deadlineAt: string }> {
  const r = await db.query<{ status: string; now: Date; deadline_at: Date }>(
    `UPDATE attempts SET last_heartbeat_at = now() WHERE id = $1 AND student_id = $2 AND status = 'in_progress' RETURNING status, now() AS now, deadline_at`,
    [attemptId, studentId],
  );
  if (r.rows[0]) return { status: r.rows[0].status, serverNow: r.rows[0].now.toISOString(), deadlineAt: r.rows[0].deadline_at.toISOString() };
  const s = await db.query<{ status: string; now: Date; deadline_at: Date }>('SELECT status, now() AS now, deadline_at FROM attempts WHERE id = $1 AND student_id = $2', [attemptId, studentId]);
  if (!s.rows[0]) throw notFound('Urinish topilmadi');
  return { status: s.rows[0].status, serverNow: s.rows[0].now.toISOString(), deadlineAt: s.rows[0].deadline_at.toISOString() };
}

/** Hodisalar — dalil/signal sifatida saqlanadi (aybdorlik isboti emas). Faqat faol urinish uchun; kuniga ~cheklangan. */
export async function recordEvents(db: Db, studentId: string, attemptId: string, events: { kind: EventKind; clientTs?: string | null }[]): Promise<number> {
  const a = await db.query('SELECT 1 FROM attempts WHERE id = $1 AND student_id = $2 AND status = \'in_progress\'', [attemptId, studentId]);
  if (!a.rows[0]) return 0;
  const cnt = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM attempt_events WHERE attempt_id = $1', [attemptId]);
  const room = Math.max(0, 500 - (cnt.rows[0]?.n ?? 0)); // bitta urinishga ko'pi bilan 500 hodisa
  const take = events.slice(0, Math.min(20, room));
  for (const ev of take) {
    const ts = ev.clientTs && !Number.isNaN(Date.parse(ev.clientTs)) ? new Date(ev.clientTs) : null;
    await db.query('INSERT INTO attempt_events (attempt_id, kind, client_ts) VALUES ($1,$2,$3)', [attemptId, ev.kind, ts]);
  }
  return take.length;
}
