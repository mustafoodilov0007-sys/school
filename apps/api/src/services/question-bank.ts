import { parseCsv, rowsToQuestions, validateQuestion } from '@pep/shared';
import type { QuestionInput } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, notFound } from '../lib/errors';
import type { Actor } from './audit';
import { writeAudit } from './audit';

export interface QuestionDto extends QuestionInput {
  id: string;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
}

async function writeOptions(tx: Db, questionId: string, options: QuestionInput['options']) {
  await tx.query('DELETE FROM question_options WHERE question_id = $1', [questionId]);
  for (let i = 0; i < options.length; i++) {
    const o = options[i] as QuestionInput['options'][number];
    await tx.query('INSERT INTO question_options (question_id, body, is_correct, position) VALUES ($1,$2,$3,$4)', [questionId, o.body, o.isCorrect, i]);
  }
}

function check(q: QuestionInput) {
  const errs = validateQuestion(q);
  if (errs.length) throw badRequest('Savol noto\'g\'ri', errs);
}

/** Tranzaksiya ichida savol qo'shadi (import ham shu funksiyadan foydalanadi). */
export async function insertQuestionTx(tx: Db, actor: Actor, q: QuestionInput, audit = true): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO questions (type, body, explanation, topic_id, class_id, week_label, difficulty, tags, points, param_spec, answer_spec, created_by, image_media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) RETURNING id`,
    [q.type, q.body, q.explanation ?? null, q.topicId ?? null, q.classId ?? null, q.weekLabel ?? null, q.difficulty, q.tags, q.points,
      q.paramSpec ? JSON.stringify(q.paramSpec) : null, q.answerSpec ? JSON.stringify(q.answerSpec) : null,
      actor.type === 'admin' ? actor.adminId : null, q.imageMediaId ?? null],
  );
  const id = (r.rows[0] as { id: string }).id;
  await writeOptions(tx, id, q.options);
  if (audit) await writeAudit(tx, actor, { action: 'question.create', entityType: 'question', entityId: id, after: { type: q.type, topicId: q.topicId ?? null } });
  return id;
}

export async function createQuestion(pool: Pool, actor: Actor, q: QuestionInput): Promise<string> {
  check(q);
  return withTx(pool, (tx) => insertQuestionTx(tx, actor, q));
}

export interface ImportPreview {
  committed: boolean;
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
  sample: { row: number; type: string; body: string; topic: string | null }[];
  newTopics: string[];
}

/**
 * CSV import: avval `commit=false` (ko'rib chiqish), keyin `commit=true`. Bitta xato ham bo'lsa HECH NARSA yozilmaydi (hammasi yoki hech narsa).
 */
export async function importQuestions(pool: Pool, actor: Actor, csv: string, commit: boolean): Promise<ImportPreview> {
  const parsed = rowsToQuestions(parseCsv(csv));
  const total = parsed.items.length + parsed.errors.length;
  const preview: ImportPreview = {
    committed: false, total, valid: parsed.items.length, errors: parsed.errors,
    sample: parsed.items.slice(0, 5).map((i) => ({ row: i.row, type: i.input.type, body: i.input.body.slice(0, 80), topic: i.topicName })),
    newTopics: [],
  };
  if (parsed.errors.length || parsed.items.length === 0) return preview;

  return withTx(pool, async (tx) => {
    const ids = new Map<string, string>();
    for (const it of parsed.items) {
      if (!it.topicName) continue;
      const key = `${it.topicName.toLowerCase()}|${it.grade ?? ''}`;
      if (ids.has(key)) continue;
      const found = await tx.query<{ id: string }>('SELECT id FROM topics WHERE lower(name) = lower($1) AND grade IS NOT DISTINCT FROM $2', [it.topicName, it.grade]);
      if (found.rows[0]) ids.set(key, found.rows[0].id);
      else {
        preview.newTopics.push(it.topicName);
        if (commit) {
          const c = await tx.query<{ id: string }>('INSERT INTO topics (name, grade) VALUES ($1,$2) RETURNING id', [it.topicName, it.grade]);
          ids.set(key, (c.rows[0] as { id: string }).id);
        }
      }
    }
    if (!commit) return preview;
    for (const it of parsed.items) {
      const topicId = it.topicName ? (ids.get(`${it.topicName.toLowerCase()}|${it.grade ?? ''}`) ?? null) : null;
      await insertQuestionTx(tx, actor, { ...it.input, topicId }, false);
    }
    await writeAudit(tx, actor, { action: 'question.import', entityType: 'question', after: { count: parsed.items.length, newTopics: preview.newTopics } });
    preview.committed = true;
    return preview;
  });
}

/** Savol o'zgartirilsa, ISHLATILGAN (urinishda ko'rilgan) savol uchun yangi nusxa kerak — tarix buzilmasin. */
export async function updateQuestion(pool: Pool, actor: Actor, id: string, q: QuestionInput): Promise<void> {
  check(q);
  await withTx(pool, async (tx) => {
    const used = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM attempt_questions WHERE question_id = $1', [id]);
    if (((used.rows[0] as { n: number }).n) > 0) {
      throw badRequest('Bu savol imtihonda ishlatilgan — tahrirlash o\'rniga arxivlang va yangisini yarating');
    }
    const r = await tx.query(
      `UPDATE questions SET type=$2, body=$3, explanation=$4, topic_id=$5, class_id=$6, week_label=$7, difficulty=$8, tags=$9, points=$10,
              param_spec=$11::jsonb, answer_spec=$12::jsonb, image_media_id=$13, updated_at=now() WHERE id=$1`,
      [id, q.type, q.body, q.explanation ?? null, q.topicId ?? null, q.classId ?? null, q.weekLabel ?? null, q.difficulty, q.tags, q.points,
        q.paramSpec ? JSON.stringify(q.paramSpec) : null, q.answerSpec ? JSON.stringify(q.answerSpec) : null, q.imageMediaId ?? null],
    );
    if (r.rowCount === 0) throw notFound('Savol topilmadi');
    await writeOptions(tx, id, q.options);
    await writeAudit(tx, actor, { action: 'question.update', entityType: 'question', entityId: id });
  });
}

export async function setQuestionArchived(pool: Pool, actor: Actor, id: string, archived: boolean): Promise<void> {
  await withTx(pool, async (tx) => {
    const r = await tx.query('UPDATE questions SET is_archived=$2, updated_at=now() WHERE id=$1', [id, archived]);
    if (r.rowCount === 0) throw notFound('Savol topilmadi');
    await writeAudit(tx, actor, { action: archived ? 'question.archive' : 'question.restore', entityType: 'question', entityId: id });
  });
}

export interface ListQuestionsQuery {
  topicId?: string; classId?: string; type?: string; difficulty?: number; search?: string; weekLabel?: string; tag?: string; includeArchived?: boolean; limit: number; offset: number;
}

export async function listQuestions(db: Db, f: ListQuestionsQuery) {
  const r = await db.query(
    `SELECT q.id, q.type, q.body, q.topic_id, q.class_id, q.difficulty, q.points, q.tags, q.is_archived, q.created_at,
            (SELECT count(*)::int FROM attempt_questions aq WHERE aq.question_id = q.id) AS times_used
       FROM questions q
      WHERE ($1::uuid IS NULL OR q.topic_id = $1) AND ($2::uuid IS NULL OR q.class_id = $2)
        AND ($3::text IS NULL OR q.type = $3) AND ($4::int IS NULL OR q.difficulty = $4)
        AND ($5::text IS NULL OR q.body ILIKE '%' || replace(replace($5, '%', '\\%'), '_', '\\_') || '%')
        AND ($6 OR NOT q.is_archived)
        AND ($9::text IS NULL OR q.week_label = $9) AND ($10::text IS NULL OR $10 = ANY(q.tags))
        AND NOT ('pdf-exam' = ANY(q.tags))
      ORDER BY q.created_at DESC LIMIT $7 OFFSET $8`,
    [f.topicId ?? null, f.classId ?? null, f.type ?? null, f.difficulty ?? null, f.search ?? null, f.includeArchived ?? false, f.limit, f.offset, f.weekLabel ?? null, f.tag ?? null],
  );
  return r.rows;
}

/** Admin ko'rinishi: to'g'ri javoblar bilan. */
export async function getQuestion(db: Db, id: string) {
  const q = await db.query('SELECT * FROM questions WHERE id = $1', [id]);
  if (!q.rows[0]) throw notFound('Savol topilmadi');
  const o = await db.query('SELECT id, body, is_correct, position FROM question_options WHERE question_id = $1 ORDER BY position', [id]);
  return { question: q.rows[0], options: o.rows };
}

/** Savolni nusxalash: yangi, faol (arxivlanmagan) savol; savol matni, variantlar, parametrlar va rasm ko'chiriladi. */
export async function duplicateQuestion(pool: Pool, actor: Actor, id: string): Promise<string> {
  return withTx(pool, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO questions (type, body, explanation, topic_id, class_id, week_label, difficulty, tags, points, param_spec, answer_spec, image_media_id, created_by)
       SELECT type, body, explanation, topic_id, class_id, week_label, difficulty, tags, points, param_spec, answer_spec, image_media_id, $2 FROM questions WHERE id = $1 AND NOT ('pdf-exam' = ANY(tags))
       RETURNING id`,
      [id, actor.type === 'admin' ? actor.adminId : null],
    );
    const nid = r.rows[0]?.id;
    if (!nid) throw notFound('Savol topilmadi');
    await tx.query('INSERT INTO question_options (question_id, body, is_correct, position) SELECT $2, body, is_correct, position FROM question_options WHERE question_id = $1', [id, nid]);
    await writeAudit(tx, actor, { action: 'question.duplicate', entityType: 'question', entityId: nid, after: { from: id } });
    return nid;
  });
}

