import { ErrorCode, saveAnswerSchema, studentDevAuthSchema, studentTelegramAuthSchema, uuidSchema } from '@pep/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Config } from '../config';
import type { Pool } from '../db/pool';
import { parse } from '../lib/errors';
import { requireStudent, studentOf } from '../middleware/auth';
import { registerSchoolStudent } from './school';
import { ah } from '../middleware/common';
import { revokeByToken } from '../services/sessions';
import { loginStudent } from '../services/student-auth';
import { linkParent, tryLoginParent } from '../services/parent-auth';
import { AppError } from '../lib/errors';
import { EVENT_KINDS, getStudentAnalytics, getStudentReview, listStudentResults, recordEvents, recordHeartbeat } from '../services/results';
import { z } from 'zod';
import { getMediaForStudent } from '../services/media';
import { createComplaint, listMaterialsForStudent } from '../services/extras';
import { finishAttempt, getAttemptForStudent, LateError, listStudentExams, saveAnswer, startAttempt } from '../services/attempts';

export function studentRouter(cfg: Config, pool: Pool): Router {
  const r = Router();
  const loginLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 400, // maktab Wi-Fi: ko'p o'quvchi bitta IP dan; haqiqiy himoya — initData imzosi va sessiya
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring' } },
  });

  r.post('/auth/telegram', loginLimiter, ah(async (req, res) => {
    const userAgent = req.get('user-agent');
    const body = req.body as { dev?: unknown } | undefined;
    const input =
      body?.dev === true && cfg.allowDevAuth && !cfg.isProd
        ? (() => { const d = parse(studentDevAuthSchema, req.body); return { dev: true, deviceId: d.deviceId, userAgent }; })()
        : (() => { const d = parse(studentTelegramAuthSchema, req.body); return { initData: d.initData, deviceId: d.deviceId, userAgent }; })();
    if ('initData' in input) {
      const p = await tryLoginParent(pool, cfg, { initData: input.initData, userAgent });
      if (p) { res.json({ role: 'parent', token: p.token, expiresAt: p.expiresAt.toISOString(), parent: p.parent }); return; }
    }
    const out = await loginStudent(pool, cfg, input);
    res.json({ role: 'student', token: out.token, expiresAt: out.expiresAt.toISOString(), student: out.student });
  }));

  const linkLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring' } } });
  r.post('/auth/parent-link', linkLimiter, ah(async (req, res) => {
    const b = parse(z.object({ initData: z.string().min(10).max(4096), code: z.string().trim().min(5).max(12) }), req.body);
    const out = await linkParent(pool, cfg, { initData: b.initData, code: b.code, userAgent: req.get('user-agent') });
    res.json({ role: 'parent', token: out.token, expiresAt: out.expiresAt.toISOString(), parent: out.parent });
  }));

  r.post('/auth/logout', requireStudent(pool), ah(async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    await revokeByToken(pool, token, 'logout');
    res.status(204).end();
  }));

  r.get('/me', requireStudent(pool), (req, res) => {
    res.json({ student: studentOf(req).me });
  });

  r.get('/exams', requireStudent(pool), ah(async (req, res) => {
    res.json({ exams: await listStudentExams(pool, studentOf(req).me.id) });
  }));

  r.post('/exams/:id/start', requireStudent(pool), ah(async (req, res) => {
    const examId = parse(uuidSchema, req.params.id);
    res.json({ attempt: await startAttempt(pool, studentOf(req).me.id, examId) });
  }));

  r.get('/attempts/:id', requireStudent(pool), ah(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    res.json({ attempt: await getAttemptForStudent(pool, studentOf(req).me.id, id) });
  }));

  r.put('/attempts/:id/answers', requireStudent(pool), ah(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(saveAnswerSchema, req.body);
    try {
      res.json(await saveAnswer(pool, studentOf(req).me.id, id, body));
    } catch (e) {
      if (e instanceof LateError) throw new AppError(409, ErrorCode.CONFLICT, 'Vaqt tugagan, javob qabul qilinmadi', { reason: 'LATE' });
      throw e;
    }
  }));

  registerSchoolStudent(r, pool);
  r.get('/analytics', requireStudent(pool), ah(async (req, res) => { res.json(await getStudentAnalytics(pool, studentOf(req).me.id)); }));
  r.get('/materials', requireStudent(pool), ah(async (req, res) => { res.json({ items: await listMaterialsForStudent(pool, studentOf(req).me.id) }); }));
  r.post('/attempts/:id/complaints', requireStudent(pool), ah(async (req, res) => {
    const b = parse(z.object({ attemptQuestionId: uuidSchema.nullable().default(null), body: z.string().trim().min(3).max(1000) }), req.body);
    res.status(201).json({ id: await createComplaint(pool, studentOf(req).me.id, parse(uuidSchema, req.params.id), b.attemptQuestionId, b.body) });
  }));

  r.get('/media/:id', requireStudent(pool), ah(async (req, res) => {
    const m = await getMediaForStudent(pool, studentOf(req).me.id, parse(uuidSchema, req.params.id));
    res.set({ 'Content-Type': m.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', ETag: `"${m.sha256}"`, 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
    res.send(m.data);
  }));

  r.post('/attempts/:id/heartbeat', requireStudent(pool), ah(async (req, res) => {
    res.json(await recordHeartbeat(pool, studentOf(req).me.id, parse(uuidSchema, req.params.id)));
  }));

  r.post('/attempts/:id/events', requireStudent(pool), ah(async (req, res) => {
    const b = parse(z.object({ events: z.array(z.object({ kind: z.enum(EVENT_KINDS), clientTs: z.string().max(40).nullable().optional() })).min(1).max(20) }), req.body);
    res.json({ stored: await recordEvents(pool, studentOf(req).me.id, parse(uuidSchema, req.params.id), b.events) });
  }));

  r.get('/results', requireStudent(pool), ah(async (req, res) => {
    res.json({ items: await listStudentResults(pool, studentOf(req).me.id) });
  }));

  r.get('/results/:attemptId', requireStudent(pool), ah(async (req, res) => {
    res.json(await getStudentReview(pool, studentOf(req).me.id, parse(uuidSchema, req.params.attemptId)));
  }));

  r.post('/attempts/:id/finish', requireStudent(pool), ah(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const result = await finishAttempt(pool, id, 'student', studentOf(req).me.id);
    // Natija siyosati: faqat "immediate" bo'lsa ball darhol ko'rsatiladi; aks holda o'quvchi faqat qabul qilinganini biladi.
    const pol = await pool.query<{ results_policy: string }>(
      'SELECT e.results_policy FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1', [id],
    );
    res.json({ result: pol.rows[0]?.results_policy === 'immediate' ? result : { status: result.status } });
  }));

  return r;
}
