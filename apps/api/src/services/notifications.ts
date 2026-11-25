import type { Db, Pool } from '../db/pool';

/**
 * Bildirishnomalar outbox'i. Navbatga qo'yish idempotent (`dedupe_key` UNIQUE), yuborishni bot bajaradi:
 * claim (ijara 5 daqiqa — bot o'lsa qayta uriniladi) -> Telegram -> natijani xabar qilish.
 */
export type NoticeKind = 'exam_24h' | 'exam_30m' | 'exam_started' | 'exam_cancelled' | 'exam_changed' | 'results_published' | 'custom';

/** Imtihon sinflaridagi faol, Telegram'ga bog'langan o'quvchilarga xabar navbatga qo'yadi. `onlyStarters` — natija xabari kabi holatlar uchun alohida. */
export async function enqueueExamNotice(db: Db, examId: string, kind: NoticeKind, suffix = ''): Promise<number> {
  const r = await db.query(
    `INSERT INTO notifications (student_id, exam_id, kind, dedupe_key, payload)
     SELECT s.id, e.id, $2, $2 || ':' || e.id || ':' || s.id || $3, jsonb_build_object('examTitle', e.title, 'startsAt', e.starts_at)
       FROM exams e
       JOIN exam_classes ec ON ec.exam_id = e.id
       JOIN students s ON s.class_id = ec.class_id AND s.is_active AND s.telegram_id IS NOT NULL
      WHERE e.id = $1
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [examId, kind, suffix],
  );
  return r.rowCount ?? 0;
}

/**
 * Eslatmalar: 24 soat (boshlanishiga 3 soatdan ko'p qolgan bo'lsa) va 30 daqiqa oldin. Davriy chaqiriladi; dedupe takrorni oldini oladi.
 * Faqat e'lon qilingan (scheduled) imtihonlar.
 */
export async function scheduleReminders(pool: Pool): Promise<number> {
  const a = await pool.query<{ id: string }>(
    `SELECT id FROM exams WHERE status = 'scheduled' AND starts_at > now() + interval '3 hours' AND starts_at <= now() + interval '24 hours'`,
  );
  const b = await pool.query<{ id: string }>(
    `SELECT id FROM exams WHERE status = 'scheduled' AND starts_at > now() AND starts_at <= now() + interval '30 minutes'`,
  );
  let n = 0;
  for (const e of a.rows) n += await enqueueExamNotice(pool, e.id, 'exam_24h');
  for (const e of b.rows) n += await enqueueExamNotice(pool, e.id, 'exam_30m');
  return n;
}

export interface ClaimedNotification {
  id: string;
  kind: NoticeKind;
  telegramId: number;
  attempt: number;
  payload: { examTitle?: string; startsAt?: string; text?: string };
}

export async function claimDue(pool: Pool, limit: number): Promise<ClaimedNotification[]> {
  // Bog'lanmagan/faolsiz o'quvchilarga yuborib bo'lmaydi
  await pool.query(
    `UPDATE notifications SET status = 'cancelled', last_error = 'telegram yo''q'
      WHERE status = 'pending' AND student_id IN (SELECT id FROM students WHERE telegram_id IS NULL OR NOT is_active)`,
  );
  const r = await pool.query<{ id: string; kind: NoticeKind; telegram_id: number; attempt_count: number; payload: ClaimedNotification['payload'] }>(
    `WITH due AS (
       SELECT n.id FROM notifications n
        WHERE n.status = 'pending' AND n.next_attempt_at <= now()
        ORDER BY n.next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     UPDATE notifications n SET attempt_count = n.attempt_count + 1, next_attempt_at = now() + interval '5 minutes'
       FROM due
      WHERE n.id = due.id
     RETURNING n.id, n.kind, n.payload, n.attempt_count, (SELECT s.telegram_id FROM students s WHERE s.id = n.student_id) AS telegram_id`,
    [Math.min(Math.max(limit, 1), 50)],
  );
  return r.rows.map((x) => ({ id: x.id, kind: x.kind, telegramId: x.telegram_id, attempt: x.attempt_count, payload: x.payload }));
}

export const MAX_ATTEMPTS = 5;

/** `permanent` — qayta urinish befoyda (bot bloklangan va h.k.). Aks holda kutish oshib boradi. */
export async function reportResult(pool: Pool, id: string, r: { ok: boolean; error?: string; permanent?: boolean }): Promise<void> {
  if (r.ok) {
    await pool.query(`UPDATE notifications SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`, [id]);
    return;
  }
  const err = (r.error ?? 'xato').slice(0, 300);
  await pool.query(
    `UPDATE notifications
        SET last_error = $2,
            status = CASE WHEN $3 OR attempt_count >= $4 THEN 'failed' ELSE 'pending' END,
            next_attempt_at = now() + (attempt_count * attempt_count) * interval '1 minute'
      WHERE id = $1`,
    [id, err, r.permanent === true, MAX_ATTEMPTS],
  );
}
