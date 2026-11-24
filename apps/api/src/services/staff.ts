/** O'qituvchilar (sinf rahbari / fan o'qituvchisi) va ularning sinf bo'yicha ruxsatlari. */
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../lib/errors';
import type { AdminContext } from './admin-auth';
import { writeAudit } from './audit';
import type { Actor } from './audit';

export interface AssignmentDto { id: string; classId: string; className: string; kind: 'homeroom' | 'subject'; subject: string | null }
export interface TeacherDto { id: string; telegramId: number; displayName: string | null; subject: string | null; isActive: boolean; assignments: AssignmentDto[] }

export async function listAssignments(db: Db, adminId: string): Promise<AssignmentDto[]> {
  const r = await db.query<{ id: string; class_id: string; name: string; kind: 'homeroom' | 'subject'; subject: string | null }>(
    `SELECT t.id, t.class_id, c.name, t.kind, t.subject FROM teacher_assignments t JOIN classes c ON c.id = t.class_id
      WHERE t.admin_id = $1 AND NOT c.is_archived ORDER BY c.name, t.kind, t.subject`, [adminId]);
  return r.rows.map((x) => ({ id: x.id, classId: x.class_id, className: x.name, kind: x.kind, subject: x.subject }));
}

export async function listTeachers(pool: Pool): Promise<TeacherDto[]> {
  const t = await pool.query<{ id: string; telegram_id: number; display_name: string | null; subject: string | null; is_active: boolean }>(
    `SELECT id, telegram_id, display_name, subject, is_active FROM admins WHERE role = 'teacher' ORDER BY display_name NULLS LAST, created_at`);
  const out: TeacherDto[] = [];
  for (const x of t.rows) out.push({ id: x.id, telegramId: x.telegram_id, displayName: x.display_name, subject: x.subject, isActive: x.is_active, assignments: await listAssignments(pool, x.id) });
  return out;
}

export async function createTeacher(pool: Pool, actor: Actor, b: { telegramId: number; displayName: string; subject?: string | null }): Promise<string> {
  try {
    return await withTx(pool, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO admins (telegram_id, display_name, role, subject) VALUES ($1,$2,'teacher',$3) RETURNING id`, [b.telegramId, b.displayName, b.subject ?? null]);
      const id = (r.rows[0] as { id: string }).id;
      await writeAudit(tx, actor, { action: 'teacher.create', entityType: 'admin', entityId: id, after: { telegramId: b.telegramId, displayName: b.displayName } });
      return id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('Bu Telegram ID allaqachon tizimda bor');
    throw e;
  }
}

export async function updateTeacher(pool: Pool, actor: Actor, id: string, b: { displayName?: string; subject?: string | null; isActive?: boolean }): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query(
      `UPDATE admins SET display_name = COALESCE($2, display_name), subject = CASE WHEN $3::boolean THEN $4 ELSE subject END, is_active = COALESCE($5, is_active), updated_at = now()
        WHERE id = $1 AND role = 'teacher' RETURNING id`, [id, b.displayName ?? null, b.subject !== undefined, b.subject ?? null, b.isActive ?? null]);
    if (!r.rows[0]) throw notFound('O\'qituvchi topilmadi');
    if (b.isActive === false) await tx.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'teacher_deactivated' WHERE admin_id = $1 AND revoked_at IS NULL`, [id]);
    await writeAudit(tx, actor, { action: 'teacher.update', entityType: 'admin', entityId: id, after: b });
  });
}

export async function addAssignment(pool: Pool, actor: Actor, teacherId: string, b: { classId: string; kind: 'homeroom' | 'subject'; subject?: string | null }): Promise<void> {
  if (b.kind === 'subject' && !b.subject?.trim()) throw badRequest('Fan nomini kiriting');
  try {
    await withTx(pool, async (tx) => {
      const t = await tx.query(`SELECT 1 FROM admins WHERE id = $1 AND role = 'teacher'`, [teacherId]);
      if (!t.rows[0]) throw notFound('O\'qituvchi topilmadi');
      await tx.query(`INSERT INTO teacher_assignments (admin_id, class_id, kind, subject) VALUES ($1,$2,$3,$4)`, [teacherId, b.classId, b.kind, b.kind === 'subject' ? b.subject!.trim() : null]);
      await writeAudit(tx, actor, { action: 'teacher.assign', entityType: 'admin', entityId: teacherId, after: b });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(b.kind === 'homeroom' ? 'Bu sinfning rahbari allaqachon tayinlangan' : 'Bu fan shu sinfga allaqachon biriktirilgan');
    throw e;
  }
}

export async function removeAssignment(pool: Pool, actor: Actor, assignmentId: string): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query<{ admin_id: string }>(`DELETE FROM teacher_assignments WHERE id = $1 RETURNING admin_id`, [assignmentId]);
    if (!r.rows[0]) throw notFound('Biriktirish topilmadi');
    await writeAudit(tx, actor, { action: 'teacher.unassign', entityType: 'admin', entityId: r.rows[0].admin_id });
  });
}

/* ───────── Ruxsat tekshiruvi ───────── */

export type Need = { type: 'view' } | { type: 'attendance' } | { type: 'grade'; subject: string };

/** Administrator hamma narsaga ega. O'qituvchi faqat o'z sinflarida: ko'rish — har qanday biriktirish; davomat — sinf rahbari; baho — shu fan o'qituvchisi. */
export async function assertClassAccess(db: Db, ctx: AdminContext, classId: string, need: Need): Promise<void> {
  if (ctx.me.role === 'admin') return;
  const rows = await listAssignments(db, ctx.actor.adminId);
  const mine = rows.filter((x) => x.classId === classId);
  if (mine.length === 0) throw forbidden('Bu sinf sizga biriktirilmagan');
  if (need.type === 'view') return;
  if (need.type === 'attendance') {
    if (!mine.some((x) => x.kind === 'homeroom')) throw forbidden('Davomatni faqat sinf rahbari belgilaydi');
    return;
  }
  const subj = need.subject.trim().toLowerCase();
  if (!mine.some((x) => x.kind === 'subject' && (x.subject ?? '').toLowerCase() === subj)) throw forbidden(`Siz bu sinfda «${need.subject}» fanidan baho qo'ya olmaysiz`);
}

export async function assignedClassIds(db: Db, ctx: AdminContext): Promise<string[] | null> {
  if (ctx.me.role === 'admin') return null; // null = cheklov yo'q
  return [...new Set((await listAssignments(db, ctx.actor.adminId)).map((x) => x.classId))];
}

export async function classOfStudent(db: Db, studentId: string): Promise<string> {
  const r = await db.query<{ class_id: string }>(`SELECT class_id FROM students WHERE id = $1`, [studentId]);
  if (!r.rows[0]) throw notFound('O\'quvchi topilmadi');
  return r.rows[0].class_id;
}
