/** Yakuniy bosqich servislari: qo'shimcha vaqt, qo'lda ball, xabar yuborish, shikoyatlar, materiallar, zaxira holati. */
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, conflict, notFound } from '../lib/errors';
import { writeAudit } from './audit';
import type { Actor } from './audit';
import { hasPassed } from '@pep/shared';
import { refreshFinal } from './attempts';

/* ───────────── Qo'shimcha vaqt ───────────── */

export async function addExtraTime(pool: Pool, actor: Actor, examId: string, studentId: string, minutes: number, reason: string): Promise<{ deadlineAt: string }> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw badRequest('Qo\'shimcha vaqt 1–120 daqiqa bo\'lsin');
  if (reason.trim().length < 3) throw badRequest('Sabab kiriting');
  return withTx(pool, async (tx) => {
    const r = await tx.query<{ id: string; deadline_at: Date; extra_seconds: number }>(
      `SELECT id, deadline_at, extra_seconds FROM attempts WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress' FOR UPDATE`,
      [examId, studentId],
    );
    const a = r.rows[0];
    if (!a) throw conflict('Bu o\'quvchida faol urinish yo\'q (vaqt faqat ishlayotgan urinishga beriladi)');
    const u = await tx.query<{ deadline_at: Date }>(
      `UPDATE attempts SET deadline_at = deadline_at + make_interval(mins => $2), extra_seconds = extra_seconds + $2 * 60, updated_at = now() WHERE id = $1 RETURNING deadline_at`,
      [a.id, minutes],
    );
    const deadline = (u.rows[0] as { deadline_at: Date }).deadline_at;
    await writeAudit(tx, actor, { action: 'attempt.extra_time', entityType: 'attempt', entityId: a.id, before: { deadlineAt: a.deadline_at }, after: { deadlineAt: deadline, minutes }, reason });
    return { deadlineAt: deadline.toISOString() };
  });
}

/* ───────────── Qo'lda ball tuzatish ───────────── */

export async function adjustScore(pool: Pool, actor: Actor, attemptId: string, newScore: number, reason: string): Promise<{ score: number; maxScore: number; percent: number; passed: boolean }> {
  if (reason.trim().length < 3) throw badRequest('Ballni qo\'lda o\'zgartirish uchun sabab majburiy');
  if (!Number.isFinite(newScore) || newScore < 0) throw badRequest('Ball noto\'g\'ri');
  return withTx(pool, async (tx) => {
    const r = await tx.query<{ exam_id: string; student_id: string; status: string; score: string | null; max_score: string | null; pass: string; policy: string }>(
      `SELECT a.exam_id, a.student_id, a.status, a.score, a.max_score, e.pass_percent AS pass, e.final_attempt_policy AS policy
         FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1 FOR UPDATE OF a`,
      [attemptId],
    );
    const a = r.rows[0];
    if (!a) throw notFound('Urinish topilmadi');
    if (a.status === 'in_progress' || a.score === null || a.max_score === null) throw conflict('Faqat yakunlangan urinish balli o\'zgartiriladi');
    const max = Number(a.max_score);
    if (newScore > max) throw badRequest(`Ball maksimal ${max} dan oshmasin`);
    const percent = max > 0 ? Math.round((newScore / max) * 10000) / 100 : 0;
    await tx.query('UPDATE attempts SET score = $2, percent = $3, updated_at = now() WHERE id = $1', [attemptId, newScore, percent]);
    await tx.query('INSERT INTO score_adjustments (attempt_id, admin_id, old_score, new_score, reason) VALUES ($1,$2,$3,$4,$5)', [attemptId, actor.type === 'admin' ? actor.adminId : null, Number(a.score), newScore, reason.trim()]);
    await refreshFinal(tx, a.exam_id, a.student_id, a.policy);
    await writeAudit(tx, actor, { action: 'attempt.adjust_score', entityType: 'attempt', entityId: attemptId, before: { score: Number(a.score) }, after: { score: newScore, percent }, reason });
    return { score: newScore, maxScore: max, percent, passed: hasPassed(percent, Number(a.pass)) };
  });
}

export async function listScoreAdjustments(db: Db, attemptId: string) {
  const r = await db.query(`SELECT id, old_score, new_score, reason, created_at FROM score_adjustments WHERE attempt_id = $1 ORDER BY created_at DESC`, [attemptId]);
  return r.rows;
}

/* ───────────── Xabar yuborish (admin -> sinf/o'quvchilar) ───────────── */

