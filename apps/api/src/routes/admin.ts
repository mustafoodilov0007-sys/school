import {
  bulkStudentsSchema,
  createClassSchema,
  createStudentSchema,
  listClassesQuerySchema,
  listStudentsQuerySchema,
  optionalReasonSchema,
  reasonSchema,
  updateClassSchema,
  updateStudentSchema,
  uuidSchema,
  examInputSchema,
  questionInputSchema,
} from '@pep/shared';
import express, { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { Config } from '../config';
import type { Pool } from '../db/pool';
import { badRequest, parse } from '../lib/errors';
import { adminOf, requireAdmin, teacherGuard } from '../middleware/auth';
import { assignedClassIds, assertClassAccess, listAssignments } from '../services/staff';
import { registerRolesAdmin } from './roles';
import { ah } from '../middleware/common';
import { listAudit } from '../services/audit';
import { getMedia, saveMedia } from '../services/media';
import { classReport, codesReport, examReport, studentReport, weeklyReport } from '../services/reports';
import type { Report } from '../services/reports';
import { readXlsx, rowsToCsv } from '../lib/xlsx';
import { addExtraTime, adjustScore, broadcast, deleteMaterial, listBackups, listComplaints, listMaterialsAdmin, listScoreAdjustments, resolveComplaint, saveMaterial } from '../services/extras';
import { createClass, listClasses, updateClass } from '../services/classes';
import {
  bulkCreateStudents,
  createStudent,
  exportStudentCodesCsv,
  getStudent,
  listStudents,
  regenerateStudentCode,
  setStudentActive,
  unlinkTelegram,
  updateStudent,
} from '../services/students';
import { getDashboard } from '../services/system';
import { createTopic, listTopics } from '../services/topics';
import { exportResultsCsv, getExamResults, getMonitor, getQuestionStats, listStudentAttempts, publishResults, setFinalAttempt } from '../services/results';
import { bulkUpdateQuestions, createQuestion, duplicateQuestion, getQuestion, importQuestions, listQuestions, setQuestionArchived, updateQuestion } from '../services/question-bank';
import { registerSchoolAdmin } from './school';
import { createExam, getExamDetail, grantRetake, listExams, transitionExam, voidQuestion } from '../services/exams';

const id = (req: Request) => parse(uuidSchema, req.params.id);

export function adminRouter(cfg: Config, pool: Pool): Router {
  const r = Router();
  r.use(requireAdmin(cfg, pool));
  r.use(teacherGuard);

  r.get('/me', ah(async (req, res) => {
    const a = adminOf(req);
    res.json({ admin: a.me, assignments: a.me.role === 'teacher' ? await listAssignments(pool, a.actor.adminId) : [] });
  }));

  r.get('/dashboard', ah(async (req, res) => {
    const a = adminOf(req);
    res.json(await getDashboard(pool, a.me.role, await assignedClassIds(pool, a)));
  }));

  r.get('/audit', ah(async (req, res) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }), req.query);
    res.json({ items: await listAudit(pool, q.limit, q.offset) });
  }));

  /* ── sinflar ── */
  r.get('/classes', ah(async (req, res) => {
    const q = parse(listClassesQuerySchema, req.query);
    const mine = await assignedClassIds(pool, adminOf(req));
    const items = await listClasses(pool, q.includeArchived ?? false);
    res.json({ items: mine ? items.filter((c) => mine.includes(c.id)) : items });
  }));

  r.post('/classes', ah(async (req, res) => {
    const body = parse(createClassSchema, req.body);
    res.status(201).json(await createClass(pool, adminOf(req).actor, body.name));
  }));

  r.patch('/classes/:id', ah(async (req, res) => {
    const body = parse(updateClassSchema, req.body);
    res.json(await updateClass(pool, adminOf(req).actor, id(req), body));
  }));

  /* ── o'quvchilar ── */
  r.get('/students', ah(async (req, res) => {
    const q = parse(listStudentsQuerySchema, req.query);
    if (adminOf(req).me.role === 'teacher') {
      if (!q.classId) throw badRequest('Sinfni tanlang');
      await assertClassAccess(pool, adminOf(req), q.classId, { type: 'view' });
    }
    const { items, total } = await listStudents(pool, q);
    res.json({ items, total, limit: q.limit, offset: q.offset });
  }));

  // `:id` dan oldin bo'lishi shart
  r.get('/students/export.csv', ah(async (req, res) => {
    const q = parse(z.object({ classId: uuidSchema.optional() }), req.query);
    const csv = await exportStudentCodesCsv(pool, adminOf(req).actor, q.classId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="oquvchi-idlari.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }));

  r.post('/students', ah(async (req, res) => {
    const body = parse(createStudentSchema, req.body);
    res.status(201).json(await createStudent(pool, cfg, adminOf(req).actor, body));
  }));

  r.post('/students/bulk', ah(async (req, res) => {
    const body = parse(bulkStudentsSchema, req.body);
    const result = await bulkCreateStudents(pool, cfg, adminOf(req).actor, body);
    res.status(result.dryRun ? 200 : 201).json(result);
  }));

  r.get('/students/:id', ah(async (req, res) => {
    res.json(await getStudent(pool, id(req)));
  }));

  r.patch('/students/:id', ah(async (req, res) => {
    res.json(await updateStudent(pool, adminOf(req).actor, id(req), parse(updateStudentSchema, req.body)));
  }));

  r.post('/students/:id/deactivate', ah(async (req, res) => {
    const { reason } = parse(optionalReasonSchema, req.body ?? {});
    res.json(await setStudentActive(pool, adminOf(req).actor, id(req), false, reason));
  }));

  r.post('/students/:id/activate', ah(async (req, res) => {
    const { reason } = parse(optionalReasonSchema, req.body ?? {});
    res.json(await setStudentActive(pool, adminOf(req).actor, id(req), true, reason));
  }));

  r.post('/students/:id/unlink-telegram', ah(async (req, res) => {
    const { reason } = parse(reasonSchema, req.body);
    res.json(await unlinkTelegram(pool, adminOf(req).actor, id(req), reason));
  }));

  r.post('/students/:id/regenerate-code', ah(async (req, res) => {
    const { reason } = parse(reasonSchema, req.body);
    res.json(await regenerateStudentCode(pool, cfg, adminOf(req).actor, id(req), reason));
  }));

  /* ── mavzular ── */
  r.get('/topics', ah(async (_req, res) => { res.json({ items: await listTopics(pool) }); }));
  r.post('/topics', ah(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(120), grade: z.number().int().min(1).max(12).nullable().default(null) }), req.body);
    res.status(201).json({ id: await createTopic(pool, adminOf(req).actor, b.name, b.grade) });
  }));

  /* ── savollar banki ── */
  // Fayl yuklash: xom bayt (Content-Type muhim emas — tur baytlardan aniqlanadi). ?kind=image|pdf
  r.post('/media', express.raw({ type: () => true, limit: '11mb' }), ah(async (req, res) => {
    const kind = z.enum(['image', 'pdf']).parse(req.query.kind);
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) { res.status(400).json({ error: { code: 'VALIDATION', message: 'Fayl bo\'sh' } }); return; }
    res.status(201).json(await saveMedia(pool, adminOf(req).actor, body, kind));
  }));
  r.get('/media/:id', ah(async (req, res) => {
    const m = await getMedia(pool, id(req));
    res.set({ 'Content-Type': m.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', ETag: `"${m.sha256}"`, 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
    res.send(m.data);
  }));
  r.get('/questions', ah(async (req, res) => {
    const q = parse(z.object({
      topicId: uuidSchema.optional(), classId: uuidSchema.optional(), type: z.string().max(20).optional(),
      difficulty: z.coerce.number().int().min(1).max(5).optional(), search: z.string().trim().max(100).optional(), weekLabel: z.string().trim().max(40).optional(), tag: z.string().trim().max(40).optional(),
      includeArchived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
    }), req.query);
    res.json({ items: await listQuestions(pool, q) });
  }));
  r.post('/questions/bulk', ah(async (req, res) => {
    const ids = z.array(uuidSchema).min(1).max(500);
    const b = parse(z.discriminatedUnion('action', [
      z.object({ action: z.enum(['archive', 'restore']), ids }),
      z.object({ action: z.literal('set_topic'), ids, topicId: uuidSchema.nullable() }),
      z.object({ action: z.literal('set_difficulty'), ids, difficulty: z.number().int().min(1).max(5) }),
      z.object({ action: z.literal('set_week'), ids, weekLabel: z.string().trim().max(40).nullable() }),
      z.object({ action: z.literal('add_tag'), ids, tag: z.string().trim().min(1).max(40) }),
    ]), req.body);
    const { ids: list, ...op } = b;
    res.json({ updated: await bulkUpdateQuestions(pool, adminOf(req).actor, list, op as never) });
  }));
  r.post('/questions/:id/duplicate', ah(async (req, res) => { res.status(201).json({ id: await duplicateQuestion(pool, adminOf(req).actor, id(req)) }); }));
  r.post('/questions/import', ah(async (req, res) => {
    const b = parse(z.object({ csv: z.string().min(1).max(190_000), commit: z.boolean().default(false) }), req.body);
    res.json(await importQuestions(pool, adminOf(req).actor, b.csv, b.commit));
  }));
  r.get('/questions/:id', ah(async (req, res) => { res.json(await getQuestion(pool, id(req))); }));
  r.post('/questions', ah(async (req, res) => {
    const body = parse(questionInputSchema, req.body);
    res.status(201).json({ id: await createQuestion(pool, adminOf(req).actor, body) });
  }));
  r.put('/questions/:id', ah(async (req, res) => {
    await updateQuestion(pool, adminOf(req).actor, id(req), parse(questionInputSchema, req.body));
    res.status(204).end();
  }));
  r.post('/questions/:id/archive', ah(async (req, res) => {
    const b = parse(z.object({ archived: z.boolean() }), req.body);
    await setQuestionArchived(pool, adminOf(req).actor, id(req), b.archived);
    res.status(204).end();
  }));

  /* ── imtihonlar ── */
  r.get('/exams', ah(async (_req, res) => { res.json({ items: await listExams(pool) }); }));
  r.post('/exams', ah(async (req, res) => {
    res.status(201).json({ id: await createExam(pool, adminOf(req).actor, parse(examInputSchema, req.body)) });
  }));
  r.get('/exams/:id', ah(async (req, res) => { res.json(await getExamDetail(pool, id(req))); }));
  r.get('/exams/:id/results', ah(async (req, res) => { res.json(await getExamResults(pool, id(req))); }));
  r.get('/exams/:id/results.csv', ah(async (req, res) => {
    const csv = await exportResultsCsv(pool, adminOf(req).actor, id(req));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="natijalar.csv"');
    res.send(csv);
  }));
  r.get('/exams/:id/question-stats', ah(async (req, res) => { res.json({ items: await getQuestionStats(pool, id(req)) }); }));
  r.get('/exams/:id/monitor', ah(async (req, res) => { res.json(await getMonitor(pool, id(req))); }));
  r.get('/exams/:id/students/:sid/attempts', ah(async (req, res) => {
    res.json({ items: await listStudentAttempts(pool, id(req), parse(uuidSchema, req.params.sid)) });
  }));
  r.post('/exams/:id/final-attempt', ah(async (req, res) => {
    const b = parse(z.object({ attemptId: uuidSchema, reason: z.string().trim().min(1).max(300) }), req.body);
    await setFinalAttempt(pool, adminOf(req).actor, id(req), b.attemptId, b.reason);
    res.status(204).end();
  }));
  r.post('/exams/:id/publish-results', ah(async (req, res) => { res.json(await publishResults(pool, adminOf(req).actor, id(req))); }));
  r.post('/exams/:id/status', ah(async (req, res) => {
    const b = parse(z.object({ to: z.enum(['draft', 'scheduled', 'running', 'paused', 'finished', 'cancelled']), reason: z.string().trim().max(300).optional() }), req.body);
    await transitionExam(pool, adminOf(req).actor, id(req), b.to, b.reason);
    res.status(204).end();
  }));
  r.post('/exams/:id/void-question', ah(async (req, res) => {
    const b = parse(z.object({ questionId: uuidSchema, reason: z.string().trim().min(1).max(300) }), req.body);
    res.json({ recalculated: await voidQuestion(pool, adminOf(req).actor, id(req), b.questionId, b.reason) });
  }));
  r.post('/exams/:id/retake', ah(async (req, res) => {
    const b = parse(z.object({ studentId: uuidSchema, reason: z.string().trim().min(1).max(300) }), req.body);
    await grantRetake(pool, adminOf(req).actor, id(req), b.studentId, b.reason);
    res.status(204).end();
  }));

  /* ── hisobotlar (Excel/PDF) ── */
  const send = (res: import('express').Response, rep: Report, fmt: string) => {
    const isPdf = fmt === 'pdf';
    res.set({
      'Content-Type': isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${rep.baseName}.${isPdf ? 'pdf' : 'xlsx'}"`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    res.send(isPdf ? rep.pdf : rep.xlsx);
  };
  const fmtOf = (req: Request) => parse(z.enum(['xlsx', 'pdf']), req.params.fmt);
  r.get('/exams/:id/report.:fmt', ah(async (req, res) => {
    const q = parse(z.object({ includeKey: z.enum(['0', '1']).default('0') }), req.query);
    send(res, await examReport(pool, adminOf(req).actor, id(req), q.includeKey === '1'), fmtOf(req));
  }));
  r.get('/classes/:id/report.:fmt', ah(async (req, res) => { send(res, await classReport(pool, adminOf(req).actor, id(req)), fmtOf(req)); }));
  r.get('/students/:id/report.:fmt', ah(async (req, res) => { send(res, await studentReport(pool, adminOf(req).actor, id(req)), fmtOf(req)); }));
  r.get('/reports/weekly.:fmt', ah(async (req, res) => {
    const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 7 * 86_400_000);
    send(res, await weeklyReport(pool, adminOf(req).actor, from, to), fmtOf(req));
  }));
  r.get('/reports/codes.:fmt', ah(async (req, res) => {
    const q = parse(z.object({ classId: uuidSchema.optional() }), req.query);
    send(res, await codesReport(pool, adminOf(req).actor, q.classId), fmtOf(req));
  }));

  /* ── Excel (.xlsx) import: xom bayt yuboriladi ── */
  const xlsxBody = express.raw({ type: () => true, limit: '5mb' });
  const xlsxRows = (req: Request): string[][] => {
    const b = req.body as unknown;
    if (!Buffer.isBuffer(b) || b.length === 0) throw badRequest('Fayl bo\'sh');
    try { return readXlsx(b); } catch (e) { throw badRequest(`Excel faylni o'qib bo'lmadi: ${(e as Error).message}`); }
  };
  r.post('/questions/import-xlsx', xlsxBody, ah(async (req, res) => {
    const q = parse(z.object({ commit: z.enum(['0', '1']).default('0') }), req.query);
    res.json(await importQuestions(pool, adminOf(req).actor, rowsToCsv(xlsxRows(req)), q.commit === '1'));
  }));
  r.post('/students/import-xlsx', xlsxBody, ah(async (req, res) => {
    const q = parse(z.object({ classId: uuidSchema, commit: z.enum(['0', '1']).default('0') }), req.query);
    const rows = xlsxRows(req).filter((row) => row.some((c) => (c ?? '').trim() !== ''));
    const first = rows[0]?.[0]?.trim().toLowerCase() ?? '';
    const data = /^(familiya|фамилия|surname|last)/.test(first) ? rows.slice(1) : rows; // 1-ustun: familiya, 2-ustun: ism
    const students = data.map((row) => ({ lastName: (row[0] ?? '').trim(), firstName: (row[1] ?? '').trim() }));
    const body = parse(bulkStudentsSchema, { classId: q.classId, dryRun: q.commit !== '1', students });
    const result = await bulkCreateStudents(pool, cfg, adminOf(req).actor, body);
    res.status(result.dryRun ? 200 : 201).json(result);
  }));

  /* ── yakuniy bosqich: vaqt, ball, xabar, shikoyat, material, zaxira ── */
  r.post('/exams/:id/students/:sid/extra-time', ah(async (req, res) => {
    const b = parse(z.object({ minutes: z.number().int().min(1).max(120), reason: z.string().trim().min(3).max(300) }), req.body);
    res.json(await addExtraTime(pool, adminOf(req).actor, id(req), parse(uuidSchema, req.params.sid), b.minutes, b.reason));
  }));
  r.post('/attempts/:id/adjust-score', ah(async (req, res) => {
    const b = parse(z.object({ score: z.number().min(0).max(100000), reason: z.string().trim().min(3).max(300) }), req.body);
    res.json(await adjustScore(pool, adminOf(req).actor, id(req), b.score, b.reason));
  }));
  r.get('/attempts/:id/adjustments', ah(async (req, res) => { res.json({ items: await listScoreAdjustments(pool, id(req)) }); }));
  r.post('/broadcast', ah(async (req, res) => {
    const b = parse(z.object({ classIds: z.array(uuidSchema).max(50).default([]), studentIds: z.array(uuidSchema).max(500).default([]), text: z.string().trim().min(1).max(1000) }), req.body);
    res.json(await broadcast(pool, adminOf(req).actor, b));
  }));
  registerSchoolAdmin(r, pool);
  registerRolesAdmin(r, pool);
  r.get('/complaints', ah(async (req, res) => {
    const q = parse(z.object({ status: z.enum(['open', 'accepted', 'rejected']).optional() }), req.query);
    res.json({ items: await listComplaints(pool, q.status ?? null) });
  }));
  r.post('/complaints/:id/resolve', ah(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['accepted', 'rejected']), note: z.string().trim().min(3).max(500) }), req.body);
    await resolveComplaint(pool, adminOf(req).actor, id(req), b.status, b.note);
    res.status(204).end();
  }));
  const materialSchema = z.object({
    classId: uuidSchema, topicId: uuidSchema.nullable().optional(), weekLabel: z.string().trim().max(40).nullable().optional(), title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(5000).nullable().optional(), videoUrl: z.string().trim().url().max(500).nullable().optional(), homework: z.string().trim().max(3000).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(), mediaId: uuidSchema.nullable().optional(), isPublished: z.boolean().default(false),
  });
  r.get('/materials', ah(async (_req, res) => { res.json({ items: await listMaterialsAdmin(pool) }); }));
  r.post('/materials', ah(async (req, res) => { res.status(201).json({ id: await saveMaterial(pool, adminOf(req).actor, null, parse(materialSchema, req.body)) }); }));
  r.put('/materials/:id', ah(async (req, res) => { res.json({ id: await saveMaterial(pool, adminOf(req).actor, id(req), parse(materialSchema, req.body)) }); }));
  r.delete('/materials/:id', ah(async (req, res) => { await deleteMaterial(pool, adminOf(req).actor, id(req)); res.status(204).end(); }));
  r.get('/backups', ah(async (_req, res) => { res.json({ items: await listBackups(pool) }); }));

  return r;
}
