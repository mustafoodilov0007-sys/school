import { evaluateLockout, DEFAULT_LOCKOUT, isValidStudentCodeFormat, normalizeStudentCodeInput, maskStudentCode } from '@pep/shared';
import type { AttemptRecord } from '@pep/shared';
import type { Config } from '../config';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { hmacSha256Hex, randomToken, sha256Hex } from '../lib/crypto';
import { isUniqueViolation } from '../lib/errors';
import { writeAudit } from './audit';

const CONFIRM_TTL_MINUTES = 10;

export interface StudentBrief {
  firstName: string;
  lastName: string;
  className: string;
}

export type LookupResult =
  | { status: 'already_linked'; student: StudentBrief }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'invalid'; attemptsLeft: number }
  | { status: 'found'; student: StudentBrief; confirmToken: string };

export type ConfirmResult =
  | { status: 'linked'; student: StudentBrief; alreadyLinked: boolean }
  | { status: 'expired' }
  | { status: 'telegram_taken' };

/** Bir Telegram akkaunt uchun amallarni ketma-ketlashtiradi (poyga va takroriy callback'lardan himoya). */
async function lockTelegram(tx: Db, telegramId: number): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(727002, ($1::bigint % 2147483647)::int)', [telegramId]);
}

type BriefRow = { first_name: string; last_name: string; class_name: string };
const brief = (r: BriefRow): StudentBrief => ({ firstName: r.first_name, lastName: r.last_name, className: r.class_name });

async function linkedStudent(tx: Db, telegramId: number): Promise<BriefRow | undefined> {
  const r = await tx.query<BriefRow>(
    `SELECT s.first_name, s.last_name, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id WHERE s.telegram_id = $1`,
    [telegramId],
  );
  return r.rows[0];
}

/**
 * 1-qadam: sinf + ID tekshiruvi. Xato urinishlar login_attempts'ga yoziladi; ketma-ket 5 ta xato -> 10 daqiqa blok.
 * Blok bot xotirasiga emas, bazaga asoslangan — bot qayta ishga tushsa ham, boshqa xabar yuborsa ham saqlanadi.
 */
export async function lookupRegistration(
  pool: Pool,
  cfg: Config,
  input: { telegramId: number; classId: string; code: string },
): Promise<LookupResult> {
  return withTx(pool, async (tx) => {
    await lockTelegram(tx, input.telegramId);

    const already = await linkedStudent(tx, input.telegramId);
    if (already) return { status: 'already_linked' as const, student: brief(already) };

    const nowRow = await tx.query<{ now: Date }>('SELECT now() AS now');
    const now = (nowRow.rows[0] as { now: Date }).now;

    const past = await tx.query<{ created_at: Date; success: boolean }>(
      `SELECT created_at, success FROM login_attempts
        WHERE telegram_id = $1 AND kind = 'registration' AND created_at > now() - interval '1 day'
        ORDER BY created_at DESC LIMIT 200`,
      [input.telegramId],
    );
    const attempts: AttemptRecord[] = past.rows.map((x) => ({ at: x.created_at, success: x.success })).reverse();

    const before = evaluateLockout(attempts, now, DEFAULT_LOCKOUT);
    if (before.locked) return { status: 'locked' as const, retryAfterSeconds: before.retryAfterSeconds };

    const code = normalizeStudentCodeInput(input.code);
    const codeHash = hmacSha256Hex(cfg.internalApiKey, `code:${code}`);

    let found: (BriefRow & { id: string }) | undefined;
    if (isValidStudentCodeFormat(code)) {
      const r = await tx.query<BriefRow & { id: string }>(
        `SELECT s.id, s.first_name, s.last_name, c.name AS class_name
           FROM students s JOIN classes c ON c.id = s.class_id
          WHERE s.code = $1 AND s.class_id = $2 AND s.is_active AND s.telegram_id IS NULL AND NOT c.is_archived`,
        [code, input.classId],
      );
      found = r.rows[0];
    }

    if (!found) {
      // "topilmadi", "band" va "faol emas" holatlari bir xil javob beradi — ID ni taxmin qilish orqali ma'lumot sizmaydi
      await tx.query(
        `INSERT INTO login_attempts (telegram_id, kind, success, code_hash) VALUES ($1, 'registration', false, $2)`,
        [input.telegramId, codeHash],
      );
      const after = evaluateLockout([...attempts, { at: now, success: false }], now, DEFAULT_LOCKOUT);
      if (after.locked) {
        await writeAudit(tx, { type: 'system' }, {
          action: 'registration.locked',
          entityType: 'telegram',
          entityId: String(input.telegramId),
          after: { retryAfterSeconds: after.retryAfterSeconds, lastCode: maskStudentCode(code) },
        });
        return { status: 'locked' as const, retryAfterSeconds: after.retryAfterSeconds };
      }
      return { status: 'invalid' as const, attemptsLeft: after.attemptsLeft };
    }

    await tx.query(
      `INSERT INTO login_attempts (telegram_id, kind, success, code_hash) VALUES ($1, 'registration', true, $2)`,
      [input.telegramId, codeHash],
    );
    // Eski tasdiqlash so'rovlarini bekor qilamiz — bitta faol so'rov
    await tx.query(
      `UPDATE registration_confirmations SET consumed_at = now()
        WHERE telegram_id = $1 AND consumed_at IS NULL`,
      [input.telegramId],
    );
    const token = randomToken(24);
    await tx.query(
      `INSERT INTO registration_confirmations (telegram_id, student_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 minute'))`,
      [input.telegramId, found.id, sha256Hex(token), CONFIRM_TTL_MINUTES],
    );
    return { status: 'found' as const, student: brief(found), confirmToken: token };
  });
}

