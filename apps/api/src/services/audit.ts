import type { AuditLogDto } from '@pep/shared';
import type { Db } from '../db/pool';

export type Actor =
  | { type: 'admin'; adminId: string; telegramId: number }
  | { type: 'student'; telegramId: number }
  | { type: 'system' };

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Audit yozuvi. Imkon bo'lsa asosiy amal bilan BIR tranzaksiyada chaqiriladi. */
export async function writeAudit(db: Db, actor: Actor, e: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (actor_type, actor_admin_id, actor_telegram_id, action, entity_type, entity_id, before_data, after_data, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
    [
      actor.type,
      actor.type === 'admin' ? actor.adminId : null,
      actor.type === 'system' ? null : actor.telegramId,
      e.action,
      e.entityType,
      e.entityId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null,
    ],
  );
}

type AuditRow = {
  id: string;
  actor_type: 'admin' | 'student' | 'system';
  actor_telegram_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: Date;
};

export async function listAudit(db: Db, limit = 50, offset = 0): Promise<AuditLogDto[]> {
  const r = await db.query<AuditRow>(
    `SELECT id, actor_type, actor_telegram_id, action, entity_type, entity_id, reason, created_at
       FROM audit_logs ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(limit, 1), 200), Math.max(offset, 0)],
  );
  return r.rows.map((x) => ({
    id: x.id,
    actorType: x.actor_type,
    actorTelegramId: x.actor_telegram_id,
    action: x.action,
    entityType: x.entity_type,
    entityId: x.entity_id,
    reason: x.reason,
    createdAt: x.created_at.toISOString(),
  }));
}
