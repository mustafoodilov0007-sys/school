import type { Db, Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { badRequest, conflict } from '../lib/errors';
import type { Actor } from './audit';
import { writeAudit } from './audit';

export interface TopicDto {
  id: string;
  name: string;
  grade: number | null;
  questionCount: number;
}

export async function listTopics(db: Db): Promise<TopicDto[]> {
  const r = await db.query<{ id: string; name: string; grade: number | null; n: number }>(
    `SELECT t.id, t.name, t.grade, (SELECT count(*)::int FROM questions q WHERE q.topic_id = t.id AND NOT q.is_archived) AS n
       FROM topics t ORDER BY t.grade NULLS LAST, t.name`,
  );
  return r.rows.map((x) => ({ id: x.id, name: x.name, grade: x.grade, questionCount: x.n }));
}

export async function createTopic(pool: Pool, actor: Actor, name: string, grade: number | null): Promise<string> {
  const n = name.trim();
  if (!n) throw badRequest('Mavzu nomi bo\'sh');
  return withTx(pool, async (tx) => {
    // UNIQUE (name, grade) NULL grade uchun takrorni ushlamaydi — o'zimiz tekshiramiz
    const dup = await tx.query('SELECT 1 FROM topics WHERE lower(name) = lower($1) AND grade IS NOT DISTINCT FROM $2', [n, grade]);
    if (dup.rows[0]) throw conflict('Bunday mavzu allaqachon bor');
    const r = await tx.query<{ id: string }>('INSERT INTO topics (name, grade) VALUES ($1,$2) RETURNING id', [n, grade]);
    const id = (r.rows[0] as { id: string }).id;
    await writeAudit(tx, actor, { action: 'topic.create', entityType: 'topic', entityId: id, after: { name: n, grade } });
    return id;
  });
}