/**
 * 2-qadam: tasdiqlash. Idempotent: takroriy callback ikkinchi marta bog'lamaydi, xato ham bermaydi.
 * Bog'lash bitta atomik UPDATE (… WHERE telegram_id IS NULL); DB UNIQUE(telegram_id) oxirgi himoya.
 */
export async function confirmRegistration(
  pool: Pool,
  input: { telegramId: number; username?: string | null | undefined; token: string },
): Promise<ConfirmResult> {
  try {
    return await withTx(pool, async (tx) => {
      await lockTelegram(tx, input.telegramId);

      const c = await tx.query<{ id: string; student_id: string; consumed_at: Date | null; expired: boolean }>(
        `SELECT id, student_id, consumed_at, (expires_at <= now()) AS expired
           FROM registration_confirmations WHERE token_hash = $1 AND telegram_id = $2 FOR UPDATE`,
        [sha256Hex(input.token), input.telegramId],
      );
      const conf = c.rows[0];
      if (!conf) return { status: 'expired' as const };

      if (conf.consumed_at) {
        // Takroriy callback: agar shu akkaunt aynan shu o'quvchiga bog'langan bo'lsa — muvaffaqiyat
        const linked = await tx.query<BriefRow & { id: string }>(
          `SELECT s.id, s.first_name, s.last_name, c.name AS class_name
             FROM students s JOIN classes c ON c.id = s.class_id WHERE s.telegram_id = $1`,
          [input.telegramId],
        );
        const row = linked.rows[0];
        return row && row.id === conf.student_id
          ? { status: 'linked' as const, student: brief(row), alreadyLinked: true }
          : { status: 'expired' as const };
      }
      if (conf.expired) return { status: 'expired' as const };

      if (await linkedStudent(tx, input.telegramId)) return { status: 'telegram_taken' as const };

      const upd = await tx.query(
        `UPDATE students SET telegram_id = $1, telegram_username = $2, telegram_linked_at = now()
          WHERE id = $3 AND telegram_id IS NULL AND is_active`,
        [input.telegramId, input.username ?? null, conf.student_id],
      );
      if ((upd.rowCount ?? 0) !== 1) return { status: 'expired' as const }; // shu orada band bo'lgan yoki faolsizlantirilgan

      await tx.query('UPDATE registration_confirmations SET consumed_at = now() WHERE id = $1', [conf.id]);
      await tx.query('DELETE FROM bot_states WHERE telegram_id = $1', [input.telegramId]);
      await writeAudit(tx, { type: 'student', telegramId: input.telegramId }, {
        action: 'student.telegram_link',
        entityType: 'student',
        entityId: conf.student_id,
        after: { telegramId: input.telegramId, username: input.username ?? null },
      });
      const row = await linkedStudent(tx, input.telegramId);
      return { status: 'linked' as const, student: brief(row as BriefRow), alreadyLinked: false };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { status: 'telegram_taken' }; // poyga: boshqa so'rov oldinroq bog'lab ulgurgan
    throw e;
  }
}

export interface StudentProfile extends StudentBrief {
  id: string;
  code: string;
  isActive: boolean;
}

export async function getStudentByTelegram(db: Db, telegramId: number): Promise<StudentProfile | null> {
  const r = await db.query<BriefRow & { id: string; code: string; is_active: boolean }>(
    `SELECT s.id, s.first_name, s.last_name, s.code, s.is_active, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id WHERE s.telegram_id = $1`,
    [telegramId],
  );
  const row = r.rows[0];
  return row ? { id: row.id, ...brief(row), code: row.code, isActive: row.is_active } : null;
}
