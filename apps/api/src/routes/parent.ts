import { uuidSchema } from '@pep/shared';
import { Router } from 'express';
import type { Pool } from '../db/pool';
import { parse } from '../lib/errors';
import { parentOf, requireParent } from '../middleware/auth';
import { ah } from '../middleware/common';
import { revokeByToken } from '../services/sessions';
import { assertParentOf } from '../services/parent-auth';
import { listStudentResults } from '../services/results';
import { getStudentSchool } from '../services/school';

/** Ota-ona: faqat o'ziga biriktirilgan bolalarning ma'lumotlarini ko'radi (o'qish rejimi). */
export function parentRouter(pool: Pool): Router {
  const r = Router();
  r.use(requireParent(pool));
  r.get('/me', (req, res) => { res.json({ parent: parentOf(req).me }); });
  r.post('/logout', ah(async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    await revokeByToken(pool, token, 'logout');
    res.status(204).end();
  }));
  r.get('/children/:id/school', ah(async (req, res) => {
    const sid = parse(uuidSchema, req.params.id);
    await assertParentOf(pool, parentOf(req).parentId, sid);
    res.json(await getStudentSchool(pool, sid));
  }));
  r.get('/children/:id/results', ah(async (req, res) => {
    const sid = parse(uuidSchema, req.params.id);
    await assertParentOf(pool, parentOf(req).parentId, sid);
    res.json({ items: await listStudentResults(pool, sid) });
  }));
  return r;
}
