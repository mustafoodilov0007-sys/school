import { t } from '@pep/shared';
import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type { BotApi } from './api-client';
import * as flow from './flow';
import type { FlowCtx, Reply } from './flow';

function keyboard(buttons: NonNullable<Reply['buttons']>): InlineKeyboard {
  const kb = new InlineKeyboard();
  buttons.forEach((row, i) => {
    for (const b of row) {
      if (b.data) kb.text(b.text, b.data);
      else if (b.url) kb.url(b.text, b.url);
      else if (b.webApp) kb.webApp(b.text, b.webApp);
    }
    if (i < buttons.length - 1) kb.row();
  });
  return kb;
}

async function send(ctx: Context, r: Reply): Promise<void> {
  if (r.deleteIncoming && ctx.message) {
    // ID chatda qolmasin (xato bo'lsa — e'tiborsiz)
    await ctx.deleteMessage().catch(() => undefined);
  }
  const markup = r.buttons ? { reply_markup: keyboard(r.buttons) } : {};
  await ctx.reply(r.text, { ...markup, link_preview_options: { is_disabled: true } });
}

export function createBot(opts: { token: string; api: BotApi; studentAppUrl: string; log?: (msg: string, err?: unknown) => void }): Bot {
  const bot = new Bot(opts.token);
  const fctx: FlowCtx = { api: opts.api, studentAppUrl: opts.studentAppUrl };
  const log = opts.log ?? ((m, e) => console.error(m, e));

  // Faqat shaxsiy chat
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await next();
  });

  // Takroriy update'larni o'tkazib yuborish (webhook qayta yuborishi mumkin). Bir martalik qayta ishlash (at-most-once).
  bot.use(async (ctx, next) => {
    const claimed = await opts.api.claimUpdate(ctx.update.update_id);
    if (!claimed) return;
    await next();
  });

  const tg = (ctx: Context) => ctx.from?.id;

  bot.command('start', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleStart(fctx, id));
  });
  bot.command('menu', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleMenu(fctx, id));
  });
  bot.command('exam', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleGated(fctx, id, 'exam'));
  });
  bot.command('results', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleGated(fctx, id, 'results'));
  });
  bot.command('profile', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleProfile(fctx, id));
  });
  bot.command('help', (ctx) => send(ctx, { text: t('bot_help') }));
  bot.command('admin', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleAdmin(fctx, id));
  });

  bot.on('callback_query:data', async (ctx) => {
    const id = tg(ctx);
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => undefined); // takroriy bosishda ham "soat" aylanib qolmasin
    if (!id) return;
    let reply: Reply | null = null;
    if (data.startsWith('cls:')) reply = await flow.handleClassChosen(fctx, id, data.slice(4));
    else if (data.startsWith('ok:')) reply = await flow.handleConfirm(fctx, { id, username: ctx.from.username ?? null }, data.slice(3));
    else if (data === 'no') reply = await flow.handleCancel(fctx, id);
    if (!reply) return;
    // Tugmalarni olib tashlaymiz: bir tugma ikki marta bosilmasin
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await send(ctx, reply);
  });

  bot.on('message:text', async (ctx) => {
    const id = tg(ctx);
    if (id) await send(ctx, await flow.handleText(fctx, id, ctx.message.text));
  });

  bot.catch(async (err) => {
    log('bot xatosi', err.error);
    await err.ctx.reply(t('bot_error')).catch(() => undefined);
  });

  return bot;
}
