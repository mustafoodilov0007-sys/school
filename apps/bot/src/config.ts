import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BOT_TOKEN: z.string().regex(/^\d+:[\w-]{20,}$/, 'BOT_TOKEN @BotFather formatida bo\'lishi kerak'),
  INTERNAL_API_KEY: z.string().min(32, 'INTERNAL_API_KEY kamida 32 belgi'),
  API_INTERNAL_URL: z.string().url().default('http://localhost:3000'),
  STUDENT_APP_URL: z.string().url(),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  BOT_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  BOT_WEBHOOK_URL: z.string().default(''),
  BOT_WEBHOOK_SECRET: z.string().default(''),
});

export type BotConfig = z.infer<typeof schema>;

export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const r = schema.safeParse(env);
  if (!r.success) {
    throw new Error(`Bot sozlamalari noto'g'ri:\n${r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  const c = r.data;
  if (c.BOT_MODE === 'webhook') {
    if (!c.BOT_WEBHOOK_URL.startsWith('https://')) throw new Error('webhook rejimida BOT_WEBHOOK_URL https:// bilan boshlanishi kerak');
    if (!/^[\w-]{24,256}$/.test(c.BOT_WEBHOOK_SECRET)) throw new Error('BOT_WEBHOOK_SECRET: 24+ belgi, faqat A-Z a-z 0-9 _ -');
  }
  return { ...c, API_INTERNAL_URL: c.API_INTERNAL_URL.replace(/\/$/, ''), STUDENT_APP_URL: c.STUDENT_APP_URL.replace(/\/$/, '') };
}
