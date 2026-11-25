# Yakuniy holat — Physics Exam Pro

Bu hujjat master prompt bo'limlari bo'yicha **nima qilingan, nima tekshirilgan, nima qilinmagan**ligini halol ko'rsatadi.

## Tekshiruv darajalari
- **A — foydalanuvchi kompyuterida bajarilgan** (2-bosqichgacha): 20 integratsiya testi + 98 unit test o'tgan.
- **B — bu muhitda bajarilgan:** 137 unit test (shared, api, bot), Excel/PDF fayllari haqiqiy o'quvchilarda ochilgan (openpyxl, poppler), barcha yangi SQL PostgreSQL 16 da `PREPARE` bilan tekshirilgan (99 so'rov), zaxira → tiklash sinovi haqiqiy bajarilgan, tur tekshiruvi (soddalashtirilgan stub bilan).
- **C — yozilgan, lekin ISHGA TUSHIRILMAGAN:** yangi integratsiya testlari (`results.integration`, `final.integration`, `api.integration` ga qo'shilgan test). Bu muhitda `pg` drayveri yo'q. Birinchi ishga tushirish sizda: `npm run test:integration`.
- **D — hech qachon brauzer/Telegramda sinalmagan:** barcha React sahifalar (admin va Mini App), Telegram'ga haqiqiy yuborish, Telegram ichida PDF.

## Bo'limlar bo'yicha holat
| Bo'lim | Holat |
|---|---|
| 3 Bot (ro'yxat, lockout, /admin, bildirishnomalar 24h/30m/boshlanish/natija/bekor, qayta urinish, dedupe) | Bajarilgan (A/B/C) |
| 4 Mini App (bosh sahifa, imtihon, natijalar, profil, KaTeX, offline navbat, rasm, PDF, javoblar varaqasi) | Bajarilgan (D) |
| 5 Vaqt/pauza/qo'shimcha vaqt/bekor qilish | Bajarilgan; qo'shimcha vaqt yangi (C) |
| 6 Javoblarni yo'qotmaslik | Bajarilgan, lekin navbat **IndexedDB emas, localStorage**da |
| 7 Savollar banki (CRUD, nusxa, ommaviy tahrir, filtrlar, CSV+Excel import, rasm, parametrli) | Bajarilgan (C/D) |
| 8 Tasodifiy tanlash | Bajarilgan (A) |
| 9 PDF rejimi | **Qisman:** PDF o'quvchiga ko'rsatiladi (iframe + "Ochish"), javoblar kaliti serverda, alohida javoblar varaqasi = A–D savollar. **PDF.js ishlatilmagan**, PDF ustiga bevosita belgilash yo'q |
| 10 Imtihon yaratish (kalkulyator/formula ruxsati, watermark, hodisa kuzatuvi, chegarasi, reyting) | Bajarilgan |
| 11 Admin panel (dashboard, sinflar, o'quvchilar, savollar, imtihonlar, xabar yuborish, materiallar, shikoyatlar, hisobotlar) | Bajarilgan (D) |
| 12 Jonli monitoring (polling 10 s, heartbeat, signal, shubhali tez bayrog'i natijalarda) | Bajarilgan |
| 13 Natijalar va hisobotlar: Excel + PDF (imtihon, sinf, o'quvchi, haftalik, ID'lar), topshirmaganlar, past natijalar, savol statistikasi, o'quvchi grafigi va mavzular | Bajarilgan; PDF faqat Latin harflari (kirill "?" bo'ladi) |
| 14 Qayta topshirish, yakuniy urinish siyosati, **qo'lda ball (sabab majburiy)** | Bajarilgan (C) |
| 15 Profil va materiallar | Bajarilgan (C/D) |
| 16 Xavfsizlik: initData, CSRF, rate limit (token bo'yicha), fayl turi baytlardan, javob kaliti yashirin, watermark, hodisalar, Telegram yopish tasdig'i, ikki qurilma siyosati | Bajarilgan; skrinshotni to'xtatib bo'lmaydi (hujjatda shunday) |
| 17 Ma'lumotlar bazasi | Bajarilgan (A/B) |
| 18 Zaxira va tiklash | Skript + tiklash sinovi **mahalliy bajarilgan (B)**; Railway'da sinalmagan; boshqa joyga yuborish — qo'lda (docs/BACKUP.md) |
| 19 Testlar | Unit: bor. Integratsiya: A + C. **End-to-end (brauzer) testlar yo'q.** `npm run lint` ishga tushirilmagan |
| 21 Deploy hujjatlari | README, docs/BACKUP.md, docker-compose, Railway bo'limi |

## Ongli og'ishlar
- Prisma o'rniga raw SQL migratsiyalar; mathjs o'rniga o'zimiz yozgan xavfsiz hisoblagich.
- ExcelJS/PDFKit/Multer/Sharp o'rniga bog'liqliksiz `xlsx.ts`, `pdf.ts` (tarmoqsiz muhitda o'rnatib bo'lmadi; fayllar haqiqiy o'quvchilarda tekshirilgan). Rasm **o'lchamga keltirilmaydi** (faqat tur/hajm tekshiriladi, ≤2 MB).
- Fayllar bazada (bytea): oddiy va Railway'ga mos, lekin juda ko'p katta fayl bo'lsa S3 ga ko'chirish kerak.
- Fayllarga imzolangan muddatli URL o'rniga har so'rovda tokenli tekshiruv.

## Qilinmagan / cheklovlar
- PDF.js, PDF ustiga belgilash; rasm optimallashtirish; IndexedDB; ruscha/inglizcha tillar (arxitektura tayyor, matnlar `i18n.ts` da faqat o'zbekcha).
- Mini App'ni `window.focus` hodisalaridan boshqa yo'l bilan kuzatish; "shubhali tez" signal bor (yuqori natija vaqtning 20% idan kamida) — bu isbot emas, faqat admin e'tibori uchun.
- Brauzer e2e testlari (Playwright) va lint.
- Telegram bot orqali zaxira yuborish.

## Birinchi ishga tushirishda
```
npm install
npm run typecheck
npm test
npm run test:integration     # C toifasidagi testlar shu yerda birinchi marta ishlaydi
```
Xato bo'lsa chiqishni yuboring — C toifasidagi testlarning o'zida xato bo'lishi ham mumkin.

## Maktab moduli (migratsiya 0006)
Dars jadvali, elektron jurnal (baholar 1–5), davomat — admin sahifalari va o'quvchi ilovasidagi «Maktab» tabi.
Tekshirilgan: SQL so'rovlari PG16'da PREPARE-ok, typecheck toza. Tekshirilmagan: brauzerda ko'rinish, integratsion test yozilmagan.

## Rollar (migratsiya 0007)
- **Administrator** — ADMIN_TELEGRAM_IDS ro'yxati; hamma narsa.
- **O'qituvchi** — admin paneldagi «O'qituvchilar» sahifasida Telegram ID bilan qo'shiladi, botda /admin orqali kiradi. **Sinf rahbari**: o'z sinfi davomati; **fan o'qituvchisi**: o'z fanidan baho. Ikkalasi faqat biriktirilgan sinflarni ko'radi (server tomonda tekshiriladi: `middleware/auth.ts` teacherGuard + `services/staff.ts` assertClassAccess).
- **Ota-ona** — «Ota-onalar» sahifasida yaratiladi, bir martalik kod (OT-XXXXXX) oladi, Mini App'da kodni kiritadi; farzandining baho/davomat/jadval/natijalarini ko'radi (faqat o'qish, `/api/parent/*`).
- **O'quvchi** — avvalgidek.
- Umumiy dashboard rolga qarab: administratorga to'liq, o'qituvchiga faqat o'z sinflari.
Tekshirilgan: SQL PG16'da PREPARE-ok (45), migratsiya 0001–0007 toza o'tadi, ruxsat qoidalari regex bo'yicha sinalgan, typecheck yangi fayllarda toza. Tekshirilmagan: integratsion test yo'q, brauzerda ko'rinish, haqiqiy Telegram orqali ota-ona kirishi, `tests/roles.test.ts` bu muhitda `pg` yo'qligi sababli ishga tushmadi.

## Ochiq bosh sahifa (migratsiya 0008)
`/welcome` (kirmagan foydalanuvchi shu yerga tushadi): ikki qismli kirish (o'quvchi/ota-ona — Telegram bot; o'qituvchi/administrator — `/admin` buyrug'i), maktab ko'rsatkichlari, **Hafta o'quvchisi** va **Oy o'quvchisi**.
- Ma'lumot: `GET /api/public/home` (loginsiz, 60 soniya keshlanadi). Faqat «Ism F.» + sinf + o'rtacha foiz, faqat e'lon qilingan natijalar.
- Administrator Dashboard'dagi «Ochiq bosh sahifa» tugmasi bilan reytingni o'chira oladi.
- «Telegram botni ochish» tugmasi uchun Railway `api` servisiga `BOT_USERNAME` (masalan `my_physics_bot`) qo'ying.
- Admin domenida `/api/public/*` ham API'ga yo'naltirilishi kerak (deploy/Caddyfile yangilandi; Railway'da admin servisi `/api/admin/*` ni qanday yo'naltirsa, `/api/public/*` ni ham shunday).
- Sahifada `noindex` qoldi: qidiruv tizimlari o'quvchi ismlarini indekslamaydi.
