import type { DashboardDto } from '@pep/shared';
import type { Db, Pool } from '../db/pool';
import { listAudit } from './audit';

export async function getDashboard(db: Db, role: 'admin' | 'teacher' = 'admin', classIds: string[] | null = null): Promise<DashboardDto> {
  const scope = classIds; // null = cheklovsiz (administrator)
  const counts = await db.query<{ classes: number; total: number; active: number; linked: number; now: Date }>(
    `SELECT (SELECT count(*) FROM classes WHERE NOT is_archived AND ($1::uuid[] IS NULL OR id = ANY($1)))::int AS classes,
            count(*)::int AS total,
            count(*) FILTER (WHERE is_active)::int AS active,
            count(*) FILTER (WHERE is_active AND telegram_id IS NOT NULL)::int AS linked,
            now() AS now
       FROM students WHERE ($1::uuid[] IS NULL OR class_id = ANY($1))`, [scope]);
  const c = counts.rows[0] as { classes: number; total: number; active: number; linked: number; now: Date };
  const att = await db.query<{ status: string; n: number }>(
    `SELECT a.status, count(*)::int AS n FROM attendance a JOIN students s ON s.id = a.student_id
      WHERE a.lesson_date = (now() AT TIME ZONE 'Asia/Tashkent')::date AND s.is_active AND ($1::uuid[] IS NULL OR s.class_id = ANY($1)) GROUP BY a.status`, [scope]);
  const n = (k: string) => att.rows.find((x) => x.status === k)?.n ?? 0;
  const marked = n('present') + n('absent') + n('late') + n('excused');
  const gr = await db.query<{ avg: string | null; cnt: number }>(
    `SELECT round(avg(g.value)::numeric, 2)::text AS avg, count(*)::int AS cnt FROM grades g JOIN students s ON s.id = g.student_id
      WHERE g.grade_date >= (now() AT TIME ZONE 'Asia/Tashkent')::date - 30 AND ($1::uuid[] IS NULL OR s.class_id = ANY($1))`, [scope]);
  const ex = await db.query<{ id: string; title: string; starts_at: Date; status: string }>(
    `SELECT DISTINCT e.id, e.title, e.starts_at, e.status FROM exams e
       WHERE e.status IN ('scheduled','running','paused') AND ($1::uuid[] IS NULL OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id = e.id AND ec.class_id = ANY($1)))
       ORDER BY e.starts_at LIMIT 5`, [scope]);
  const pt = role === 'admin'
    ? await db.query<{ teachers: number; parents: number; linked: number }>(
        `SELECT (SELECT count(*) FROM admins WHERE role = 'teacher' AND is_active)::int AS teachers,
                (SELECT count(*) FROM parents WHERE is_active)::int AS parents,
                (SELECT count(*) FROM parents WHERE is_active AND telegram_id IS NOT NULL)::int AS linked`)
    : null;
  const ptr = pt?.rows[0];
  const backup = await db.query<{ status: string; finished_at: Date | null }>(
    'SELECT status, finished_at FROM backups ORDER BY started_at DESC LIMIT 1',
  );
  const bk = backup.rows[0];
  return {
    role,
    classes: c.classes,
    students: { total: c.total, active: c.active, linked: c.linked, unlinked: c.active - c.linked },
    overview: {
      teachers: ptr?.teachers ?? null,
      parents: ptr ? { total: ptr.parents, linked: ptr.linked } : null,
      attendanceToday: { present: n('present'), absent: n('absent'), late: n('late'), excused: n('excused'), marked, expected: c.active },
      avgGrade30: (gr.rows[0] as { avg: string | null }).avg === null ? null : Number((gr.rows[0] as { avg: string }).avg),
      gradeCount30: (gr.rows[0] as { cnt: number }).cnt,
      upcomingExams: ex.rows.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at.toISOString(), status: e.status })),
    },
    recentAudit: role === 'admin' ? await listAudit(db, 10) : [],
    system: {
      dbOk: true,
      serverTime: c.now.toISOString(),
      lastBackupAt: role === 'admin' ? bk?.finished_at?.toISOString() ?? null : null,
      lastBackupStatus: role === 'admin' ? bk?.status ?? null : null,
    },
  };
}

/** Bot holati va update dedupe. */
export async function getBotState(db: Db, telegramId: number) {
  const r = await db.query<{ step: string; data: Record<string, unknown> }>(
    'SELECT step, data FROM bot_states WHERE telegram_id = $1',
    [telegramId],
  );
  return r.rows[0] ?? null;
}

export async function putBotState(db: Db, telegramId: number, step: string, data: Record<string, unknown>) {
  await db.query(
    `INSERT INTO bot_states (telegram_id, step, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (telegram_id) DO UPDATE SET step = EXCLUDED.step, data = EXCLUDED.data, updated_at = now()`,
    [telegramId, step, JSON.stringify(data)],
  );
}

export async function deleteBotState(db: Db, telegramId: number) {
  await db.query('DELETE FROM bot_states WHERE telegram_id = $1', [telegramId]);
}

/** true — update birinchi marta ko'rilyapti (qayta ishlash kerak); false — takroriy. */
export async function claimUpdate(db: Db, updateId: number): Promise<boolean> {
  const r = await db.query('INSERT INTO processed_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING', [updateId]);
  return (r.rowCount ?? 0) === 1;
}

/** Muddati o'tgan yozuvlarni tozalaydi (soatiga bir marta chaqiriladi). */
export async function housekeeping(pool: Pool): Promise<Record<string, number>> {
  const q = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  return {
    sessions: await q(`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`),
    adminTokens: await q(`DELETE FROM admin_login_tokens WHERE expires_at < now() - interval '1 day'`),
    confirmations: await q(`DELETE FROM registration_confirmations WHERE expires_at < now() - interval '1 day'`),
    updates: await q(`DELETE FROM processed_updates WHERE received_at < now() - interval '3 days'`),
    botStates: await q(`DELETE FROM bot_states WHERE updated_at < now() - interval '7 days'`),
    loginAttempts: await q(`DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'`),
  };
}
