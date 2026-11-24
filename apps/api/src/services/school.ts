/** Maktab moduli: dars jadvali, elektron jurnal (baholar), davomat. */
import type { Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, notFound } from '../lib/errors';
import { writeAudit } from './audit';
import type { Actor } from './audit';

export const ATT_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];
export const GRADE_KINDS = ['daily', 'quiz', 'exam', 'quarter', 'year'] as const;

/* ───────── Dars jadvali ───────── */

export interface SlotDto { id: string; weekday: number; lessonNo: number; subject: string; room: string | null; startsAt: string | null; endsAt: string | null }

export async function listSlots(pool: Pool, classId: string): Promise<SlotDto[]> {
  const r = await pool.query<{ id: string; weekday: number; lesson_no: number; subject: string; room: string | null; s: string | null; e: string | null }>(
    `SELECT id, weekday, lesson_no, subject, room, to_char(starts_at,'HH24:MI') AS s, to_char(ends_at,'HH24:MI') AS e
       FROM schedule_slots WHERE class_id = $1 ORDER BY weekday, lesson_no`, [classId]);
  return r.rows.map((x) => ({ id: x.id, weekday: x.weekday, lessonNo: x.lesson_no, subject: x.subject, room: x.room, startsAt: x.s, endsAt: x.e }));
}

export async function saveSlot(pool: Pool, actor: Actor, classId: string, b: { weekday: number; lessonNo: number; subject: string; room?: string | null; startsAt?: string | null; endsAt?: string | null }): Promise<void> {
  await withTx(pool, async (tx) => {
    await tx.query(
      `INSERT INTO schedule_slots (class_id, weekday, lesson_no, subject, room, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (class_id, weekday, lesson_no) DO UPDATE SET subject = EXCLUDED.subject, room = EXCLUDED.room, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at`,
      [classId, b.weekday, b.lessonNo, b.subject, b.room ?? null, b.startsAt ?? null, b.endsAt ?? null]);
    await writeAudit(tx, actor, { action: 'schedule.save', entityType: 'class', entityId: classId, after: b });
  });
}

export async function deleteSlot(pool: Pool, actor: Actor, slotId: string): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query<{ class_id: string }>(`DELETE FROM schedule_slots WHERE id = $1 RETURNING class_id`, [slotId]);
    if (!r.rows[0]) throw notFound('Dars topilmadi');
    await writeAudit(tx, actor, { action: 'schedule.delete', entityType: 'class', entityId: r.rows[0].class_id });
  });
}

/* ───────── Jurnal ───────── */

export interface JournalDto {
  students: { id: string; name: string }[];
  grades: { id: string; studentId: string; date: string; subject: string; value: number; kind: string; topic: string | null; comment: string | null }[];
}

export async function getJournal(pool: Pool, classId: string, from: string, to: string): Promise<JournalDto> {
  const st = await pool.query<{ id: string; name: string }>(
    `SELECT id, last_name || ' ' || first_name AS name FROM students WHERE class_id = $1 AND is_active ORDER BY last_name, first_name`, [classId]);
  const g = await pool.query<{ id: string; student_id: string; d: string; subject: string; value: number; kind: string; topic: string | null; comment: string | null }>(
    `SELECT g.id, g.student_id, g.grade_date::text AS d, g.subject, g.value, g.kind, g.topic, g.comment
       FROM grades g JOIN students s ON s.id = g.student_id
      WHERE s.class_id = $1 AND g.grade_date BETWEEN $2::date AND $3::date ORDER BY g.grade_date, g.created_at`, [classId, from, to]);
  return { students: st.rows, grades: g.rows.map((x) => ({ id: x.id, studentId: x.student_id, date: x.d, subject: x.subject, value: x.value, kind: x.kind, topic: x.topic, comment: x.comment })) };
}

