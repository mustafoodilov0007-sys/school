import { randomInt } from 'node:crypto';
import type { BulkStudentsInput, StudentDto } from '@pep/shared';
import { generateStudentCode } from '@pep/shared';
import type { Config } from '../config';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { conflict, notFound } from '../lib/errors';
import { toCsv } from '../lib/csv';
import type { Actor } from './audit';
import { writeAudit } from './audit';
import { revokeStudentSessions } from './sessions';

type StudentRow = {
  id: string;
  class_id: string;
  class_name: string;
  first_name: string;
  last_name: string;
  code: string;
  telegram_id: number | null;
  telegram_username: string | null;
  telegram_linked_at: Date | null;
  is_active: boolean;
  created_at: Date;
};

const COLS = `s.id, s.class_id, c.name AS class_name, s.first_name, s.last_name, s.code, s.telegram_id,
  s.telegram_username, s.telegram_linked_at, s.is_active, s.created_at`;

export const toStudentDto = (r: StudentRow): StudentDto => ({
  id: r.id,
  classId: r.class_id,
  className: r.class_name,
  firstName: r.first_name,
  lastName: r.last_name,
  code: r.code,
  isLinked: r.telegram_id !== null,
  telegramUsername: r.telegram_username,
  telegramLinkedAt: r.telegram_linked_at?.toISOString() ?? null,
  isActive: r.is_active,
  createdAt: r.created_at.toISOString(),
});

export async function getStudent(db: Db, id: string, lock = false): Promise<StudentDto> {
  const r = await db.query<StudentRow>(
    `SELECT ${COLS} FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`,
    [id],
  );
  const row = r.rows[0];
  if (!row) throw notFound('O\'quvchi topilmadi');
  return toStudentDto(row);
}

export interface ListQuery {
  classId?: string | undefined;
  q?: string | undefined;
  linked?: boolean | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
}

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export async function listStudents(db: Db, q: ListQuery): Promise<{ items: StudentDto[]; total: number }> {
  const pattern = q.q ? likePattern(q.q) : null;
  const r = await db.query<StudentRow & { total: number }>(
    `SELECT ${COLS}, count(*) OVER()::int AS total
       FROM students s JOIN classes c ON c.id = s.class_id
      WHERE ($1::uuid IS NULL OR s.class_id = $1)
        AND ($2::text IS NULL OR (s.last_name || ' ' || s.first_name) ILIKE $2 OR (s.first_name || ' ' || s.last_name) ILIKE $2 OR s.code ILIKE $2)
        AND ($3::boolean IS NULL OR (s.telegram_id IS NOT NULL) = $3)
        AND ($4::boolean IS NULL OR s.is_active = $4)
      ORDER BY c.is_archived, c.code_label, s.last_name, s.first_name, s.id
      LIMIT $5 OFFSET $6`,
    [q.classId ?? null, pattern, q.linked ?? null, q.active ?? null, q.limit, q.offset],
  );
  return { items: r.rows.map(toStudentDto), total: r.rows[0]?.total ?? 0 };
}

/**
 * Noyob kod bilan o'quvchi qo'shadi. Tartib raqamiga tayanilmaydi: tasodifiy kod + DB UNIQUE;
 * to'qnashuvda (ON CONFLICT DO NOTHING) qayta uriniladi — tranzaksiya buzilmaydi.
 */
