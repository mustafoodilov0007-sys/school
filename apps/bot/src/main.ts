import { createServer } from 'node:http';
import { webhookCallback } from 'grammy';
import { createHttpApi } from './api-client';
import { createBot } from './bot';
import { loadBotConfig } from './config';
import { pumpNotifications } from './notify';

const ALLOWED = ['message', 'callback_query'] as const;

async function main() {
  const cfg = loadBotConfig();
  const api = createHttpApi(cfg.API_INTERNAL_URL, cfg.INTERNAL_API_KEY);
  const bot = createBot({ token: cfg.BOT_TOKEN, api, studentAppUrl: cfg.STUDENT_APP_URL });

  await bot.api.setMyCommands([
    { command: 'start', description: 'Boshlash va ro\'yxatdan o\'tish' },
    { command: 'menu', description: 'Asosiy menyu' },
    { command: 'exam', description: 'Imtihonlar' },
    { command: 'results', description: 'Natijalarim' },
    { command: 'profile', description: 'Profil' },
    { command: 'help', description: 'Yordam' },
  ]);
  if (cfg.STUDENT_APP_URL.startsWith('https://')) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Imtihon', web_app: { url: cfg.STUDENT_APP_URL } } });
  } else {
    console.warn('STUDENT_APP_URL https emas — Mini App menyu tugmasi o\'rnatilmadi (Telegram HTTPS talab qiladi)');
  }

  // Bildirishnomalar: har 20 soniyada navbat (outbox) tekshiriladi. API bir nechta bot nusxasida ham xavfsiz (SKIP LOCKED).
  const sender = {
    send: async (telegramId: number, r: { text: string; webApp?: string }) => {
      await bot.api.sendMessage(telegramId, r.text, r.webApp ? { reply_markup: { inline_keyboard: [[{ text: 'Ochish', web_app: { url: r.webApp } }]] } } : {});
    },
  };
  let pumping = false;
  const notifier = setInterval(() => {
    if (pumping) return;
    pumping = true;
    pumpNotifications(api, sender, cfg.STUDENT_APP_URL)
      .catch((e: Error) => console.error('bildirishnoma xatosi:', e.message))
      .finally(() => {
        pumping = false;
      });
  }, 20_000);
  notifier.unref();

  if (cfg.BOT_MODE === 'webhook') {
    await bot.api.setWebhook(cfg.BOT_WEBHOOK_URL, { secret_token: cfg.BOT_WEBHOOK_SECRET, allowed_updates: [...ALLOWED] });
    const handle = webhookCallback(bot, 'http', { secretToken: cfg.BOT_WEBHOOK_SECRET });
    const path = new URL(cfg.BOT_WEBHOOK_URL).pathname;
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === path) {
        handle(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500).end();
        });
      } else if (req.url === '/healthz') {
        res.writeHead(200).end('ok');
      } else {
        res.writeHead(404).end();
      }
    });
    server.listen(cfg.BOT_PORT, () => console.log(`Bot webhook rejimida: :${cfg.BOT_PORT}${path}`));
    const stop = () => server.close(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } else {
    await bot.api.deleteWebhook(); // polling bilan webhook bir vaqtda ishlamaydi
    const stop = () => void bot.stop();
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    await bot.start({ allowed_updates: [...ALLOWED], onStart: (me) => console.log(`Bot @${me.username} polling rejimida ishga tushdi`) });
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