export async function addGrade(pool: Pool, actor: Actor, b: { studentId: string; date: string; subject: string; value: number; kind: string; topic?: string | null; comment?: string | null }): Promise<string> {
  return withTx(pool, async (tx) => {
    const s = await tx.query(`SELECT 1 FROM students WHERE id = $1`, [b.studentId]);
    if (!s.rows[0]) throw notFound('O\'quvchi topilmadi');
    const adminId = actor.type === 'admin' ? actor.adminId : null;
    const r = await tx.query<{ id: string }>(
      `INSERT INTO grades (student_id, admin_id, grade_date, subject, value, kind, topic, comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.studentId, adminId, b.date, b.subject, b.value, b.kind, b.topic ?? null, b.comment ?? null]);
    const id = (r.rows[0] as { id: string }).id;
    await writeAudit(tx, actor, { action: 'grade.add', entityType: 'grade', entityId: id, after: b });
    return id;
  });
}

export async function deleteGrade(pool: Pool, actor: Actor, gradeId: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw badRequest('Bahoni o\'chirish sababini kiriting');
  await withTx(pool, async (tx) => {
    const r = await tx.query(`DELETE FROM grades WHERE id = $1 RETURNING student_id, grade_date::text AS d, subject, value`, [gradeId]);
    if (!r.rows[0]) throw notFound('Baho topilmadi');
    await writeAudit(tx, actor, { action: 'grade.delete', entityType: 'grade', entityId: gradeId, before: r.rows[0], reason });
  });
}

/* ───────── Davomat ───────── */

export interface AttendanceDto { students: { id: string; name: string; status: AttStatus | null; note: string | null }[] }

export async function getAttendance(pool: Pool, classId: string, date: string): Promise<AttendanceDto> {
  const r = await pool.query<{ id: string; name: string; status: AttStatus | null; note: string | null }>(
    `SELECT s.id, s.last_name || ' ' || s.first_name AS name, a.status, a.note
       FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.lesson_date = $2::date
      WHERE s.class_id = $1 AND s.is_active ORDER BY s.last_name, s.first_name`, [classId, date]);
  return { students: r.rows };
}

export async function saveAttendance(pool: Pool, actor: Actor, classId: string, date: string, items: { studentId: string; status: AttStatus; note?: string | null }[]): Promise<number> {
  return withTx(pool, async (tx) => {
    const ids = items.map((i) => i.studentId);
    const ok = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM students WHERE class_id = $1 AND id = ANY($2::uuid[])`, [classId, ids]);
    if ((ok.rows[0] as { n: number }).n !== new Set(ids).size) throw badRequest('Ro\'yxatda bu sinfga tegishli bo\'lmagan o\'quvchi bor');
    const adminId = actor.type === 'admin' ? actor.adminId : null;
    for (const i of items) {
      await tx.query(
        `INSERT INTO attendance (student_id, lesson_date, status, note, admin_id) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (student_id, lesson_date) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, admin_id = EXCLUDED.admin_id, updated_at = now()`,
        [i.studentId, date, i.status, i.note ?? null, adminId]);
    }
    await writeAudit(tx, actor, { action: 'attendance.save', entityType: 'class', entityId: classId, after: { date, count: items.length } });
    return items.length;
  });
}

/* ───────── O'quvchi ko'rinishi ───────── */

export interface StudentSchoolDto {
  schedule: SlotDto[];
  grades: { id: string; date: string; subject: string; value: number; kind: string; topic: string | null; comment: string | null }[];
  average: number | null;
  attendance: { present: number; absent: number; late: number; excused: number; recent: { date: string; status: AttStatus }[] };
}

export async function getStudentSchool(pool: Pool, studentId: string): Promise<StudentSchoolDto> {
  const s = await pool.query<{ class_id: string }>(`SELECT class_id FROM students WHERE id = $1`, [studentId]);
  if (!s.rows[0]) throw notFound('O\'quvchi topilmadi');
  const schedule = await listSlots(pool, s.rows[0].class_id);
  const g = await pool.query<{ id: string; d: string; subject: string; value: number; kind: string; topic: string | null; comment: string | null }>(
    `SELECT id, grade_date::text AS d, subject, value, kind, topic, comment FROM grades WHERE student_id = $1 ORDER BY grade_date DESC, created_at DESC LIMIT 100`, [studentId]);
  const avg = await pool.query<{ a: string | null }>(`SELECT round(avg(value)::numeric, 2)::text AS a FROM grades WHERE student_id = $1`, [studentId]);
  const c = await pool.query<{ status: AttStatus; n: number }>(`SELECT status, count(*)::int AS n FROM attendance WHERE student_id = $1 GROUP BY status`, [studentId]);
  const rec = await pool.query<{ d: string; status: AttStatus }>(`SELECT lesson_date::text AS d, status FROM attendance WHERE student_id = $1 ORDER BY lesson_date DESC LIMIT 14`, [studentId]);
  const cnt = (k: AttStatus) => c.rows.find((x) => x.status === k)?.n ?? 0;
  return {
    schedule,
    grades: g.rows.map((x) => ({ id: x.id, date: x.d, subject: x.subject, value: x.value, kind: x.kind, topic: x.topic, comment: x.comment })),
    average: (avg.rows[0] as { a: string | null }).a === null ? null : Number((avg.rows[0] as { a: string }).a),
    attendance: { present: cnt('present'), absent: cnt('absent'), late: cnt('late'), excused: cnt('excused'), recent: rec.rows.map((x) => ({ date: x.d, status: x.status })) },
  };
}
