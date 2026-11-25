import { t } from '@pep/shared';
import type { BotApi } from './api-client';

/** Telegramga bog'liq bo'lmagan javob tavsifi — grammY qatlami uni yuboradi. Shuning uchun mantiq testlanadi. */
export interface Button {
  text: string;
  data?: string;
  url?: string;
  webApp?: string;
}
export interface Reply {
  text: string;
  buttons?: Button[][];
  /** foydalanuvchi yuborgan xabarni (ID) o'chirishga urinish */
  deleteIncoming?: boolean;
}

export interface FlowCtx {
  api: BotApi;
  studentAppUrl: string;
}

const fullName = (s: { firstName: string; lastName: string }) => `${s.lastName} ${s.firstName}`;
const isHttps = (u: string) => u.startsWith('https://');

export function menuReply(ctx: FlowCtx, text: string): Reply {
  const buttons: Button[][] = [];
  // Telegram Mini App tugmasi faqat HTTPS bilan ishlaydi
  if (isHttps(ctx.studentAppUrl)) buttons.push([{ text: t('bot_btn_open_app'), webApp: ctx.studentAppUrl }]);
  return buttons.length ? { text, buttons } : { text };
}

export async function handleStart(ctx: FlowCtx, tgId: number): Promise<Reply> {
  const me = await ctx.api.studentByTelegram(tgId);
  if (me) {
    if (!me.isActive) return { text: t('bot_inactive') };
    return menuReply(ctx, t('bot_welcome_back', { name: me.firstName }));
  }
  const classes = await ctx.api.classes();
  if (classes.length === 0) return { text: t('bot_no_classes') };
  await ctx.api.putState(tgId, 'choose_class', {});
  return {
    text: t('bot_welcome_new'),
    buttons: classes.map((c) => [{ text: c.name, data: `cls:${c.id}` }]),
  };
}

export async function handleClassChosen(ctx: FlowCtx, tgId: number, classId: string): Promise<Reply> {
  const me = await ctx.api.studentByTelegram(tgId);
  if (me) return { text: t('bot_already_linked_self', { fullName: fullName(me), className: me.className }) };
  const cls = (await ctx.api.classes()).find((c) => c.id === classId);
  if (!cls) return { text: t('bot_error') };
  await ctx.api.putState(tgId, 'enter_code', { classId, className: cls.name });
  return { text: t('bot_ask_code', { className: cls.name }) };
}

/** Oddiy matn xabari: faqat "ID kutilmoqda" holatida ID sifatida qabul qilinadi. */
export async function handleText(ctx: FlowCtx, tgId: number, text: string): Promise<Reply> {
  const state = await ctx.api.getState(tgId);
  if (!state || state.step !== 'enter_code' || typeof state.data.classId !== 'string') {
    return { text: t('bot_text_hint') };
  }
  const r = await ctx.api.lookup({ telegramId: tgId, classId: state.data.classId, code: text });
  switch (r.status) {
    case 'already_linked':
      await ctx.api.deleteState(tgId);
      return { text: t('bot_already_linked_self', { fullName: fullName(r.student), className: r.student.className }), deleteIncoming: true };
    case 'locked':
      return { text: t('bot_locked', { minutes: Math.max(1, Math.ceil(r.retryAfterSeconds / 60)) }), deleteIncoming: true };
    case 'invalid':
      return { text: t('bot_code_invalid', { left: r.attemptsLeft }), deleteIncoming: true };
    case 'found':
      await ctx.api.putState(tgId, 'confirm', { token: r.confirmToken });
      return {
        text: t('bot_confirm_student', { fullName: fullName(r.student), className: r.student.className }),
        deleteIncoming: true,
        buttons: [[
          { text: t('bot_btn_confirm'), data: `ok:${r.confirmToken}` },
          { text: t('bot_btn_cancel'), data: 'no' },
        ]],
      };
  }
}

export async function handleConfirm(ctx: FlowCtx, tg: { id: number; username: string | null }, token: string): Promise<Reply> {
  const r = await ctx.api.confirm({ telegramId: tg.id, username: tg.username, token });
  switch (r.status) {
    case 'linked':
      return menuReply(ctx, t('bot_linked_ok', { fullName: fullName(r.student) }));
    case 'telegram_taken':
      return { text: t('bot_telegram_taken') };
    case 'expired':
      return { text: t('bot_confirm_expired') };
  }
}

export async function handleCancel(ctx: FlowCtx, tgId: number): Promise<Reply> {
  await ctx.api.deleteState(tgId);
  return { text: t('bot_cancelled') };
}

export async function handleProfile(ctx: FlowCtx, tgId: number): Promise<Reply> {
  const me = await ctx.api.studentByTelegram(tgId);
  if (!me) return { text: t('bot_not_registered') };
  if (!me.isActive) return { text: t('bot_inactive') };
  return { text: t('bot_profile', { firstName: me.firstName, lastName: me.lastName, className: me.className, code: me.code }) };
}

/** /exam va /results: 1-bosqichda imtihonlar moduli yo'q — bazada e'lon qilingan imtihon ham yo'q. */
export async function handleGated(ctx: FlowCtx, tgId: number, kind: 'exam' | 'results'): Promise<Reply> {
  const me = await ctx.api.studentByTelegram(tgId);
  if (!me) return { text: t('bot_not_registered') };
  if (!me.isActive) return { text: t('bot_inactive') };
  return menuReply(ctx, kind === 'exam' ? t('bot_exams_empty') : t('bot_results_empty'));
}

export async function handleMenu(ctx: FlowCtx, tgId: number): Promise<Reply> {
  const me = await ctx.api.studentByTelegram(tgId);
  if (!me) return { text: t('bot_not_registered') };
  if (!me.isActive) return { text: t('bot_inactive') };
  return menuReply(ctx, t('bot_menu_title'));
}

export async function handleAdmin(ctx: FlowCtx, tgId: number): Promise<Reply> {
  const link = await ctx.api.adminLoginLink(tgId);
  if (!link) return { text: t('bot_admin_denied') };
  // Telegram inline URL tugmasi http://localhost ni qabul qilmaydi — lokal rejimda havola matn ichida
  if (isHttps(link.url)) {
    return { text: t('bot_admin_link', { url: '' }).trimEnd(), buttons: [[{ text: t('bot_admin_button'), url: link.url }]] };
  }
  return { text: t('bot_admin_link', { url: link.url }) };
}
