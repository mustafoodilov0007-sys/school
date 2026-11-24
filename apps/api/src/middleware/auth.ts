import type { RequestHandler } from 'express';
import type { Config } from '../config';
import type { Pool } from '../db/pool';
import { safeEqual } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';
import { ah } from './common';
import { authenticateAdmin } from '../services/admin-auth';
import { authenticateParent } from '../services/parent-auth';
import { authenticateStudent } from '../services/student-auth';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Bot -> API ichki aloqasi. Kalit doimiy vaqtda solishtiriladi.
 * Productionda proksi (X-Forwarded-For) orqali kelgan so'rovlar rad etiladi: /internal tashqariga ochilmasligi kerak.
 */
export const requireInternal = (cfg: Config): RequestHandler =>
  (req, _res, next) => {
    if (cfg.isProd && req.get('x-forwarded-for')) return next(forbidden());
    const key = req.get('x-internal-key') ?? '';
    if (!key || !safeEqual(key, cfg.internalApiKey)) return next(unauthorized('Ichki kalit noto\'g\'ri'));
    next();
  };

/**
 * CSRF himoyasi (cookie sessiyasi uchun): o'zgartiruvchi so'rovlarda maxsus sarlavha + Origin tekshiruvi.
 * Cookie `SameSite=Strict` bilan birgalikda ishlaydi.
 */
export const csrfGuard = (cfg: Config): RequestHandler =>
  (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('x-requested-with') !== 'pep-admin') return next(forbidden('CSRF tekshiruvi muvaffaqiyatsiz'));
    const origin = req.get('origin');
    if (origin && !cfg.corsOrigins.includes(origin)) return next(forbidden('Ruxsat etilmagan Origin'));
    next();
  };

export const requireAdmin = (cfg: Config, pool: Pool): RequestHandler =>
  ah(async (req, _res, next) => {
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[cfg.adminCookieName];
    if (!token) throw unauthorized();
    const ctx = await authenticateAdmin(pool, cfg, token);
    if (!ctx) throw unauthorized('Sessiya tugagan. Botda /admin orqali qayta kiring');
    req.admin = ctx;
    next();
  });

export const requireStudent = (pool: Pool): RequestHandler =>
  ah(async (req, _res, next) => {
    const h = req.get('authorization') ?? '';
    const m = /^Bearer ([\w-]{20,200})$/.exec(h);
    if (!m) throw unauthorized();
    const ctx = await authenticateStudent(pool, m[1] as string);
    if (!ctx) throw unauthorized('Sessiya tugagan. Mini Appni qayta oching');
    req.student = ctx;
    next();
  });

/** Handler ichida admin kontekstini xavfsiz olish. */
export function adminOf(req: Express.Request) {
  if (!req.admin) throw unauthorized();
  return req.admin;
}
export function studentOf(req: Express.Request) {
  if (!req.student) throw unauthorized();
  return req.student;
}

export const requireParent = (pool: Pool): RequestHandler =>
  ah(async (req, _res, next) => {
    const m = /^Bearer ([\w-]{20,200})$/.exec(req.get('authorization') ?? '');
    if (!m) throw unauthorized();
    const ctx = await authenticateParent(pool, m[1] as string);
    if (!ctx) throw unauthorized('Sessiya tugagan. Mini Appni qayta oching');
    req.parent = ctx;
    next();
  });

export function parentOf(req: Express.Request) {
  if (!req.parent) throw unauthorized();
  return req.parent;
}

/** O'qituvchi faqat quyidagi (usul, yo'l) juftliklariga kira oladi; sinf darajasidagi ruxsat servislarda tekshiriladi. */
const TEACHER_ALLOWED: [string, RegExp][] = [
  ['GET', /^\/(me|dashboard|classes|students)$/],
  ['GET', /^\/(schedule|journal|attendance)\/[\w-]+$/],
  ['POST', /^\/grades$/],
  ['DELETE', /^\/grades\/[\w-]+$/],
  ['PUT', /^\/attendance\/[\w-]+$/],
];
export const teacherGuard: RequestHandler = (req, _res, next) => {
  if (req.admin?.me.role !== 'teacher') return next();
  if (TEACHER_ALLOWED.some(([m, re]) => m === req.method && re.test(req.path))) return next();
  next(forbidden('Bu bo\'lim faqat administrator uchun'));
};
