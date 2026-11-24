import {
  adminLoginLinkSchema,
  botStateSchema,
  claimUpdateSchema,
  registrationConfirmSchema,
  registrationLookupSchema,
} from '@pep/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config';
import type { Pool } from '../db/pool';
import { notFound, parse } from '../lib/errors';
import { requireInternal } from '../middleware/auth';
import { ah } from '../middleware/common';
import { createAdminLoginLink } from '../services/admin-auth';
import { listActiveClassesForBot } from '../services/classes';
import { confirmRegistration, getStudentByTelegram, lookupRegistration } from '../services/registration';
import { claimDue, reportResult } from '../services/notifications';
import { claimUpdate, deleteBotState, getBotState, putBotState } from '../services/system';

const tgParam = z.coerce.number().int().positive().safe();

/** Faqat bot uchun (X-Internal-Key). Reverse-proxy orqali tashqariga CHIQARILMAYDI. */
export function internalRouter(cfg: Config, pool: Pool): Router {
  const r = Router();
  r.use(requireInternal(cfg));

  r.get('/classes', ah(async (_req, res) => {
    res.json({ items: await listActiveClassesForBot(pool) });
  }));

  r.post('/registration/lookup', ah(async (req, res) => {
    res.json(await lookupRegistration(pool, cfg, parse(registrationLookupSchema, req.body)));
  }));

  r.post('/registration/confirm', ah(async (req, res) => {
    res.json(await confirmRegistration(pool, parse(registrationConfirmSchema, req.body)));
  }));

  r.get('/students/by-telegram/:telegramId', ah(async (req, res) => {
    const student = await getStudentByTelegram(pool, parse(tgParam, req.params.telegramId));
    if (!student) throw notFound('Bog\'langan o\'quvchi yo\'q');
    res.json({ student });
  }));

  r.post('/admin/login-link', ah(async (req, res) => {
    const { telegramId } = parse(adminLoginLinkSchema, req.body);
    const { url, expiresAt } = await createAdminLoginLink(pool, cfg, telegramId);
    res.json({ url, expiresAt: expiresAt.toISOString() });
  }));

  r.get('/bot-state/:telegramId', ah(async (req, res) => {
    res.json({ state: await getBotState(pool, parse(tgParam, req.params.telegramId)) });
  }));

  r.put('/bot-state/:telegramId', ah(async (req, res) => {
    const body = parse(botStateSchema, req.body);
    await putBotState(pool, parse(tgParam, req.params.telegramId), body.step, body.data);
    res.status(204).end();
  }));

  r.delete('/bot-state/:telegramId', ah(async (req, res) => {
    await deleteBotState(pool, parse(tgParam, req.params.telegramId));
    res.status(204).end();
  }));

  r.post('/updates/claim', ah(async (req, res) => {
    const { updateId } = parse(claimUpdateSchema, req.body);
    res.json({ claimed: await claimUpdate(pool, updateId) });
  }));

  r.post('/notifications/claim', ah(async (req, res) => {
    const b = parse(z.object({ limit: z.number().int().min(1).max(50).default(20) }), req.body ?? {});
    res.json({ items: await claimDue(pool, b.limit) });
  }));

  r.post('/notifications/:id/result', ah(async (req, res) => {
    const b = parse(z.object({ ok: z.boolean(), error: z.string().max(300).optional(), permanent: z.boolean().optional() }), req.body);
    await reportResult(pool, parse(z.string().uuid(), req.params.id), b);
    res.status(204).end();
  }));

  return r;
}
