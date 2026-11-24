import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { sha256Hex } from './lib/crypto';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Config } from './config';
import type { Pool } from './db/pool';
import { csrfGuard } from './middleware/auth';
import { ah, errorHandler, notFoundHandler } from './middleware/common';
import { adminAuthRouter } from './routes/admin-auth';
import { adminRouter } from './routes/admin';
import { internalRouter } from './routes/internal';
import { studentRouter } from './routes/student';
import { parentRouter } from './routes/parent';
import { getPublicHome } from './services/public';

export interface AppDeps {
  cfg: Config;
  pool: Pool;
  logger: Logger;
}

export function createApp({ cfg, pool, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('x-request-id', id);
        void req;
        return id;
      },
      quietReqLogger: true,
      // So'rov chizig'i: so'rov parametrlari (qidiruv, ism) logga tushmaydi
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );

  // Bu API faqat JSON beradi: qat'iy CSP, freymga joylashtirish taqiqlangan
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['content-type', 'authorization', 'x-requested-with'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Sog'liq tekshiruvi
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', ah(async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  }));

  // Ichki (bot) — umumiy limitdan tashqari, lekin kalit bilan himoyalangan
  app.use('/internal', internalRouter(cfg, pool));

  // Chegara kaliti: o'quvchi so'rovlari sessiya tokeni bo'yicha (maktab Wi-Fi'sida 30 o'quvchi bitta IP bo'ladi),
  // tokensiz/admin so'rovlari IP bo'yicha. Token xeshlanadi — xotirada xom token saqlanmaydi.
  const keyOf = (req: import('express').Request): string => {
    const bearer = /^Bearer (.{20,200})$/.exec(req.get('authorization') ?? '')?.[1];
    return bearer ? `t:${sha256Hex(bearer).slice(0, 24)}` : `ip:${(req as { ip?: string }).ip ?? 'unknown'}`;
  };
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: (req) => (req.get('authorization')?.startsWith('Bearer ') ? 240 : 300),
    keyGenerator: keyOf,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'So\'rovlar juda ko\'p. Biroz kuting' } },
  });
  app.use('/api', limiter);

  app.get('/api/public/home', ah(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await getPublicHome(pool, cfg.botUsername));
  }));
  app.use('/api/admin', csrfGuard(cfg));
  app.use('/api/admin/auth', adminAuthRouter(cfg, pool));
  app.use('/api/admin', adminRouter(cfg, pool));
  app.use('/api/student', studentRouter(cfg, pool));
  app.use('/api/parent', parentRouter(pool));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
