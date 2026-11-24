import pg from 'pg';

/**
 * Integratsiya test fayllari bitta bazani tozalab qayta yaratadi. Vitest ularni parallel ishga tushirsa ham
 * to'qnashmasligi uchun har fayl bazada umumiy (advisory) qulf oladi va oxirida qo'yib yuboradi.
 * Qulf alohida ulanishda ushlanadi; ulanish uzilsa, qulf o'zi bo'shaydi.
 */
export async function acquireTestDbLock(databaseUrl: string): Promise<() => Promise<void>> {
  const u = new URL(databaseUrl);
  u.searchParams.delete('schema');
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  await client.query('SELECT pg_advisory_lock(727999)');
  return async () => {
    try {
      await client.query('SELECT pg_advisory_unlock(727999)');
    } finally {
      await client.end().catch(() => undefined);
    }
  };
}
