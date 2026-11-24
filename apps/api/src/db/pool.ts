import pg from 'pg';

// bigint (int8) -> number. Telegram ID lari 2^53 dan ancha kichik, shuning uchun xavfsiz.
pg.types.setTypeParser(20, (v: string) => Number(v));

export type Pool = pg.Pool;
/** Pool yoki tranzaksiya ichidagi klient — servislar ikkalasi bilan ishlaydi. */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export function createPool(databaseUrl: string, max = 10): pg.Pool {
  // `?schema=public` (Prisma uslubi) pg uchun begona parametr — olib tashlaymiz
  const u = new URL(databaseUrl);
  u.searchParams.delete('schema');
  return new pg.Pool({
    connectionString: u.toString(),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
}

/** BEGIN/COMMIT/ROLLBACK. Xatoda to'liq rollback. */
export async function withTx<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback xatosi asl xatoni yashirmasin */
    }
    throw e;
  } finally {
    client.release();
  }
}
