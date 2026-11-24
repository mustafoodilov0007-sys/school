/**
 * Matnlar bir joyda (o'zbek, lotin). Keyinchalik `ru`/`en` lug'atlari shu kalitlar bilan qo'shiladi.
 * Bot parse_mode ishlatmaydi (oddiy matn) — foydalanuvchi ma'lumotlari orqali formatlash buzilmaydi.
 */
export const uz = {
  /* ── bot ── */
  bot_welcome_new:
    'Assalomu alaykum! 👋\nPhysics Exam Pro — fizika fanidan haftalik nazorat imtihonlari boti.\n\nRo\'yxatdan o\'tish uchun sinfingizni tanlang:',
  bot_welcome_back: 'Xush kelibsiz, {name}! Quyidagi menyudan foydalaning.',
  bot_no_classes: 'Hozircha faol sinflar yo\'q. Iltimos, o\'qituvchingizga murojaat qiling.',
  bot_ask_code: '{className} sinfi tanlandi.\n\nO\'qituvchi bergan shaxsiy ID ni yuboring (masalan: PH-8A-0417):',
  bot_code_invalid: 'ID topilmadi yoki noto\'g\'ri. Qolgan urinishlar: {left}.',
  bot_locked: 'Juda ko\'p noto\'g\'ri urinish. {minutes} daqiqadan keyin qayta urinib ko\'ring.',
  bot_confirm_student: 'Siz: {fullName}\nSinf: {className}\n\nMa\'lumotlar to\'g\'rimi?',
  bot_btn_confirm: '✅ Ha, tasdiqlayman',
  bot_btn_cancel: '✖️ Yo\'q',
  bot_cancelled: 'Bekor qilindi. Qaytadan boshlash uchun /start ni yuboring.',
  bot_linked_ok: '✅ Tayyor, {fullName}! Telegram akkauntingiz ID ga bog\'landi.\n\nImtihonlar va natijalar uchun /menu ni bosing.',
  bot_already_linked_self: 'Siz allaqachon ro\'yxatdan o\'tgansiz: {fullName} ({className}).',
  bot_telegram_taken:
    'Bu Telegram akkaunt boshqa ID ga bog\'langan. Bog\'lanishni faqat o\'qituvchi uzishi mumkin.',
  bot_confirm_expired: 'Tasdiqlash muddati tugagan yoki allaqachon ishlatilgan. /start orqali qaytadan urinib ko\'ring.',
  bot_not_registered: 'Avval ro\'yxatdan o\'ting: /start',
  bot_inactive: 'Hisobingiz faol emas. Iltimos, o\'qituvchiga murojaat qiling.',
  bot_menu_title: 'Asosiy menyu',
  bot_btn_open_app: '📱 Mini Appni ochish',
  bot_exams_empty: 'Hozircha sizga e\'lon qilingan imtihonlar yo\'q.',
  bot_results_empty: 'Hozircha natijalaringiz yo\'q.',
  bot_profile: 'Profil\n\nIsm: {firstName}\nFamiliya: {lastName}\nSinf: {className}\nID: {code}',
  bot_help:
    'Buyruqlar:\n/start — ro\'yxatdan o\'tish\n/menu — asosiy menyu\n/exam — imtihonlar\n/results — natijalarim\n/profile — profilim\n/help — yordam\n\nMuammo bo\'lsa, fizika o\'qituvchisiga murojaat qiling.',
  bot_admin_denied: 'Bu buyruq faqat administrator uchun.',
  bot_admin_link:
    'Admin panelga kirish havolasi (5 daqiqa amal qiladi va faqat bir marta ishlaydi). Havolani boshqalarga yubormang:\n{url}',
  bot_admin_button: '🔐 Admin panelga kirish',
  bot_error: 'Kechirasiz, vaqtincha xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.',
  bot_text_hint: 'Buyruqlar ro\'yxati uchun /help ni yuboring.',

  /* ── Mini App ── */
  app_nav_home: 'Bosh sahifa',
  app_nav_exam: 'Imtihon',
  app_nav_results: 'Natijalarim',
  app_nav_profile: 'Profil',
  app_loading: 'Yuklanmoqda…',
  app_retry: 'Qayta urinish',
  app_err_generic: 'Xatolik yuz berdi. Internetni tekshirib, qayta urinib ko\'ring.',
  app_err_not_linked: 'Telegram akkauntingiz hali o\'quvchi ID ga bog\'lanmagan. Botda /start ni yuboring.',
  app_err_inactive: 'Hisobingiz faol emas. O\'qituvchiga murojaat qiling.',
  app_err_expired: 'Sessiya muddati tugadi. Mini Appni yopib, botdan qayta oching.',
  app_err_not_telegram: 'Bu ilova faqat Telegram ichida ochiladi. Botdagi menyu tugmasi orqali kiring.',
  app_hello: 'Salom, {name}!',
  app_class: 'Sinf',
  app_upcoming: 'Eng yaqin imtihon',
  app_no_exams: 'Hozircha e\'lon qilingan imtihonlar yo\'q.',
  app_materials: 'Haftalik materiallar',
  app_no_materials: 'Materiallar hali qo\'shilmagan.',
  app_exam_empty: 'Hozir topshirish uchun faol imtihon yo\'q.',
  app_results_empty: 'Natijalar hali yo\'q. Imtihon topshirganingizdan keyin shu yerda ko\'rinadi.',
  app_profile_id: 'O\'quvchi ID',
  app_profile_linked: 'Telegram bog\'langan',
  app_profile_unlink_note: 'Bog\'lanishni faqat o\'qituvchi uzishi mumkin.',
} as const;

export type MsgKey = keyof typeof uz;

export function t(key: MsgKey, vars: Record<string, string | number> = {}): string {
  return uz[key].replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