export async function broadcast(pool: Pool, actor: Actor, input: { classIds: string[]; studentIds: string[]; text: string }): Promise<{ queued: number; withoutTelegram: number }> {
  const text = input.text.trim();
  if (text.length < 1 || text.length > 1000) throw badRequest('Xabar 1–1000 belgi bo\'lsin');
  if (input.classIds.length === 0 && input.studentIds.length === 0) throw badRequest('Sinf yoki o\'quvchi tanlang');
  return withTx(pool, async (tx) => {
    const batch = crypto.randomUUID();
    const targets = await tx.query<{ id: string; linked: boolean }>(
      `SELECT DISTINCT s.id, (s.telegram_id IS NOT NULL) AS linked FROM students s
        WHERE s.is_active AND (s.class_id = ANY($1::uuid[]) OR s.id = ANY($2::uuid[]))`,
      [input.classIds, input.studentIds],
    );
    let queued = 0;
    for (const t of targets.rows) {
      if (!t.linked) continue;
      const q = await tx.query(
        `INSERT INTO notifications (student_id, kind, dedupe_key, payload) VALUES ($1, 'custom', $2, $3::jsonb) ON CONFLICT (dedupe_key) DO NOTHING`,
        [t.id, `custom:${batch}:${t.id}`, JSON.stringify({ text })],
      );
      queued += q.rowCount ?? 0;
    }
    await writeAudit(tx, actor, { action: 'broadcast.send', entityType: 'notification', after: { batch, queued, classes: input.classIds.length, students: input.studentIds.length } });
    return { queued, withoutTelegram: targets.rows.filter((t) => !t.linked).length };
  });
}

/* ───────────── Shikoyatlar ───────────── */

export async function createComplaint(pool: Pool, studentId: string, attemptId: string, attemptQuestionId: string | null, body: string): Promise<string> {
  const text = body.trim();
  if (text.length < 3 || text.length > 1000) throw badRequest('Shikoyat matni 3–1000 belgi bo\'lsin');
  return withTx(pool, async (tx) => {
    // Faqat o'z, yakunlangan va natijasi e'lon qilingan urinish bo'yicha
    const a = await tx.query(
      `SELECT 1 FROM attempts a JOIN exams e ON e.id = a.exam_id
        WHERE a.id = $1 AND a.student_id = $2 AND a.status IN ('submitted','expired')
          AND (e.results_published_at IS NOT NULL OR e.results_policy = 'immediate' OR (e.results_policy = 'after_end' AND e.status = 'finished'))`,
      [attemptId, studentId],
    );
    if (!a.rows[0]) throw notFound('Natija topilmadi yoki hali e\'lon qilinmagan');
    if (attemptQuestionId) {
      const q = await tx.query('SELECT 1 FROM attempt_questions WHERE id = $1 AND attempt_id = $2', [attemptQuestionId, attemptId]);
      if (!q.rows[0]) throw badRequest('Savol bu urinishga tegishli emas');
    }
    try {
      const r = await tx.query<{ id: string }>('INSERT INTO complaints (attempt_id, attempt_question_id, student_id, body) VALUES ($1,$2,$3,$4) RETURNING id', [attemptId, attemptQuestionId, studentId, text]);
      return (r.rows[0] as { id: string }).id;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('Bu bo\'yicha ochiq shikoyatingiz allaqachon bor');
      throw e;
    }
  });
}

export async function listComplaints(db: Db, status: 'open' | 'accepted' | 'rejected' | null) {
  const r = await db.query(
    `SELECT c.id, c.status, c.body, c.admin_note, c.created_at, c.resolved_at, c.attempt_id,
            s.last_name || ' ' || s.first_name AS student, cl.name AS class_name, e.title AS exam_title,
            aq.position AS question_position
       FROM complaints c JOIN students s ON s.id = c.student_id JOIN classes cl ON cl.id = s.class_id
       JOIN attempts a ON a.id = c.attempt_id JOIN exams e ON e.id = a.exam_id
       LEFT JOIN attempt_questions aq ON aq.id = c.attempt_question_id
      WHERE ($1::text IS NULL OR c.status = $1) ORDER BY (c.status = 'open') DESC, c.created_at DESC LIMIT 200`,
    [status],
  );
  return r.rows;
}

