import { ErrorCode } from '@pep/shared';
import type { Config } from '../config';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { sha256Hex } from '../lib/crypto';
import { conflict, forbidden, notFound } from '../lib/errors';
import { verifyInitData } from '../lib/telegram-auth';
import { writeAudit } from './audit';
import { createSession, touchSession } from './sessions';

export interface ParentMe { id: string; firstName: string; lastName: string; children: { id: string; name: string; className: string }[] }
export interface ParentContext { parentId: string; sessionId: string; me: ParentMe }

type PRow = { id: string; first_name: string; last_name: string; is_active: boolean };

async function childrenOf(db: Db, parentId: string): Promise<ParentMe['children']> {
  const r = await db.query<{ id: string; name: string; class_name: string }>(
    `SELECT s.id, s.last_name || ' ' || s.first_name AS name, c.name AS class_name
       FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN classes c ON c.id = s.class_id
      WHERE ps.parent_id = $1 AND s.is_active ORDER BY s.last_name, s.first_name`, [parentId]);
  return r.rows.map((x) => ({ id: x.id, name: x.name, className: x.class_name }));
}
const toMe = async (db: Db, p: PRow): Promise<ParentMe> => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, children: await childrenOf(db, p.id) });

/** Telegram akkaunt ota-onaga bog'langan bo'lsa sessiya beradi; aks holda (yoki o'quvchi bo'lsa) null. */
export async function tryLoginParent(pool: Pool, cfg: Config, input: { initData: string; userAgent?: string | null }): Promise<{ token: string; expiresAt: Date; parent: ParentMe } | null> {
  const v = verifyInitData(input.initData, cfg.botToken, { maxAgeSeconds: cfg.initDataMaxAgeSeconds });
  const stu = await pool.query(`SELECT 1 FROM students WHERE telegram_id = $1`, [v.user.id]);
  if (stu.rows[0]) return null;
  const r = await pool.query<PRow>(`SELECT id, first_name, last_name, is_active FROM parents WHERE telegram_id = $1`, [v.user.id]);
  const p = r.rows[0];
  if (!p) return null;
  if (!p.is_active) throw forbidden('Hisobingiz faol emas. Maktabga murojaat qiling', ErrorCode.STUDENT_INACTIVE);
  const s = await createSession(pool, { subject: 'parent', subjectId: p.id, ttlHours: cfg.studentSessionTtlHours, userAgent: input.userAgent ?? null });
  return { token: s.token, expiresAt: s.expiresAt, parent: await toMe(pool, p) };
}

/** Ota-ona kodi bilan Telegram akkauntni bog'lash (kod bir martalik). */
export async function linkParent(pool: Pool, cfg: Config, input: { initData: string; code: string; userAgent?: string | null }): Promise<{ token: string; expiresAt: Date; parent: ParentMe }> {
  const v = verifyInitData(input.initData, cfg.botToken, { maxAgeSeconds: cfg.initDataMaxAgeSeconds });
  const code = input.code.trim().toUpperCase();
  return withTx(pool, async (tx) => {
    const stu = await tx.query(`SELECT 1 FROM students WHERE telegram_id = $1`, [v.user.id]);
    if (stu.rows[0]) throw conflict('Bu Telegram akkaunt o\'quvchiga bog\'langan');
    const taken = await tx.query(`SELECT 1 FROM parents WHERE telegram_id = $1`, [v.user.id]);
    if (taken.rows[0]) throw conflict('Bu Telegram akkaunt allaqachon ota-onaga bog\'langan');
    const u = await tx.query<PRow>(
      `UPDATE parents SET telegram_id = $2, telegram_linked_at = now() WHERE link_code = $1 AND telegram_id IS NULL AND is_active RETURNING id, first_name, last_name, is_active`, [code, v.user.id]);
    const p = u.rows[0];
    if (!p) throw notFound('Kod noto\'g\'ri yoki allaqachon ishlatilgan. Maktabdan yangi kod so\'rang');
    await writeAudit(tx, { type: 'student', telegramId: v.user.id }, { action: 'parent.linked', entityType: 'parent', entityId: p.id });
    const s = await createSession(tx, { subject: 'parent', subjectId: p.id, ttlHours: cfg.studentSessionTtlHours, userAgent: input.userAgent ?? null });
    return { token: s.token, expiresAt: s.expiresAt, parent: await toMe(tx, p) };
  });
}

export async function authenticateParent(db: Db, token: string): Promise<ParentContext | null> {
  const r = await db.query<PRow & { session_id: string; last_seen_at: Date }>(
    `SELECT se.id AS session_id, se.last_seen_at, p.id, p.first_name, p.last_name, p.is_active
       FROM sessions se JOIN parents p ON p.id = se.parent_id
      WHERE se.token_hash = $1 AND se.subject_type = 'parent' AND se.revoked_at IS NULL AND se.expires_at > now()`, [sha256Hex(token)]);
  const row = r.rows[0];
  if (!row || !row.is_active) return null;
  await touchSession(db, row.session_id, row.last_seen_at);
  return { parentId: row.id, sessionId: row.session_id, me: await toMe(db, row) };
}

export async function assertParentOf(db: Db, parentId: string, studentId: string): Promise<void> {
  const r = await db.query(`SELECT 1 FROM parent_students ps JOIN students s ON s.id = ps.student_id WHERE ps.parent_id = $1 AND ps.student_id = $2 AND s.is_active`, [parentId, studentId]);
  if (!r.rows[0]) throw forbidden('Bu bola sizga biriktirilmagan');
}
