import { uuidSchema } from '@pep/shared';
import type { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../db/pool';
import { parse } from '../lib/errors';
import { adminOf, requireStudent, studentOf } from '../middleware/auth';
import { assertClassAccess, classOfStudent } from '../services/staff';
import { notFound } from '../lib/errors';
import { ah } from '../middleware/common';
import { ATT_STATUSES, GRADE_KINDS, addGrade, deleteGrade, deleteSlot, getAttendance, getJournal, getStudentSchool, listSlots, saveAttendance, saveSlot } from '../services/school';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), 'Sana noto\'g\'ri');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional();

export function registerSchoolAdmin(r: Router, pool: Pool): void {
  const id = (p: string | undefined) => parse(uuidSchema, p);
  r.get('/schedule/:classId', ah(async (req, res) => { await assertClassAccess(pool, adminOf(req), id(req.params.classId), { type: 'view' }); res.json({ items: await listSlots(pool, id(req.params.classId)) }); }));
  r.put('/schedule/:classId', ah(async (req, res) => {
    const b = parse(z.object({ weekday: z.number().int().min(1).max(7), lessonNo: z.number().int().min(1).max(10), subject: z.string().trim().min(1).max(60), room: z.string().trim().max(20).nullable().optional(), startsAt: time, endsAt: time }), req.body);
    await saveSlot(pool, adminOf(req).actor, id(req.params.classId), b);
    res.status(204).end();
  }));
  r.delete('/schedule/slot/:id', ah(async (req, res) => { await deleteSlot(pool, adminOf(req).actor, id(req.params.id)); res.status(204).end(); }));

  r.get('/journal/:classId', ah(async (req, res) => {
    const q = parse(z.object({ from: date, to: date }), req.query);
    await assertClassAccess(pool, adminOf(req), id(req.params.classId), { type: 'view' });
    res.json(await getJournal(pool, id(req.params.classId), q.from, q.to));
  }));
  r.post('/grades', ah(async (req, res) => {
    const b = parse(z.object({ studentId: z.string().uuid(), date, subject: z.string().trim().min(1).max(60).default('Fizika'), value: z.number().int().min(1).max(5), kind: z.enum(GRADE_KINDS).default('daily'), topic: z.string().trim().max(200).nullable().optional(), comment: z.string().trim().max(500).nullable().optional() }), req.body);
    await assertClassAccess(pool, adminOf(req), await classOfStudent(pool, b.studentId), { type: 'grade', subject: b.subject });
    res.status(201).json({ id: await addGrade(pool, adminOf(req).actor, b) });
  }));
  r.delete('/grades/:id', ah(async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    const g = await pool.query<{ student_id: string; subject: string }>(`SELECT student_id, subject FROM grades WHERE id = $1`, [id(req.params.id)]);
    if (!g.rows[0]) throw notFound('Baho topilmadi');
    await assertClassAccess(pool, adminOf(req), await classOfStudent(pool, g.rows[0].student_id), { type: 'grade', subject: g.rows[0].subject });
    await deleteGrade(pool, adminOf(req).actor, id(req.params.id), b.reason);
    res.status(204).end();
  }));

  r.get('/attendance/:classId', ah(async (req, res) => {
    const q = parse(z.object({ date }), req.query);
    await assertClassAccess(pool, adminOf(req), id(req.params.classId), { type: 'view' });
    res.json(await getAttendance(pool, id(req.params.classId), q.date));
  }));
  r.put('/attendance/:classId', ah(async (req, res) => {
    const b = parse(z.object({ date, items: z.array(z.object({ studentId: z.string().uuid(), status: z.enum(ATT_STATUSES), note: z.string().trim().max(200).nullable().optional() })).min(1).max(100) }), req.body);
    await assertClassAccess(pool, adminOf(req), id(req.params.classId), { type: 'attendance' });
    res.json({ saved: await saveAttendance(pool, adminOf(req).actor, id(req.params.classId), b.date, b.items) });
  }));
}

export function registerSchoolStudent(r: Router, pool: Pool): void {
  r.get('/school', requireStudent(pool), ah(async (req, res) => { res.json(await getStudentSchool(pool, studentOf(req).me.id)); }));
}
