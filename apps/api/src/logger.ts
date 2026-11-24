import { pino } from 'pino';
import type { Logger } from 'pino';
import type { Config } from './config';

/** Strukturali JSON log. Sirlar (token, cookie, initData, ID kodlari) maskalanadi. */
export function createLogger(cfg: Pick<Config, 'logLevel'>): Logger {
  return pino({
    level: cfg.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.token',
        '*.initData',
        '*.confirmToken',
        '*.code',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  });
}
