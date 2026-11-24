import { z } from 'zod';

const csv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const bool = z
  .enum(['true', 'false', ''])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL kerak'),
    BOT_TOKEN: z.string().regex(/^\d+:[\w-]{20,}$/, 'BOT_TOKEN @BotFather formatida bo\'lishi kerak (123456:ABC...)'),
    INTERNAL_API_KEY: z.string().min(32, 'INTERNAL_API_KEY kamida 32 belgi bo\'lsin'),
    ADMIN_TELEGRAM_IDS: z
      .string()
      .transform(csv)
      .pipe(z.array(z.coerce.number().int().positive().safe()).min(1, 'ADMIN_TELEGRAM_IDS kamida bitta ID')),
    STUDENT_APP_URL: z.string().url(),
    ADMIN_WEB_URL: z.string().url(),
    BOT_USERNAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().regex(/^@?[A-Za-z0-9_]{4,32}$/).optional()),
    CORS_ORIGINS: z.string().default('').transform(csv),
    STUDENT_SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(12),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(8),
    INITDATA_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
    ADMIN_LOGIN_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    STUDENT_CODE_PREFIX: z.string().regex(/^[A-Z0-9]{1,8}$/, 'STUDENT_CODE_PREFIX: 1-8 ta katta harf/raqam').default('PH'),
    STUDENT_CODE_SUFFIX_LENGTH: z.coerce.number().int().min(4).max(8).default(4),
    ALLOW_DEV_AUTH: bool,
    DEV_STUDENT_TELEGRAM_ID: z.string().default(''),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production') {
      if (e.ALLOW_DEV_AUTH) {
        ctx.addIssue({ code: 'custom', path: ['ALLOW_DEV_AUTH'], message: 'Productionda ALLOW_DEV_AUTH=true taqiqlangan' });
      }
      for (const k of ['STUDENT_APP_URL', 'ADMIN_WEB_URL'] as const) {
        if (!e[k].startsWith('https://')) {
          ctx.addIssue({ code: 'custom', path: [k], message: `Productionda ${k} https:// bilan boshlanishi shart` });
        }
      }
    }
    if (e.ALLOW_DEV_AUTH && !/^\d+$/.test(e.DEV_STUDENT_TELEGRAM_ID)) {
      ctx.addIssue({ code: 'custom', path: ['DEV_STUDENT_TELEGRAM_ID'], message: 'ALLOW_DEV_AUTH=true bo\'lsa DEV_STUDENT_TELEGRAM_ID (raqam) kerak' });
    }
  });

export interface Config {
  env: 'development' | 'test' | 'production';
  isProd: boolean;
  logLevel: string;
  port: number;
  trustProxy: number;
  databaseUrl: string;
  botToken: string;
  internalApiKey: string;
  adminTelegramIds: number[];
  studentAppUrl: string;
  adminWebUrl: string;
  botUsername: string | null;
  corsOrigins: string[];
  studentSessionTtlHours: number;
  adminSessionTtlHours: number;
  initDataMaxAgeSeconds: number;
  adminLoginTokenTtlSeconds: number;
  studentCodePrefix: string;
  studentCodeSuffixLength: number;
  allowDevAuth: boolean;
  devStudentTelegramId: number | null;
  adminCookieName: string;
}

const origin = (u: string) => new URL(u).origin;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = envSchema.safeParse(env);
  if (!r.success) {
    // Qiymatlar (sirlar) chiqarilmaydi — faqat o'zgaruvchi nomi va muammo
    const lines = r.error.issues.map((i) => ` - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Muhit sozlamalari noto'g'ri:\n${lines.join('\n')}`);
  }
  const e = r.data;
  const isProd = e.NODE_ENV === 'production';
  const origins = new Set<string>([origin(e.STUDENT_APP_URL), origin(e.ADMIN_WEB_URL), ...e.CORS_ORIGINS.map(origin)]);
  return {
    env: e.NODE_ENV,
    isProd,
    logLevel: e.LOG_LEVEL,
    port: e.PORT,
    trustProxy: e.TRUST_PROXY,
    databaseUrl: e.DATABASE_URL,
    botToken: e.BOT_TOKEN,
    internalApiKey: e.INTERNAL_API_KEY,
    adminTelegramIds: e.ADMIN_TELEGRAM_IDS,
    studentAppUrl: e.STUDENT_APP_URL.replace(/\/$/, ''),
    adminWebUrl: e.ADMIN_WEB_URL.replace(/\/$/, ''),
    botUsername: e.BOT_USERNAME ? e.BOT_USERNAME.replace(/^@/, '') : null,
    corsOrigins: [...origins],
    studentSessionTtlHours: e.STUDENT_SESSION_TTL_HOURS,
    adminSessionTtlHours: e.ADMIN_SESSION_TTL_HOURS,
    initDataMaxAgeSeconds: e.INITDATA_MAX_AGE_SECONDS,
    adminLoginTokenTtlSeconds: e.ADMIN_LOGIN_TOKEN_TTL_SECONDS,
    studentCodePrefix: e.STUDENT_CODE_PREFIX,
    studentCodeSuffixLength: e.STUDENT_CODE_SUFFIX_LENGTH,
    allowDevAuth: e.ALLOW_DEV_AUTH,
    devStudentTelegramId: e.DEV_STUDENT_TELEGRAM_ID ? Number(e.DEV_STUDENT_TELEGRAM_ID) : null,
    adminCookieName: isProd ? '__Host-pep_admin' : 'pep_admin',
  };
}