export async function resolveComplaint(pool: Pool, actor: Actor, id: string, status: 'accepted' | 'rejected', note: string): Promise<void> {
  if (note.trim().length < 3) throw badRequest('Izoh kiriting');
  await withTx(pool, async (tx) => {
    const r = await tx.query<{ student_id: string }>(
      `UPDATE complaints SET status = $2, admin_note = $3, resolved_by = $4, resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING student_id`,
      [id, status, note.trim(), actor.type === 'admin' ? actor.adminId : null],
    );
    if (!r.rows[0]) throw conflict('Shikoyat topilmadi yoki allaqachon ko\'rib chiqilgan');
    await tx.query(
      `INSERT INTO notifications (student_id, kind, dedupe_key, payload) VALUES ($1, 'custom', $2, $3::jsonb) ON CONFLICT (dedupe_key) DO NOTHING`,
      [(r.rows[0] as { student_id: string }).student_id, `complaint:${id}`, JSON.stringify({ text: `Shikoyatingiz ${status === 'accepted' ? 'qabul qilindi' : 'rad etildi'}.\nIzoh: ${note.trim()}` })],
    );
    await writeAudit(tx, actor, { action: `complaint.${status}`, entityType: 'complaint', entityId: id, reason: note });
  });
}

/* ───────────── Materiallar ───────────── */

export interface MaterialInput {
  classId: string; topicId?: string | null; weekLabel?: string | null; title: string; summary?: string | null; videoUrl?: string | null;
  homework?: string | null; dueAt?: Date | null; mediaId?: string | null; isPublished: boolean;
}

export async function saveMaterial(pool: Pool, actor: Actor, id: string | null, m: MaterialInput): Promise<string> {
  if (m.title.trim().length === 0) throw badRequest('Sarlavha kerak');
  if (m.videoUrl && !/^https:\/\//i.test(m.videoUrl)) throw badRequest('Video havolasi https:// bilan boshlansin');
  return withTx(pool, async (tx) => {
    const p = [m.classId, m.topicId ?? null, m.weekLabel ?? null, m.title.trim(), m.summary ?? null, m.videoUrl ?? null, m.homework ?? null, m.dueAt ?? null, m.mediaId ?? null, m.isPublished];
    if (id) {
      const r = await tx.query(
        `UPDATE materials SET class_id=$2, topic_id=$3, week_label=$4, title=$5, summary=$6, video_url=$7, homework=$8, due_at=$9, media_id=$10, is_published=$11, updated_at=now() WHERE id=$1`,
        [id, ...p],
      );
      if (r.rowCount === 0) throw notFound('Material topilmadi');
      await writeAudit(tx, actor, { action: 'material.update', entityType: 'material', entityId: id });
      return id;
    }
    const r = await tx.query<{ id: string }>(
      `INSERT INTO materials (class_id, topic_id, week_label, title, summary, video_url, homework, due_at, media_id, is_published, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [...p, actor.type === 'admin' ? actor.adminId : null],
    );
    const nid = (r.rows[0] as { id: string }).id;
    await writeAudit(tx, actor, { action: 'material.create', entityType: 'material', entityId: nid });
    return nid;
  });
}

export async function deleteMaterial(pool: Pool, actor: Actor, id: string): Promise<void> {
  const r = await pool.query('DELETE FROM materials WHERE id = $1', [id]);
  if (r.rowCount === 0) throw notFound('Material topilmadi');
  await writeAudit(pool, actor, { action: 'material.delete', entityType: 'material', entityId: id });
}

export async function listMaterialsAdmin(db: Db) {
  const r = await db.query(
    `SELECT m.*, c.name AS class_name FROM materials m JOIN classes c ON c.id = m.class_id ORDER BY m.created_at DESC LIMIT 200`,
  );
  return r.rows;
}

/** O'quvchi faqat o'z sinfining NASHR QILINGAN materiallarini ko'radi. */
export async function listMaterialsForStudent(db: Db, studentId: string) {
  const r = await db.query(
    `SELECT m.id, m.title, m.summary, m.video_url, m.homework, m.due_at, m.week_label, m.media_id, t.name AS topic
       FROM materials m JOIN students s ON s.class_id = m.class_id LEFT JOIN topics t ON t.id = m.topic_id
      WHERE s.id = $1 AND m.is_published ORDER BY m.created_at DESC LIMIT 50`,
    [studentId],
  );
  return r.rows;
}

/* ───────────── Zaxira holati ───────────── */

export async function listBackups(db: Db) {
  const r = await db.query(`SELECT id, status, file_name, size_bytes, sha256, started_at, finished_at, error, restore_tested_at FROM backups ORDER BY started_at DESC LIMIT 30`);
  return r.rows;
}
