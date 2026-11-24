/** Ochiq (loginsiz) bosh sahifa ma'lumotlari: umumiy ko'rsatkichlar va hafta/oy o'quvchisi. Shaxsiy ma'lumot minimal: "Ism F." + sinf. */
import type { Pool } from '../db/pool';
import { withTx } from '../db/pool';
import { writeAudit } from './audit';
import type { Actor } from './audit';

const VISIBLE_SQL = `(e.results_published_at IS NOT NULL OR e.results_policy = 'immediate' OR (e.results_policy = 'after_end' AND e.status = 'finished'))`;

export interface Leader { name: string; className: string; percent: number; exams: number }
export interface LeaderBoard { label: string; previous: boolean; items: Leader[] }
export interface PublicHomeDto {
  botUsername: string | null;
  stats: { classes: number; students: number; examsThisMonth: number; avgPercentMonth: number | null };
  leaders: { week: LeaderBoard; month: LeaderBoard } | null;
}

export async function getPublicSettings(pool: Pool): Promise<{ showLeaders: boolean }> {
  const r = await pool.query<{ value: { showLeaders?: boolean } }>(`SELECT value FROM app_settings WHERE key = 'public_home'`);
  return { showLeaders: r.rows[0]?.value.showLeaders !== false };
}

export async function setPublicSettings(pool: Pool, actor: Actor, showLeaders: boolean): Promise<void> {
  await withTx(pool, async (tx) => {
    await tx.query(`INSERT INTO app_settings (key, value) VALUES ('public_home', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ showLeaders })]);
    await writeAudit(tx, actor, { action: 'settings.public_home', entityType: 'settings', after: { showLeaders } });
  });
  cache = null;
}

async function board(pool: Pool, unit: 'week' | 'month'): Promise<LeaderBoard> {
  const interval = unit === 'week' ? '1 week' : '1 month';
  for (const offset of [0, 1]) {
    const r = await pool.query<{ first_name: string; last_name: string; class_name: string; avg: string; exams: number }>(
      `WITH p AS (SELECT date_trunc($1, now() AT TIME ZONE 'Asia/Tashkent') - $2::interval * $3::int AS s)
       SELECT s.first_name, s.last_name, c.name AS class_name, round(avg(a.percent), 1)::text AS avg, count(*)::int AS exams
         FROM attempts a
         JOIN exams e ON e.id = a.exam_id
         JOIN students s ON s.id = a.student_id
         JOIN classes c ON c.id = s.class_id
        WHERE a.is_final AND a.status IN ('submitted','expired') AND s.is_active AND ${VISIBLE_SQL}
          AND a.submitted_at >= (SELECT s FROM p) AT TIME ZONE 'Asia/Tashkent'
          AND a.submitted_at <  ((SELECT s FROM p) + $2::interval) AT TIME ZONE 'Asia/Tashkent'
        GROUP BY s.id, s.first_name, s.last_name, c.name
        ORDER BY avg(a.percent) DESC, count(*) DESC, s.last_name LIMIT 5`, [unit, interval, offset]);
    if (r.rows.length > 0 || offset === 1) {
      return {
        label: unit === 'week' ? (offset === 0 ? 'Shu hafta' : "O'tgan hafta") : (offset === 0 ? 'Shu oy' : "O'tgan oy"),
        previous: offset === 1,
        items: r.rows.map((x) => ({ name: `${x.first_name} ${x.last_name.slice(0, 1)}.`, className: x.class_name, percent: Number(x.avg), exams: x.exams })),
      };
    }
  }
  return { label: '', previous: false, items: [] };
}

let cache: { at: number; data: PublicHomeDto } | null = null;

export async function getPublicHome(pool: Pool, botUsername: string | null): Promise<PublicHomeDto> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  const st = await pool.query<{ classes: number; students: number; exams: number; avg: string | null }>(
    `SELECT (SELECT count(*) FROM classes WHERE NOT is_archived)::int AS classes,
            (SELECT count(*) FROM students WHERE is_active)::int AS students,
            (SELECT count(*) FROM exams e WHERE e.status = 'finished' AND e.ends_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent')::int AS exams,
            (SELECT round(avg(a.percent), 1)::text FROM attempts a JOIN exams e ON e.id = a.exam_id
              WHERE a.is_final AND a.status IN ('submitted','expired') AND ${VISIBLE_SQL}
                AND a.submitted_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent') AS avg`);
  const s = st.rows[0] as { classes: number; students: number; exams: number; avg: string | null };
  const settings = await getPublicSettings(pool);
  const data: PublicHomeDto = {
    botUsername,
    stats: { classes: s.classes, students: s.students, examsThisMonth: s.exams, avgPercentMonth: s.avg === null ? null : Number(s.avg) },
    leaders: settings.showLeaders ? { week: await board(pool, 'week'), month: await board(pool, 'month') } : null,
  };
  cache = { at: Date.now(), data };
  return data;
}
