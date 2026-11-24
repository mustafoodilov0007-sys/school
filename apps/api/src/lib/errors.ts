import { ErrorCode } from '@pep/shared';
import type { ZodError, ZodTypeAny, z } from 'zod';

type Code = ErrorCode;

export class AppError extends Error {
  readonly status: number;
  readonly code: Code;
  readonly details?: unknown;
  constructor(status: number, code: Code, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, ErrorCode.VALIDATION, message, details);
export const unauthorized = (message = 'Tizimga kirish talab qilinadi', code: Code = ErrorCode.UNAUTHENTICATED) =>
  new AppError(401, code, message);
export const forbidden = (message = 'Bu amal uchun ruxsat yo\'q', code: Code = ErrorCode.FORBIDDEN) => new AppError(403, code, message);
export const notFound = (message = 'Topilmadi') => new AppError(404, ErrorCode.NOT_FOUND, message);
export const conflict = (message: string, details?: unknown) => new AppError(409, ErrorCode.CONFLICT, message, details);

function issues(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Kiruvchi ma'lumotni Zod bilan tekshiradi; xato bo'lsa 400 VALIDATION. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('Kiritilgan ma\'lumotlar noto\'g\'ri', issues(r.error));
  return r.data;
}

/** pg unique_violation (23505), ixtiyoriy constraint nomi bo'yicha. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as { code?: string; constraint?: string };
  return x.code === '23505' && (constraint === undefined || x.constraint === constraint);
}