export type BulkAction = { action: 'archive' | 'restore' } | { action: 'set_topic'; topicId: string | null } | { action: 'set_difficulty'; difficulty: number } | { action: 'set_week'; weekLabel: string | null } | { action: 'add_tag'; tag: string };

/** Ommaviy tahrir. Ishlatilgan savollarning mazmuni o'zgarmaydi (faqat tasnif maydonlari) — tarix buzilmaydi. */
export async function bulkUpdateQuestions(pool: Pool, actor: Actor, ids: string[], op: BulkAction): Promise<number> {
  if (ids.length === 0 || ids.length > 500) throw badRequest('1–500 ta savol tanlang');
  return withTx(pool, async (tx) => {
    let r;
    switch (op.action) {
      case 'archive': r = await tx.query('UPDATE questions SET is_archived = true, updated_at = now() WHERE id = ANY($1::uuid[])', [ids]); break;
      case 'restore': r = await tx.query('UPDATE questions SET is_archived = false, updated_at = now() WHERE id = ANY($1::uuid[]) AND NOT (\'pdf-exam\' = ANY(tags))', [ids]); break;
      case 'set_topic': r = await tx.query('UPDATE questions SET topic_id = $2, updated_at = now() WHERE id = ANY($1::uuid[])', [ids, op.topicId]); break;
      case 'set_difficulty':
        if (!Number.isInteger(op.difficulty) || op.difficulty < 1 || op.difficulty > 5) throw badRequest('Qiyinlik 1–5');
        r = await tx.query('UPDATE questions SET difficulty = $2, updated_at = now() WHERE id = ANY($1::uuid[])', [ids, op.difficulty]); break;
      case 'set_week': r = await tx.query('UPDATE questions SET week_label = $2, updated_at = now() WHERE id = ANY($1::uuid[])', [ids, op.weekLabel]); break;
      case 'add_tag':
        if (!op.tag.trim() || op.tag.length > 40) throw badRequest('Teg 1–40 belgi');
        r = await tx.query('UPDATE questions SET tags = array_append(tags, $2), updated_at = now() WHERE id = ANY($1::uuid[]) AND NOT ($2 = ANY(tags))', [ids, op.tag.trim()]); break;
    }
    await writeAudit(tx, actor, { action: 'question.bulk_update', entityType: 'question', after: { op, count: r?.rowCount ?? 0 } });
    return r?.rowCount ?? 0;
  });
}
