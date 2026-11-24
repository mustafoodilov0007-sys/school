import { ErrorCode } from '@pep/shared';
import type { StudentMeDto } from '@pep/shared';
import type { Config } from '../config';
import type { Db, Pool } from '../db/pool';
import { sha256Hex } from '../lib/crypto';
import { conflict, forbidden } from '../lib/errors';
import { writeAudit } from './audit';
import { verifyInitData } from '../lib/telegram-auth';
import { createSession, touchSession } from './sessions';

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
  telegram_id: number | null;
  telegram_linked_at: Date | null;
  is_active: boolean;
  class_name: string;
};

const toMe = (r: Row): StudentMeDto => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  className: r.class_name,
  code: r.code,
  telegramLinkedAt: r.telegram_linked_at?.toISOString() ?? null,
});

function assertUsable(r: Row | undefined): asserts r is Row {
  if (!r || r.telegram_id === null) {
    throw forbidden('Telegram akkauntingiz hali o\'quvchi ID ga bog\'lanmagan. Botda /start ni yuboring', ErrorCode.NOT_LINKED);
  }
  if (!r.is_active) throw forbidden('Hisobingiz faol emas. O\'qituvchiga murojaat qiling', ErrorCode.STUDENT_INACTIVE);
}

/** Mini App kirishi: initData serverda tekshiriladi (yoki lokal DEV rejim) -> sessiya tokeni. */
export async function loginStudent(
  pool: Pool,
  cfg: Config,
  input: { initData?: string; dev?: boolean; deviceId?: string | undefined; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; student: StudentMeDto }> {
  let telegramId: number;
  if (input.dev) {
    if (!cfg.allowDevAuth || cfg.isProd || cfg.devStudentTelegramId === null) throw forbidden();
    telegramId = cfg.devStudentTelegramId;
  } else {
    const v = verifyInitData(input.initData ?? '', cfg.botToken, { maxAgeSeconds: cfg.initDataMaxAgeSeconds });
    telegramId = v.user.id;
  }
  const r = await pool.query<Row>(
    `SELECT s.id, s.first_name, s.last_name, s.code, s.telegram_id, s.telegram_linked_at, s.is_active, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id WHERE s.telegram_id = $1`,
    [telegramId],
  );
  const row = r.rows[0];
  assertUsable(row);
  await enforceSingleDevice(pool, row.id, telegramId, input.deviceId ?? null);
  const s = await createSession(pool, {
    subject: 'student',
    subjectId: row.id,
    ttlHours: cfg.studentSessionTtlHours,
    deviceId: input.deviceId ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { token: s.token, expiresAt: s.expiresAt, student: toMe(row) };
}

export interface StudentContext {
  studentId: string;
  sessionId: string;
  me: StudentMeDto;
}

/** Har so'rovda o'quvchi holati qayta tekshiriladi: faolsizlantirilsa yoki bog'lanish uzilsa darhol kirish yopiladi. */
export async function authenticateStudent(db: Db, token: string): Promise<StudentContext | null> {
  const r = await db.query<Row & { session_id: string; last_seen_at: Date }>(
    `SELECT se.id AS session_id, se.last_seen_at, s.id, s.first_name, s.last_name, s.code, s.telegram_id,
            s.telegram_linked_at, s.is_active, c.name AS class_name
       FROM sessions se JOIN students s ON s.id = se.student_id JOIN classes c ON c.id = s.class_id
      WHERE se.token_hash = $1 AND se.subject_type = 'student' AND se.revoked_at IS NULL AND se.expires_at > now()`,
    [sha256Hex(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  assertUsable(row);
  await touchSession(db, row.session_id, row.last_seen_at);
  return { studentId: row.id, sessionId: row.session_id, me: toMe(row) };
}

/** Faol imtihon bor bo'lsa, boshqa qurilmadan kirish siyosati (server tomonda). */
const DEVICE_BUSY_SECONDS = 90;
export async function enforceSingleDevice(pool: Pool, studentId: string, telegramId: number, deviceId: string | null): Promise<void> {
  const att = await pool.query<{ id: string; busy: boolean }>(
    `SELECT a.id, (coalesce(a.last_heartbeat_at, a.last_sync_at, a.started_at) > now() - make_interval(secs => $2)) AS busy
       FROM attempts a WHERE a.student_id = $1 AND a.status = 'in_progress' LIMIT 1`,
    [studentId, DEVICE_BUSY_SECONDS],
  );
  const a = att.rows[0];
  if (!a) return;
  const others = await pool.query<{ id: string }>(
    `SELECT id FROM sessions WHERE student_id = $1 AND subject_type = 'student' AND revoked_at IS NULL AND expires_at > now()
        AND device_id IS DISTINCT FROM $2`,
    [studentId, deviceId],
  );
  if (others.rows.length === 0) return;
  if (a.busy) {
    await writeAudit(pool, { type: 'student', telegramId }, { action: 'student.second_device_denied', entityType: 'attempt', entityId: a.id });
    throw conflict('Imtihon boshqa qurilmada ochiq. O\'sha qurilmani yoping va ' + DEVICE_BUSY_SECONDS + ' soniyadan keyin qayta urinib ko\'ring.');
  }
  // Eski qurilma jim (heartbeat yo'q) — sessiyasi bekor qilinadi, urinish yangi qurilmada davom etadi
  await pool.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'second_device_takeover' WHERE id = ANY($1::uuid[])`, [others.rows.map((x) => x.id)]);
  await writeAudit(pool, { type: 'student', telegramId }, { action: 'student.device_takeover', entityType: 'attempt', entityId: a.id, after: { revoked: others.rows.length } });
}
