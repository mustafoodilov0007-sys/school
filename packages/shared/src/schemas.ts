import { z } from 'zod';
import { normalizeClassLabel } from './student-code';

/* ───────── umumiy bo'laklar ───────── */

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’ʻʼ`.\- ]*$/u;

export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'Ism/familiya bo\'sh bo\'lmasligi kerak')
  .max(80, 'Juda uzun (maksimum 80 belgi)')
  .regex(NAME_RE, 'Faqat harflar, bo\'sh joy, defis va apostrof ruxsat etiladi')
  .transform((s) => s.replace(/\s+/g, ' '));

export const classNameSchema = z
  .string()
  .trim()
  .min(1, 'Sinf nomi bo\'sh bo\'lmasligi kerak')
  .max(40)
  .refine((n) => normalizeClassLabel(n) !== null, 'Sinf nomi harf/raqamdan iborat bo\'lsin (masalan: 8-A, 10 B)');

export const uuidSchema = z.string().uuid();
const telegramIdSchema = z.number().int().positive().safe();
const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/* ───────── admin ───────── */

export const createClassSchema = z.object({ name: classNameSchema });
export const updateClassSchema = z
  .object({ name: classNameSchema.optional(), isArchived: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isArchived !== undefined, 'Hech narsa o\'zgartirilmadi');

export const createStudentSchema = z.object({
  classId: uuidSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
});

export const bulkStudentsSchema = z.object({
  classId: uuidSchema,
  dryRun: z.boolean().default(false),
  students: z
    .array(z.object({ firstName: personNameSchema, lastName: personNameSchema }))
    .min(1, 'Kamida bitta o\'quvchi kerak')
    .max(300, 'Bir martada ko\'pi bilan 300 ta'),
});

export const updateStudentSchema = z
  .object({ firstName: personNameSchema.optional(), lastName: personNameSchema.optional() })
  .refine((v) => v.firstName !== undefined || v.lastName !== undefined, 'Hech narsa o\'zgartirilmadi');

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Sabab kiritish majburiy (kamida 3 belgi)').max(300),
});

export const optionalReasonSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const listStudentsQuerySchema = z.object({
  classId: uuidSchema.optional(),
  q: z.string().trim().max(80).optional(),
  linked: boolQuery.optional(),
  active: boolQuery.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const listClassesQuerySchema = z.object({ includeArchived: boolQuery.optional() });

export const exchangeLoginTokenSchema = z.object({ token: z.string().min(20).max(200) });
export const devAdminLoginSchema = z.object({ telegramId: telegramIdSchema });

/* ───────── o'quvchi (Mini App) ───────── */

export const studentTelegramAuthSchema = z.object({
  initData: z.string().min(1).max(4096),
  deviceId: z.string().min(8).max(100).optional(),
});
export const studentDevAuthSchema = z.object({ dev: z.literal(true), deviceId: z.string().min(8).max(100).optional() });

/* ───────── ichki (bot → api) ───────── */

export const registrationLookupSchema = z.object({
  telegramId: telegramIdSchema,
  classId: uuidSchema,
  code: z.string().min(1).max(120),
});
export const registrationConfirmSchema = z.object({
  telegramId: telegramIdSchema,
  username: z.string().max(64).nullish(),
  token: z.string().min(20).max(200),
});
export const adminLoginLinkSchema = z.object({ telegramId: telegramIdSchema });
export const claimUpdateSchema = z.object({ updateId: z.number().int().nonnegative().safe() });
export const botStateSchema = z.object({
  step: z.string().min(1).max(40),
  data: z.record(z.string(), z.unknown()).default({}),
});

/* ───────── DTO turlari (javoblar) ───────── */

export interface ClassDto {
  id: string;
  name: string;
  codeLabel: string;
  isArchived: boolean;
  studentCount: number;
  createdAt: string;
}

export interface StudentDto {
  id: string;
  classId: string;
  className: string;
  firstName: string;
  lastName: string;
  code: string;
  isLinked: boolean;
  telegramUsername: string | null;
  telegramLinkedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/** O'quvchining o'z profili — ID kodi bor, boshqa o'quvchilar haqida ma'lumot yo'q. */
export interface StudentMeDto {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  code: string;
  telegramLinkedAt: string | null;
}

export interface AdminMeDto {
  id: string;
  telegramId: number;
  displayName: string | null;
  role: 'admin' | 'teacher';
}

export interface AuditLogDto {
  id: string;
  actorType: 'admin' | 'student' | 'system';
  actorTelegramId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface DashboardDto {
  role: 'admin' | 'teacher';
  overview: {
    teachers: number | null;
    parents: { total: number; linked: number } | null;
    attendanceToday: { present: number; absent: number; late: number; excused: number; marked: number; expected: number };
    avgGrade30: number | null;
    gradeCount30: number;
    upcomingExams: { id: string; title: string; startsAt: string; status: string }[];
  };
  classes: number;
  students: { total: number; active: number; linked: number; unlinked: number };
  recentAudit: AuditLogDto[];
  system: { dbOk: boolean; serverTime: string; lastBackupAt: string | null; lastBackupStatus: string | null };
}

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type BulkStudentsInput = z.infer<typeof bulkStudentsSchema>;

// ───────────── 2-bosqich: urinishlar ─────────────
export const saveAnswerSchema = z.object({
  clientOpId: z.string().uuid(),
  attemptQuestionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().uuid()).max(12).default([]),
  numericValue: z.number().finite().nullable().default(null),
  isFlagged: z.boolean().default(false),
  baseVersion: z.number().int().min(0).optional(),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
