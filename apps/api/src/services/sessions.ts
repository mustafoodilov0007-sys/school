import type { Db } from '../db/pool';
import { randomToken, sha256Hex } from '../lib/crypto';

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** Sessiya tokeni: bazada faqat SHA-256 hash; ochiq token foydalanuvchida (cookie yoki xotirada) qoladi. */
export async function createSession(
  db: Db,
  p: { subject: 'student' | 'admin' | 'parent'; subjectId: string; ttlHours: number; deviceId?: string | null; userAgent?: string | null },
): Promise<CreatedSession> {
  const token = randomToken(32);
  const r = await db.query<{ expires_at: Date }>(
    `INSERT INTO sessions (subject_type, student_id, admin_id, parent_id, token_hash, device_id, user_agent, expires_at)
     VALUES ($1, $2, $3, $8, $4, $5, $6, now() + ($7::numeric * interval '1 hour'))
     RETURNING expires_at`,
    [
      p.subject,
      p.subject === 'student' ? p.subjectId : null,
      p.subject === 'admin' ? p.subjectId : null,
      sha256Hex(token),
      p.deviceId ?? null,
      p.userAgent?.slice(0, 300) ?? null,
      p.ttlHours,
      p.subject === 'parent' ? p.subjectId : null,
    ],
  );
  return { token, expiresAt: (r.rows[0] as { expires_at: Date }).expires_at };
}

export async function revokeByToken(db: Db, token: string, reason: string): Promise<void> {
  await db.query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2 WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256Hex(token), reason],
  );
}

export async function revokeStudentSessions(db: Db, studentId: string, reason: string): Promise<number> {
  const r = await db.query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2
      WHERE student_id = $1 AND revoked_at IS NULL`,
    [studentId, reason],
  );
  return r.rowCount ?? 0;
}

/** last_seen_at ni har so'rovda emas, kamida 60 soniyada bir marta yangilaydi. */
export async function touchSession(db: Db, sessionId: string, lastSeenAt: Date): Promise<void> {
  if (Date.now() - lastSeenAt.getTime() < 60_000) return;
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
}
