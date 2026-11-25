import type { ClassDto } from '@pep/shared';
import { normalizeClassLabel } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { conflict, isUniqueViolation, notFound, badRequest } from '../lib/errors';
import type { Actor } from './audit';
import { writeAudit } from './audit';

type ClassRow = {
  id: string;
  name: string;
  code_label: string;
  is_archived: boolean;
  created_at: Date;
  student_count: number;
};

const toDto = (r: ClassRow): ClassDto => ({
  id: r.id,
  name: r.name,
  codeLabel: r.code_label,
  isArchived: r.is_archived,
  studentCount: r.student_count,
  createdAt: r.created_at.toISOString(),
});

const SELECT = `
  SELECT c.id, c.name, c.code_label, c.is_archived, c.created_at,
         (SELECT count(*) FROM students s WHERE s.class_id = c.id AND s.is_active)::int AS student_count
    FROM classes c`;

export async function listClasses(db: Db, includeArchived = false): Promise<ClassDto[]> {
  const r = await db.query<ClassRow>(
    `${SELECT} WHERE ($1::boolean OR NOT c.is_archived)
      ORDER BY c.is_archived, NULLIF(regexp_replace(c.code_label, '\\D', '', 'g'), '')::int NULLS LAST, c.code_label`,
    [includeArchived],
  );
  return r.rows.map(toDto);
}

async function getClass(db: Db, id: string, lock = false): Promise<ClassRow> {
  const r = await db.query<ClassRow>(`${SELECT} WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`, [id]);
  const row = r.rows[0];
  if (!row) throw notFound('Sinf topilmadi');
  return row;
}

function mapUnique(e: unknown): never {
  if (isUniqueViolation(e, 'classes_code_label_key')) {
    throw conflict('Bu sinf belgisi band (masalan, "8-A" va "8A" bir xil hisoblanadi)');
  }
  if (isUniqueViolation(e, 'classes_name_active_uq')) throw conflict('Bunday nomli faol sinf allaqachon bor');
  throw e;
}

export async function createClass(pool: Pool, actor: Actor, name: string): Promise<ClassDto> {
  const label = normalizeClassLabel(name);
  if (!label) throw badRequest('Sinf nomi yaroqsiz');
  try {
    return await withTx(pool, async (tx) => {
      const r = await tx.query<{ id: string }>(
        'INSERT INTO classes (name, code_label) VALUES ($1, $2) RETURNING id',
        [name.trim(), label],
      );
      const id = (r.rows[0] as { id: string }).id;
      await writeAudit(tx, actor, { action: 'class.create', entityType: 'class', entityId: id, after: { name: name.trim(), codeLabel: label } });
      return toDto(await getClass(tx, id));
    });
  } catch (e) {
    return mapUnique(e);
  }
}

export async function updateClass(
  pool: Pool,
  actor: Actor,
  id: string,
  patch: { name?: string | undefined; isArchived?: boolean | undefined },
): Promise<ClassDto> {
  try {
    return await withTx(pool, async (tx) => {
      const before = await getClass(tx, id, true);
      let name = before.name;
      let label = before.code_label;
      if (patch.name !== undefined && patch.name.trim() !== before.name) {
        const newLabel = normalizeClassLabel(patch.name);
        if (!newLabel) throw badRequest('Sinf nomi yaroqsiz');
        if (newLabel !== before.code_label) {
          const cnt = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM students WHERE class_id = $1', [id]);
          if ((cnt.rows[0]?.n ?? 0) > 0) {
            throw conflict(
              `Sinfda o'quvchilar bor: ID larda ishlatilgan belgi (${before.code_label}) o'zgarmasligi kerak. Faqat yozilishini o'zgartirish mumkin (masalan, "8-A" ↔ "8 A").`,
            );
          }
          label = newLabel;
        }
        name = patch.name.trim();
      }
      const isArchived = patch.isArchived ?? before.is_archived;
      await tx.query('UPDATE classes SET name = $2, code_label = $3, is_archived = $4 WHERE id = $1', [id, name, label, isArchived]);
      await writeAudit(tx, actor, {
        action: patch.isArchived !== undefined && patch.isArchived !== before.is_archived
          ? (isArchived ? 'class.archive' : 'class.unarchive')
          : 'class.update',
        entityType: 'class',
        entityId: id,
        before: { name: before.name, codeLabel: before.code_label, isArchived: before.is_archived },
        after: { name, codeLabel: label, isArchived },
      });
      return toDto(await getClass(tx, id));
    });
  } catch (e) {
    return mapUnique(e);
  }
}

/** Bot ro'yxatdan o'tish uchun: faqat arxivlanmagan sinflar. */
export async function listActiveClassesForBot(db: Db): Promise<{ id: string; name: string }[]> {
  return (await listClasses(db, false)).map((c) => ({ id: c.id, name: c.name }));
}
