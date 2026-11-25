import { loadConfig } from './config';
import { createPool } from './db/pool';
import { createLogger } from './logger';
import { createApp } from './app';
import { housekeeping } from './services/system';
import { expireOverdueAttempts } from './services/attempts';
import { advanceExamStatuses } from './services/exams';
import { scheduleReminders } from './services/notifications';

const cfg = loadConfig();
const logger = createLogger(cfg);
const pool = createPool(cfg.databaseUrl);
pool.on('error', (err) => logger.error({ err }, 'pg pool error'));

const app = createApp({ cfg, pool, logger });
const server = app.listen(cfg.port, () => logger.info({ port: cfg.port, env: cfg.env }, 'API ishga tushdi'));

// Soatiga bir marta eski sessiya/tokenlarni tozalash (bir nechta nusxa ishlasa ham zarari yo'q: DELETE idempotent)
const timer = setInterval(() => {
  housekeeping(pool).then(
    (r) => logger.debug({ removed: r }, 'housekeeping'),
    (err) => logger.error({ err }, 'housekeeping xatosi'),
  );
}, 60 * 60_000);
timer.unref();

// Vaqti o'tgan urinishlarni har 30 soniyada yakunlash (idempotent; bir nechta nusxada ham xavfsiz: qator qulfi)
const expiry = setInterval(() => {
  scheduleReminders(pool).catch((err) => logger.error({ err }, 'eslatma xatosi'));
  advanceExamStatuses(pool).catch((err) => logger.error({ err }, 'exam status xatosi'));
  expireOverdueAttempts(pool).catch((err) => logger.error({ err }, 'expire xatosi'));
}, 30_000);
expiry.unref();

async function shutdown(signal: string) {
  logger.info({ signal }, 'to\'xtatilmoqda');
  clearInterval(timer);
  clearInterval(expiry);
  server.close(async () => {
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
