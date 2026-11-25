# Arxitektura (1-bosqich)

## 1. Umumiy ko'rinish

```
Telegram ──► bot (grammY) ──HTTP, X-Internal-Key──► API (Express) ──► PostgreSQL
Mini App (React) ──Bearer sessiya──────────────────►  │
Admin web (React) ──HttpOnly cookie + CSRF────────────┘
```

- **Bot — yupqa qatlam.** Biznes mantiq (ID tekshiruvi, bloklash, bog'lash) faqat API'da; bot `/internal/*` orqali chaqiradi. Shunda mantiq bitta joyda, bot bazaga to'g'ridan-to'g'ri kirmaydi.
- **ORM o'rniga `pg` + SQL migratsiyalar.** Sabab: tranzaksiya, `ON CONFLICT`, advisory lock, partial unique index kabi imtihon yaxlitligi uchun muhim imkoniyatlar ochiq va tekshiriladigan SQL'da (Prisma partial indekslarni migratsiya diffida yo'qotishi mumkin). Migratsiya fayllari checksum bilan himoyalangan.
- **Monorepo, TypeScript manba bevosita ulashiladi** (`@pep/shared` build talab qilmaydi); API/bot `tsup` bilan bundle qilinadi.

## 2. Autentifikatsiya

| Kim | Qanday | Saqlash |
|---|---|---|
| O'quvchi (Mini App) | `initData` HMAC (`WebAppData`+bot token) serverda tekshiriladi, `auth_date` ≤ 15 daq (sozlanadi), kelajakdagi sana rad etiladi → 12 soatlik sessiya tokeni | Token xotirada (localStorage emas); bazada faqat SHA-256 |
| Admin | Telegram ID `ADMIN_TELEGRAM_IDS` ro'yxatida bo'lishi shart → `/admin` bir martalik (5 daq) havola, token URL **fragmentida** → `HttpOnly; SameSite=Strict; Secure` cookie (productionda `__Host-` prefiksi) | Bazada SHA-256; ro'yxatdan chiqarilgan admin sessiyasi darhol yaroqsiz |
| Bot → API | `X-Internal-Key` (doimiy vaqtli solishtirish); productionda `X-Forwarded-For` bor so'rovlar rad etiladi; Caddy `/internal` ni umuman proksilamaydi | `.env` |

CSRF (admin): o'zgartiruvchi so'rovlarda `X-Requested-With: pep-admin` + `Origin` ro'yxati + `SameSite=Strict`.
Har so'rovda o'quvchi holati qayta o'qiladi: faolsizlantirilgan yoki bog'lanishi uzilgan o'quvchi sessiyasi darhol ishlamaydi (uzishda sessiyalar bekor qilinadi).

## 3. Ro'yxatdan o'tish va bloklash

1. `lookup`: bitta tranzaksiya, Telegram ID bo'yicha `pg_advisory_xact_lock` (poyga/takroriy xabarlar ketma-ketlashadi) → bloklash holati `login_attempts` dan toza funksiya `evaluateLockout` bilan hisoblanadi (5 ketma-ket xato → 600 s) → ID sinf bo'yicha qidiriladi.
2. "Topilmadi", "band" va "faol emas" **bir xil javob** beradi (ID taxmin qilish orqali ma'lumot sizmaydi). ID xom holda saqlanmaydi: `HMAC(INTERNAL_API_KEY, kod)`; loglarda maskalanadi (`PH-8A-****`).
3. `confirm`: bir martalik token (bazada hash, 10 daq), bitta atomik `UPDATE … WHERE telegram_id IS NULL`; takroriy callback xato bermaydi va ikki marta bog'lamaydi. DB `UNIQUE(telegram_id)` — oxirgi himoya.
4. Bot holati (`bot_states`) va Telegram `update_id` (`processed_updates`) bazada — bot qayta ishga tushsa/bir nechta nusxa bo'lsa ham holat yo'qolmaydi, update ikki marta qayta ishlanmaydi (at-most-once).

## 4. Ma'lumotlar yaxlitligi

- Barcha vaqtlar `timestamptz` (UTC); interfeysda `Asia/Tashkent`.
- `audit_logs` — trigger bilan **faqat qo'shish** (UPDATE/DELETE rad etiladi). Admin amallari audit bilan **bir tranzaksiyada** yoziladi.
- Bir imtihonda bitta faol urinish — `attempts_one_active_uq` (partial unique index) — 2-bosqichda ishlatiladi, hozirdan sinalgan.
- Test va production ma'lumotlari ajratilgan: integratsiya testlar faqat `_test` nomli bazada ishlaydi.

## 5. Spetsifikatsiyaga qo'shilgan yaxshilanishlar

Spetsifikatsiyada bo'lmagan yoki aniqlashtirilishi kerak bo'lgan, men to'ldirgan joylar:

1. **Admin web uchun kirish mexanizmi** spetsifikatsiyada yo'q edi (faqat "xavfsiz sessiya") — Telegram orqali bir martalik havola.
2. **Admin huquqini bekor qilish**: ro'yxatdan olib tashlash sessiyani darhol yaroqsiz qiladi.
3. **Yangi ID berish** (ID sizib chiqsa) va **sabab majburiy** bo'lgan Telegram uzish/ID almashtirish — auditga yoziladi.
4. **Update dedupe** (`processed_updates`) va **bot holati bazada** (webhook qayta yuborishi, qayta ishga tushish).
5. **Foydalanuvchi yuborgan ID xabari chatdan o'chiriladi** (bot huquqi bo'lsa).
6. **Kirill o'xshash harflar** (`А`, `Р`, `Н` …) ID va sinf nomida lotinga o'giriladi — o'qituvchi/o'quvchi kirillda yozsa ham ishlaydi.
7. **CSV formula in'ektsiyasidan himoya** (`=`, `+`, `-`, `@`), ismlarga qat'iy belgilar ro'yxati.
8. **Konfiguratsiya validatsiyasi**: productionda `ALLOW_DEV_AUTH`, http URL, qisqa kalit — server ishga tushmaydi; xato matnida sirlar chiqmaydi.
9. **Sessiyalar, tokenlar, urinishlar, update'lar uchun soatlik tozalash** (`housekeeping`).

## 6. ID xavfsizligi: ochiq xavf

ID formati `PH-8A-0417` — sinf ichida **faqat 10 000 ta** raqam. Bloklash **bitta Telegram akkaunt** uchun (5 urinish / 10 daq). Hujumchi ko'p akkaunt ochsa, bitta sinfning ID larini taxmin qilish nazariy jihatdan mumkin (sinfda 30 o'quvchi bo'lsa, tasodifiy urinish muvaffaqiyat ehtimoli ≈ 0,3% har urinishda). Oqibati: begona o'quvchining ismi ko'rinadi va **u hali bog'lanmagan bo'lsa**, hujumchi uning o'rniga bog'lanishi mumkin.

Choralar: (a) `STUDENT_CODE_SUFFIX_LENGTH=6` (1 000 000 ta; tavsiya etiladi — lekin ID uzunroq bo'ladi); (b) o'qituvchi ID larni sinfda bog'lanish tugagach tekshiradi — dashboardda "bog'lanmagan" soni va audit; (c) 2-bosqichdan oldin global tezlik cheklovi qo'shish mumkin. Standart qiymat spetsifikatsiyaga mos (4) qoldirilgan — qaror sizniki.

## 7. Ma'lum cheklovlar

- Bot update'lari **at-most-once**: qayta ishlash paytida jarayon o'lsa, o'sha xabar yo'qoladi (foydalanuvchi qayta yuboradi). Ro'yxatdan o'tish uchun maqbul; bildirishnomalar (4-bosqich) alohida idempotent outbox bilan quriladi.
- `initData` takror ishlatilishi sessiya yaratadi (faqat egasi uchun, muddati 15 daq); alohida "bir martalik" nazorat qo'shilmagan.
- Telegram skrinshotni bloklab bo'lmaydi — watermark va hodisalar 4-bosqichda; ular dalil, aybdorlik isboti emas.
