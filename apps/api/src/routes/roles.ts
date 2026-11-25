import { uuidSchema } from '@pep/shared';
import type { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../db/pool';
import { parse } from '../lib/errors';
import { adminOf } from '../middleware/auth';
import { ah } from '../middleware/common';
import { getPublicSettings, setPublicSettings } from '../services/public';
import { createParent, listParents, resetParentLink, updateParent } from '../services/parents';
import { addAssignment, createTeacher, listTeachers, removeAssignment, updateTeacher } from '../services/staff';

/** Faqat administrator (teacherGuard o'qituvchini bu yo'llarga kiritmaydi). */
export function registerRolesAdmin(r: Router, pool: Pool): void {
  const id = (p: string | undefined) => parse(uuidSchema, p);

  r.get('/settings/public', ah(async (_req, res) => { res.json(await getPublicSettings(pool)); }));
  r.put('/settings/public', ah(async (req, res) => {
    const b = parse(z.object({ showLeaders: z.boolean() }), req.body);
    await setPublicSettings(pool, adminOf(req).actor, b.showLeaders);
    res.status(204).end();
  }));

  r.get('/teachers', ah(async (_req, res) => { res.json({ items: await listTeachers(pool) }); }));
  r.post('/teachers', ah(async (req, res) => {
    const b = parse(z.object({ telegramId: z.number().int().positive(), displayName: z.string().trim().min(2).max(100), subject: z.string().trim().max(60).nullable().optional() }), req.body);
    res.status(201).json({ id: await createTeacher(pool, adminOf(req).actor, b) });
  }));
  r.patch('/teachers/:id', ah(async (req, res) => {
    const b = parse(z.object({ displayName: z.string().trim().min(2).max(100).optional(), subject: z.string().trim().max(60).nullable().optional(), isActive: z.boolean().optional() }), req.body);
    await updateTeacher(pool, adminOf(req).actor, id(req.params.id), b);
    res.status(204).end();
  }));
  r.post('/teachers/:id/assignments', ah(async (req, res) => {
    const b = parse(z.object({ classId: uuidSchema, kind: z.enum(['homeroom', 'subject']), subject: z.string().trim().max(60).nullable().optional() }), req.body);
    await addAssignment(pool, adminOf(req).actor, id(req.params.id), b);
    res.status(201).end();
  }));
  r.delete('/assignments/:id', ah(async (req, res) => { await removeAssignment(pool, adminOf(req).actor, id(req.params.id)); res.status(204).end(); }));

  r.get('/parents', ah(async (req, res) => {
    const q = parse(z.object({ q: z.string().trim().max(80).optional() }), req.query);
    res.json({ items: await listParents(pool, q.q) });
  }));
  r.post('/parents', ah(async (req, res) => {
    const b = parse(z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().max(80).optional(), phone: z.string().trim().max(30).nullable().optional(), studentIds: z.array(uuidSchema).max(10) }), req.body);
    res.status(201).json(await createParent(pool, adminOf(req).actor, b));
  }));
  r.patch('/parents/:id', ah(async (req, res) => {
    const b = parse(z.object({ firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().max(80).optional(), phone: z.string().trim().max(30).nullable().optional(), isActive: z.boolean().optional(), studentIds: z.array(uuidSchema).max(10).optional() }), req.body);
    await updateParent(pool, adminOf(req).actor, id(req.params.id), b);
    res.status(204).end();
  }));
  r.post('/parents/:id/reset-link', ah(async (req, res) => { res.json({ linkCode: await resetParentLink(pool, adminOf(req).actor, id(req.params.id)) }); }));
}
