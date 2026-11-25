/** Ota-onalar: administrator yaratadi, bolalarini biriktiradi va bir martalik kod beradi; ota-ona kodni Mini App'da kiritadi. */
import { randomInt } from 'node:crypto';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, conflict, isUniqueViolation, notFound } from '../lib/errors';
import { writeAudit } from './audit';
import type { Actor } from './audit';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newParentCode = () => 'OT-' + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export interface ParentDto {
  id: string; firstName: string; lastName: string; phone: string | null; isActive: boolean;
  linked: boolean; linkCode: string | null; children: { id: string; name: string; className: string }[];
}

type Row = { id: string; first_name: string; last_name: string; phone: string | null; is_active: boolean; telegram_id: number | null; link_code: string; children: ParentDto['children'] };

export async function listParents(pool: Pool, q?: string): Promise<ParentDto[]> {
  const r = await pool.query<Row>(
    `SELECT p.id, p.first_name, p.last_name, p.phone, p.is_active, p.telegram_id, p.link_code,
            coalesce((SELECT json_agg(json_build_object('id', s.id, 'name', s.last_name || ' ' || s.first_name, 'className', c.name) ORDER BY s.last_name)
                        FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN classes c ON c.id = s.class_id WHERE ps.parent_id = p.id), '[]'::json) AS children
       FROM parents p WHERE ($1::text IS NULL OR (p.first_name || ' ' || p.last_name) ILIKE '%' || $1 || '%')
      ORDER BY p.first_name, p.created_at LIMIT 300`, [q?.trim() || null]);
  return r.rows.map((x) => ({
    id: x.id, firstName: x.first_name, lastName: x.last_name, phone: x.phone, isActive: x.is_active,
    linked: x.telegram_id !== null, linkCode: x.telegram_id === null ? x.link_code : null, children: x.children,
  }));
}

async function setChildren(db: Db, parentId: string, studentIds: string[]): Promise<void> {
  const ids = [...new Set(studentIds)];
  if (ids.length > 10) throw badRequest('Bitta ota-onaga ko\'pi bilan 10 ta bola biriktiriladi');
  if (ids.length) {
    const ok = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM students WHERE id = ANY($1::uuid[])`, [ids]);
    if ((ok.rows[0] as { n: number }).n !== ids.length) throw badRequest('Ro\'yxatda mavjud bo\'lmagan o\'quvchi bor');
  }
  await db.query(`DELETE FROM parent_students WHERE parent_id = $1`, [parentId]);
  if (ids.length) await db.query(`INSERT INTO parent_students (parent_id, student_id) SELECT $1, unnest($2::uuid[])`, [parentId, ids]);
}

export async function createParent(pool: Pool, actor: Actor, b: { firstName: string; lastName?: string; phone?: string | null; studentIds: string[] }): Promise<{ id: string; linkCode: string }> {
  for (let i = 0; i < 5; i++) {
    const code = newParentCode();
    try {
      return await withTx(pool, async (tx) => {
        const r = await tx.query<{ id: string }>(`INSERT INTO parents (first_name, last_name, phone, link_code) VALUES ($1,$2,$3,$4) RETURNING id`, [b.firstName, b.lastName ?? '', b.phone ?? null, code]);
        const id = (r.rows[0] as { id: string }).id;
        await setChildren(tx, id, b.studentIds);
        await writeAudit(tx, actor, { action: 'parent.create', entityType: 'parent', entityId: id, after: { firstName: b.firstName, children: b.studentIds.length } });
        return { id, linkCode: code };
      });
    } catch (e) {
      if (isUniqueViolation(e, 'parents_link_code_key')) continue;
      throw e;
    }
  }
  throw conflict('Kod yaratib bo\'lmadi, qayta urinib ko\'ring');
}

export async function updateParent(pool: Pool, actor: Actor, id: string, b: { firstName?: string; lastName?: string; phone?: string | null; isActive?: boolean; studentIds?: string[] }): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query(
      `UPDATE parents SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), phone = CASE WHEN $4::boolean THEN $5 ELSE phone END, is_active = COALESCE($6, is_active)
        WHERE id = $1 RETURNING id`, [id, b.firstName ?? null, b.lastName ?? null, b.phone !== undefined, b.phone ?? null, b.isActive ?? null]);
    if (!r.rows[0]) throw notFound('Ota-ona topilmadi');
    if (b.studentIds) await setChildren(tx, id, b.studentIds);
    if (b.isActive === false) await tx.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'parent_deactivated' WHERE parent_id = $1 AND revoked_at IS NULL`, [id]);
    await writeAudit(tx, actor, { action: 'parent.update', entityType: 'parent', entityId: id, after: { ...b, studentIds: b.studentIds?.length } });
  });
}

/** Telegram bog'lanishini uzadi va yangi kod beradi (telefon almashganda). */
export async function resetParentLink(pool: Pool, actor: Actor, id: string): Promise<string> {
  const code = newParentCode();
  await withTx(pool, async (tx) => {
    const r = await tx.query(`UPDATE parents SET telegram_id = NULL, telegram_linked_at = NULL, link_code = $2 WHERE id = $1 RETURNING id`, [id, code]);
    if (!r.rows[0]) throw notFound('Ota-ona topilmadi');
    await tx.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'parent_relink' WHERE parent_id = $1 AND revoked_at IS NULL`, [id]);
    await writeAudit(tx, actor, { action: 'parent.reset_link', entityType: 'parent', entityId: id });
  });
  return code;
}
