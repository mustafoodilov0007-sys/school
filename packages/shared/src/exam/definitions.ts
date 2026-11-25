import { z } from 'zod';
import { findUnknownPlaceholders, validateParamSpec } from './params';
import type { ParamSpec } from './params';

/** Savol va imtihon kiritish sxemalari + kesishgan (cross-field) tekshiruvlar. Toza funksiyalar — testlanadi. */

export const QUESTION_TYPES = ['text', 'formula', 'image', 'graph', 'circuit', 'optics', 'vectors', 'table', 'numeric', 'multi'] as const;

const toleranceSchema = z
  .object({ abs: z.number().finite().min(0).optional(), rel: z.number().finite().min(0).max(1).optional() })
  .refine((t) => t.abs !== undefined || t.rel !== undefined, 'abs yoki rel tolerantlik kerak');

const paramSpecSchema = z.object({
  params: z.array(z.object({ name: z.string(), min: z.number().finite(), max: z.number().finite(), step: z.number().finite().positive() })).min(1).max(10),
  constraints: z.array(z.string().max(200)).max(10).optional(),
  answer: z.object({ expr: z.string().min(1).max(200), decimals: z.number().int().min(0).max(6), tolerance: toleranceSchema }),
});

export const questionInputSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  body: z.string().trim().min(1).max(5000),
  explanation: z.string().trim().max(5000).nullable().optional(),
  topicId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  weekLabel: z.string().trim().max(40).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).default(2),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  points: z.number().positive().max(100).default(1),
  options: z.array(z.object({ body: z.string().trim().min(1).max(1000), isCorrect: z.boolean() })).max(10).default([]),
  answerSpec: z.object({ expected: z.number().finite(), tolerance: toleranceSchema }).nullable().optional(),
  paramSpec: paramSpecSchema.nullable().optional(),
  imageMediaId: z.string().uuid().nullable().optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Zod'dan keyingi mazmuniy tekshiruv; xatolar ro'yxati (bo'sh = to'g'ri). */
export function validateQuestion(q: QuestionInput): string[] {
  const errs: string[] = [];
  if (q.type === 'numeric') {
    if (q.options.length > 0) errs.push('Sonli savolda variantlar bo\'lmasligi kerak');
    if (!q.answerSpec && !q.paramSpec) errs.push('Sonli savol uchun javob (answerSpec) yoki parametrlar (paramSpec) kerak');
    if (q.answerSpec && q.paramSpec) errs.push('answerSpec va paramSpec birga berilmaydi');
  } else {
    if (q.answerSpec || q.paramSpec) errs.push('Sonli javob/parametrlar faqat "numeric" turida');
    if (q.options.length < 2) errs.push('Kamida 2 ta variant kerak');
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === 'multi') {
      if (correct < 1) errs.push('Kamida bitta to\'g\'ri variant belgilang');
    } else if (correct !== 1) errs.push('Aynan bitta to\'g\'ri variant bo\'lishi kerak');
    const bodies = q.options.map((o) => o.body.trim().toLowerCase());
    if (new Set(bodies).size !== bodies.length) errs.push('Variantlar takrorlanmasin');
  }
  if (q.paramSpec) {
    const spec = q.paramSpec as ParamSpec;
    errs.push(...validateParamSpec(spec));
    const unknown = findUnknownPlaceholders(q.body, spec);
    if (unknown.length) errs.push(`Matnda e'lon qilinmagan parametr: ${unknown.join(', ')}`);
  } else if (/\{\{\s*[A-Za-z_]\w*\s*\}\}/.test(q.body)) {
    errs.push('Matnda {{parametr}} bor, lekin paramSpec berilmagan');
  }
  return errs;
}

export const examInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.enum(['manual', 'random']).default('manual'),
  classIds: z.array(z.string().uuid()).min(1).max(30),
  weekLabel: z.string().trim().max(40).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  durationMinutes: z.number().int().min(1).max(600),
  questionCount: z.number().int().min(1).max(200).nullable().optional(),
  topicDistribution: z.record(z.string().uuid(), z.number().int().min(1).max(200)).nullable().optional(),
  questionIds: z.array(z.string().uuid()).max(500).default([]),
  passPercent: z.number().min(0).max(100).default(60),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  retakeAllowed: z.boolean().default(false),
  finalAttemptPolicy: z.enum(['last', 'best', 'admin_choice']).default('best'),
  lateSubmitGraceSeconds: z.number().int().min(0).max(60).default(0),
  resultsPolicy: z.enum(['immediate', 'after_end', 'manual']).default('after_end'),
  pdfMediaId: z.string().uuid().nullable().optional(),
  /** PDF rejimi: javoblar kaliti, masalan "ABCDDA" (1-savol A, 2-savol B...). Faqat serverda saqlanadi. */
  pdfAnswerKey: z.string().trim().toUpperCase().regex(/^[A-D]{1,200}$/, 'Kalit faqat A, B, C, D harflaridan iborat bo\'lsin').nullable().optional(),
  allowCalculator: z.boolean().default(false),
  allowFormulaSheet: z.boolean().default(false),
  watermarkEnabled: z.boolean().default(true),
  trackFocusEvents: z.boolean().default(true),
  focusWarnThreshold: z.number().int().min(1).max(20).default(3),
  showRankings: z.boolean().default(false),
});
export type ExamInput = z.infer<typeof examInputSchema>;

export function validateExam(e: ExamInput, now: Date = new Date()): string[] {
  const errs: string[] = [];
  if (e.endsAt.getTime() <= e.startsAt.getTime()) errs.push('Tugash vaqti boshlanishdan keyin bo\'lishi kerak');
  if (e.durationMinutes * 60_000 > e.endsAt.getTime() - e.startsAt.getTime()) {
    errs.push('Davomiylik imtihon oynasidan uzun bo\'lmasligi kerak');
  }
  if (e.pdfAnswerKey) {
    if (!e.pdfMediaId) errs.push('PDF rejimida PDF fayl yuklanishi shart');
    if (e.questionIds.length > 0) errs.push('PDF rejimida savollar bankidan tanlanmaydi');
    if (e.source !== 'manual') errs.push('PDF rejimi tasodifiy tanlashni qo\'llamaydi');
  } else if (e.source === 'manual') {
    if (e.questionIds.length === 0) errs.push('Kamida bitta savol tanlang');
    if (new Set(e.questionIds).size !== e.questionIds.length) errs.push('Savollar takrorlanmasin');
    if (e.questionCount && e.questionCount > e.questionIds.length) errs.push('Savollar soni tanlanganlardan ko\'p bo\'lishi mumkin emas');
  } else {
    if (!e.questionCount) errs.push('Tasodifiy imtihonda savollar soni kerak');
    const sum = Object.values(e.topicDistribution ?? {}).reduce((a, b) => a + b, 0);
    if (e.questionCount && sum > e.questionCount) errs.push('Mavzular bo\'yicha yig\'indi savollar sonidan oshmasin');
  }
  void now;
  return errs;
}

/** Imtihon holati o'tishlari (admin amallari). */
const TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['draft', 'running', 'cancelled'],
  running: ['paused', 'finished', 'cancelled'],
  paused: ['running', 'finished', 'cancelled'],
  finished: [],
  cancelled: [],
};
export const canTransition = (from: string, to: string) => (TRANSITIONS[from] ?? []).includes(to);