async function insertWithUniqueCode(
  tx: Db,
  cfg: Config,
  s: { classId: string; classLabel: string; firstName: string; lastName: string },
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const code = generateStudentCode({
      prefix: cfg.studentCodePrefix,
      classLabel: s.classLabel,
      suffixLength: cfg.studentCodeSuffixLength,
      randomInt: (max) => randomInt(max),
    });
    const r = await tx.query<{ id: string }>(
      `INSERT INTO students (class_id, first_name, last_name, code) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [s.classId, s.firstName, s.lastName, code],
    );
    if (r.rows[0]) return r.rows[0].id;
  }
  throw conflict('Noyob ID yaratib bo\'lmadi — bu sinfda ID lar deyarli to\'lgan. STUDENT_CODE_SUFFIX_LENGTH ni oshiring.');
}

async function activeClassOrThrow(tx: Db, classId: string): Promise<{ label: string; name: string }> {
  const r = await tx.query<{ code_label: string; name: string; is_archived: boolean }>(
    'SELECT code_label, name, is_archived FROM classes WHERE id = $1 FOR SHARE',
    [classId],
  );
  const c = r.rows[0];
  if (!c) throw notFound('Sinf topilmadi');
  if (c.is_archived) throw conflict('Arxivlangan sinfga o\'quvchi qo\'shib bo\'lmaydi');
  return { label: c.code_label, name: c.name };
}

export async function createStudent(
  pool: Pool,
  cfg: Config,
  actor: Actor,
  input: { classId: string; firstName: string; lastName: string },
): Promise<StudentDto> {
  return withTx(pool, async (tx) => {
    const cls = await activeClassOrThrow(tx, input.classId);
    const id = await insertWithUniqueCode(tx, cfg, { ...input, classLabel: cls.label });
    const dto = await getStudent(tx, id);
    await writeAudit(tx, actor, {
      action: 'student.create',
      entityType: 'student',
      entityId: id,
      after: { firstName: dto.firstName, lastName: dto.lastName, class: cls.name },
    });
    return dto;
  });
}

export interface BulkPreviewRow {
  index: number;
  firstName: string;
  lastName: string;
  warnings: string[];
}

export type BulkResult =
  | { dryRun: true; rows: BulkPreviewRow[]; className: string }
  | { dryRun: false; created: StudentDto[] };

const nameKey = (f: string, l: string) => `${l.toLocaleLowerCase('uz')}|${f.toLocaleLowerCase('uz')}`;

export async function bulkCreateStudents(pool: Pool, cfg: Config, actor: Actor, input: BulkStudentsInput): Promise<BulkResult> {
  return withTx(pool, async (tx) => {
    const cls = await activeClassOrThrow(tx, input.classId);
    const existing = await tx.query<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM students WHERE class_id = $1',
      [input.classId],
    );
    const seen = new Set(existing.rows.map((r) => nameKey(r.first_name, r.last_name)));

    const rows: BulkPreviewRow[] = input.students.map((s, i) => {
      const key = nameKey(s.firstName, s.lastName);
      const warnings: string[] = [];
      if (seen.has(key)) warnings.push('Bu sinfda bir xil ism-familiya allaqachon bor yoki ro\'yxatda takrorlangan');
      seen.add(key);
      return { index: i + 1, firstName: s.firstName, lastName: s.lastName, warnings };
    });

    if (input.dryRun) return { dryRun: true as const, rows, className: cls.name };

    const created: StudentDto[] = [];
    for (const s of input.students) {
      const id = await insertWithUniqueCode(tx, cfg, { classId: input.classId, classLabel: cls.label, ...s });
      created.push(await getStudent(tx, id));
    }
    await writeAudit(tx, actor, {
      action: 'student.bulk_create',
      entityType: 'class',
      entityId: input.classId,
      after: { count: created.length, class: cls.name },
    });
    return { dryRun: false as const, created };
  });
}

export async function updateStudent(
  pool: Pool,
  actor: Actor,
  id: string,
  patch: { firstName?: string | undefined; lastName?: string | undefined },
): Promise<StudentDto> {
  return withTx(pool, async (tx) => {
    const before = await getStudent(tx, id, true);
    const firstName = patch.firstName ?? before.firstName;
    const lastName = patch.lastName ?? before.lastName;
    await tx.query('UPDATE students SET first_name = $2, last_name = $3 WHERE id = $1', [id, firstName, lastName]);
    await writeAudit(tx, actor, {
      action: 'student.update',
      entityType: 'student',
      entityId: id,
      before: { firstName: before.firstName, lastName: before.lastName },
      after: { firstName, lastName },
    });
    return getStudent(tx, id);
  });
}

export async function setStudentActive(
  pool: Pool,
  actor: Actor,
  id: string,
  active: boolean,
  reason?: string,
): Promise<StudentDto> {
  return withTx(pool, async (tx) => {
    const before = await getStudent(tx, id, true);
    if (before.isActive === active) return before;
    await tx.query('UPDATE students SET is_active = $2 WHERE id = $1', [id, active]);
    let revoked = 0;
    if (!active) revoked = await revokeStudentSessions(tx, id, 'student_deactivated');
    await writeAudit(tx, actor, {
      action: active ? 'student.activate' : 'student.deactivate',
      entityType: 'student',
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: active, sessionsRevoked: revoked },
      reason: reason ?? null,
    });
    return getStudent(tx, id);
  });
}

/** Telegram bog'lanishini uzish — faqat admin. Sabab majburiy; sessiyalar bekor qilinadi. */
export async function unlinkTelegram(pool: Pool, actor: Actor, id: string, reason: string): Promise<StudentDto> {
  return withTx(pool, async (tx) => {
    const before = await getStudent(tx, id, true);
    const tg = await tx.query<{ telegram_id: number | null }>('SELECT telegram_id FROM students WHERE id = $1', [id]);
    const telegramId = tg.rows[0]?.telegram_id ?? null;
    if (telegramId === null) throw conflict('Bu o\'quvchi Telegram ga bog\'lanmagan');
    await tx.query(
      'UPDATE students SET telegram_id = NULL, telegram_username = NULL, telegram_linked_at = NULL WHERE id = $1',
      [id],
    );
    const revoked = await revokeStudentSessions(tx, id, 'telegram_unlinked');
    await tx.query('DELETE FROM bot_states WHERE telegram_id = $1', [telegramId]);
    await writeAudit(tx, actor, {
      action: 'student.telegram_unlink',
      entityType: 'student',
      entityId: id,
      before: { telegramId, telegramUsername: before.telegramUsername },
      after: { sessionsRevoked: revoked },
      reason,
    });
    return getStudent(tx, id);
  });
}

/** ID sizib chiqqan bo'lsa: yangi kod beradi (eskisi darhol yaroqsiz). */
export async function regenerateStudentCode(
  pool: Pool,
  cfg: Config,
  actor: Actor,
  id: string,
  reason: string,
): Promise<StudentDto> {
  return withTx(pool, async (tx) => {
    const before = await getStudent(tx, id, true);
    const cls = await tx.query<{ code_label: string }>('SELECT code_label FROM classes WHERE id = $1', [before.classId]);
    const classLabel = cls.rows[0]?.code_label;
    if (!classLabel) throw notFound('Sinf topilmadi');
    for (let i = 0; i < 40; i++) {
      const code = generateStudentCode({
        prefix: cfg.studentCodePrefix,
        classLabel,
        suffixLength: cfg.studentCodeSuffixLength,
        randomInt: (max) => randomInt(max),
      });
      const r = await tx.query('UPDATE students SET code = $2 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM students WHERE code = $2)', [id, code]);
      if ((r.rowCount ?? 0) === 1) {
        await writeAudit(tx, actor, {
          action: 'student.regenerate_code',
          entityType: 'student',
          entityId: id,
          before: { code: before.code },
          after: { code },
          reason,
        });
        return getStudent(tx, id);
      }
    }
    throw conflict('Yangi noyob ID yaratib bo\'lmadi');
  });
}

export async function exportStudentCodesCsv(pool: Pool, actor: Actor, classId?: string): Promise<string> {
  if (classId) {
    const c = await pool.query('SELECT 1 FROM classes WHERE id = $1', [classId]);
    if (c.rowCount === 0) throw notFound('Sinf topilmadi');
  }
  const all: StudentDto[] = [];
  for (let offset = 0; ; offset += 200) {
    const { items } = await listStudents(pool, { classId, active: true, limit: 200, offset });
    all.push(...items);
    if (items.length < 200) break;
  }
  await writeAudit(pool, actor, { action: 'student.export_codes', entityType: 'class', entityId: classId ?? null, after: { count: all.length } });
  return toCsv(
    ['Sinf', 'Familiya', 'Ism', 'ID', 'Telegram'],
    all.map((s) => [s.className, s.lastName, s.firstName, s.code, s.isLinked ? 'bog\'langan' : 'bog\'lanmagan']),
  );
}
