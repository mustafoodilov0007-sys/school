import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPool } from './pool';
import type { Pool } from './pool';

const LOCK_KEY = 727001;

/**
 * db/migrations/*.sql fayllarini tartib bilan qo'llaydi. Har biri alohida tranzaksiyada.
 * Qo'llangan migratsiya keyin o'zgartirilsa (checksum farq qilsa) — xato (jim o'tmaydi).
 */
export async function runMigrations(pool: Pool, dir: string, log: (m: string) => void = console.log): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]); // bir vaqtda ikki jarayon migratsiya qilmasin
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Map<string, string>();
    for (const r of (await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')).rows) {
      done.set(r.name, r.checksum);
    }
    const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = done.get(f);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migratsiya ${f} qo'llangandan keyin o'zgartirilgan. Yangi migratsiya fayli yarating.`);
        continue;
      }
      log(`→ ${f}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [f, checksum]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migratsiya ${f} muvaffaqiyatsiz: ${(e as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export const defaultMigrationsDir = () => process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), '../../db/migrations');

// CLI: `npm run db:migrate`
if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL belgilanmagan');
    process.exit(1);
  }
  const pool = createPool(url, 2);
  runMigrations(pool, defaultMigrationsDir())
    .then((a) => console.log(a.length ? `Qo'llandi: ${a.join(', ')}` : 'Yangi migratsiya yo\'q'))
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
