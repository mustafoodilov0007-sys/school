# 2-bosqich holati (qisman: toza mantiq + migratsiya)

## Yozilgan va tekshirilgan
- `packages/shared/src/exam/`: `random` (Fisher–Yates), `select-questions` (ko'rilmagan savollar ustuvor, takrorsiz, mavzu bo'yicha taqsimot, yetishmasa ogohlantirish), `scoring` (butun sent hisobi, bekor qilingan savollar chiqariladi, raqamli javob tolerantligi), `deadline` (faqat server vaqti, pauza siljishi, kechikish "grace" ≤ 60 s), `expr` (xavfsiz ifoda hisoblagich, mathjs o'rniga — oq ro'yxat, `eval` yo'q), `params` (parametrli savollar, `{{nom}}` shablon).
- 26 ta birlik test — o'tdi (lokal harness orqali, haqiqiy Vitest emas).
- `db/migrations/0003_stage2.sql` (`exams.source`, `exams.topic_distribution`, `retake_grants`) + cheklov testlari — haqiqiy PostgreSQL 16 da o'tdi. Jami 1-bosqichdagi barcha birlik testlar ham o'tdi.

## O'quvchi tomoni API (yozildi; qisman tekshirilgan)
- `apps/api/src/services/attempts.ts`: urinishni boshlash (faol urinishni davom ettirish, qayta topshirish ruxsati, tasodifiy/qo'lda tanlash, variant tartibi va parametrlar bazaga yoziladi), javob saqlash (`client_op_id` idempotentligi, versiya konflikti, deadline'dan keyin rad), yakunlash/baholash (idempotent; `timeout` da vaqt = deadline), yakuniy urinish siyosati, muddati o'tganlarni 30 s da yakunlash.
- Marshrutlar: `GET /api/student/exams`, `POST /exams/:id/start`, `GET /attempts/:id`, `PUT /attempts/:id/answers`, `POST /attempts/:id/finish`.
- Tekshirildi: barcha SQL so'rovlar haqiqiy PG16 da bajarildi; tip tekshiruvi (soddalashtirilgan stublar bilan) o'tdi.
- TEKSHIRILMAGAN: servis kodining o'zi `pg` bilan ishlatilmagan (paket o'rnatib bo'lmaydi); integratsiya testlari yozilmagan; poyga holatlari (parallel start/saqlash) faqat dizayn bo'yicha.

## Admin API (yozildi; qisman tekshirilgan)
- `packages/shared/src/exam/definitions.ts`: savol/imtihon Zod sxemalari + mazmuniy tekshiruvlar (single/multi/numeric qoidalari, parametrlar, tasodifiy imtihon taqsimoti, holat o'tishlari). 10 ta test o'tdi.
- `services/question-bank.ts`: yaratish, tahrirlash (ishlatilgan savol tahrirlanmaydi — arxivlab yangisi yaratiladi), arxiv, filtr/qidiruv.
- `services/exams.ts`: yaratish, holat o'tishlari (sabab majburiy: pauza/bekor), pauzada deadline va imtihon oynasi surilishi, avtomatik scheduled→running→finished, savolni bekor qilish + qayta hisoblash, qayta topshirish ruxsati. Hammasi auditga yoziladi.
- Marshrutlar: `/api/admin/questions*`, `/api/admin/exams*`.
- Tekshirildi: asosiy SQL (bekor qilish qayta hisobi, pauza surilishi, holat yangilash, retake) haqiqiy PG16 da; tip tekshiruvi.
- Integratsiya testi `apps/api/tests/exam.integration.test.ts` yozildi (8 ssenariy) — foydalanuvchi mashinasida ishga tushirilishi kutilmoqda.

## Mini App imtihon ekrani (yozildi; brauzerda TEKSHIRILMAGAN)
- `ExamPage` (imtihonlar ro'yxati, boshlash/davom ettirish), `Attempt` (savollar paneli, variantlar/sonli javob, belgilash, taymer, yakunlash oynasi), `MathText` (KaTeX, `trust:false`).
- Taymer server soatiga nisbatan siljish bilan; vaqt tugasa avtomatik yakunlanadi. Javoblar `AnswerSync` orqali: navbat localStorage da (IndexedDB emas — hajm kichik), tarmoq xatosida eksponensial qayta urinish, pauzada javoblar saqlanib davom ettirilganda yuboriladi, deadline'dan keyingi javob rad.
- Natija siyosati: faqat `immediate` bo'lsa ball yakunlashdan keyin ko'rsatiladi.
- Toza mantiq (`answer-queue`, `clock`, `math-text`) 11 ta test bilan tekshirilgan. React kodi: sintaksis va yumshoq stub bilan tip tekshiruvi; haqiqiy `tsc` va brauzer sizda.
- Bilingan cheklov: `focus/blur` hodisalari, ekran yozib olishdan himoya hali yo'q (3–4-bosqich); `Natijalarim` sahifasi hali bo'sh.

## Admin ekranlari (yozildi; brauzerda TEKSHIRILMAGAN)
- `Savollar banki`: qidiruv/filtr, savol formasi (variantli, bir nechta to'g'ri javobli, sonli, parametrli), formulaning jonli ko'rinishi (KaTeX), parametrli savol uchun "Namuna yaratish", mavzu qo'shish, arxivlash. Ishlatilgan savol tahrirlanmaydi (server rad etadi).
- `Imtihonlar`: yaratish (qo'lda tanlash yoki tasodifiy + mavzu taqsimoti, Toshkent vaqti, siyosatlar), holat amallari (e'lon qilish, pauza, davom ettirish, yakunlash, bekor qilish; sabab majburiy).
- API: `GET/POST /api/admin/topics`.
- Forma tekshiruvi mijozda ham, serverda ham bir xil `shared` funksiyalari bilan.
- CSV import (Excel'dan "CSV UTF-8" sifatida): shablon yuklash, "Tekshirish" (hech narsa yozmaydi), "Import" (bitta xato bo'lsa hammasi rad); yangi mavzular avtomatik. `.xlsx` to'g'ridan-to'g'ri qo'llab-quvvatlanmaydi.
- Imtihon "Tafsilot": savolni bekor qilish (natijalar qayta hisoblanadi) va qayta topshirishga bir martalik ruxsat — sabab majburiy, auditga yoziladi.
- Hali yo'q: rasm yuklash, PDF rejim, natijalar/monitoring (3-bosqich).

## Hali YOZILMAGAN
- Excel/CSV import, rasm yuklash, PDF rejim, mavzular CRUD marshrutlari (jadval bor, API yo'q).
- Admin UI (savol banki, imtihon, Excel/CSV import, rasm yuklash, PDF rejim), Mini App imtihon ekrani (KaTeX, IndexedDB navbat).
- Bular `npm install` talab qiladi; bu muhitda tarmoq yopiq, shuning uchun ular faqat sizning kompyuteringizda tekshirilishi mumkin.

## Sizning kompyuteringizda
`npm install && npm test && npm run typecheck && npm run test:sql` — natijani yuboring, xatolarni tuzataman.
