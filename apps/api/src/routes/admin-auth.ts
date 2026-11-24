import { devAdminLoginSchema, exchangeLoginTokenSchema } from '@pep/shared';
import { Router } from 'express';
import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { Config } from '../config';
import type { Pool } from '../db/pool';
import { notFound, parse } from '../lib/errors';
import { ah } from '../middleware/common';
import { requireAdmin } from '../middleware/auth';
import { devAdminLogin, exchangeLoginToken } from '../services/admin-auth';
import { writeAudit } from '../services/audit';
import { revokeByToken } from '../services/sessions';

export function setAdminCookie(cfg: Config, res: Response, token: string, expiresAt: Date) {
  res.cookie(cfg.adminCookieName, token, {
    httpOnly: true,
    secure: cfg.isProd,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export function adminAuthRouter(cfg: Config, pool: Pool): Router {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring' } },
  });

  r.get('/config', (_req, res) => {
    res.json({ devLogin: cfg.allowDevAuth && !cfg.isProd });
  });

  r.post('/exchange', limiter, ah(async (req, res) => {
    const { token } = parse(exchangeLoginTokenSchema, req.body);
    const { session, admin } = await exchangeLoginToken(pool, cfg, token, req.get('user-agent'));
    setAdminCookie(cfg, res, session.token, session.expiresAt);
    res.json({ admin });
  }));

  r.post('/dev-login', limiter, ah(async (req, res) => {
    if (!cfg.allowDevAuth || cfg.isProd) throw notFound();
    const { telegramId } = parse(devAdminLoginSchema, req.body);
    const { session, admin } = await devAdminLogin(pool, cfg, telegramId, req.get('user-agent'));
    setAdminCookie(cfg, res, session.token, session.expiresAt);
    res.json({ admin });
  }));

  r.post('/logout', requireAdmin(cfg, pool), ah(async (req, res) => {
    const token = (req.cookies as Record<string, string>)[cfg.adminCookieName] as string;
    await revokeByToken(pool, token, 'logout');
    if (req.admin) await writeAudit(pool, req.admin.actor, { action: 'admin.logout', entityType: 'admin', entityId: req.admin.me.id });
    res.clearCookie(cfg.adminCookieName, { path: '/', httpOnly: true, secure: cfg.isProd, sameSite: 'strict' });
    res.status(204).end();
  }));

  return r;
}
