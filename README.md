# Deutsch School MCHJ: maktab boshqaruv platformasi

Elektron jurnal, davomat, dars jadvali, hisobotlar, o'quvchi va ota-ona kabineti, e'lonlar.
Texnologiya: Node.js (`server.js`), SQLite/Turso (`@libsql/client`), bitta sahifali ilova (`public/index.html`).

## Tuzilma
- `server.js`: statik fayllar va `/api` (Railway uchun doimiy server), `/health` tekshiruvi.
- `netlify/functions/api.js`: butun API mantig'i (Netlify funksiyasi va server.js bir xil kodni ishlatadi).
- `public/index.html`: butun interfeys (mehmon sahifa, kirish oynasi, rollar paneli).
- `test*.js`: avtomatik testlar (`npm test`).

## Railway'ga joylash (tavsiya etiladi)
1. Kodni GitHub'ga yuklang.
2. Railway → New Project → Deploy from GitHub repo. Start buyrug'i `npm start`.
3. **Ma'lumotlar saqlanishi (muhim).** Quyidagilardan birini tanlang, aks holda har deploydan keyin baza YO'QOLADI:
   - Turso: `TURSO_DATABASE_URL` va `TURSO_AUTH_TOKEN` o'zgaruvchilari (tavsiya etiladi), yoki
   - Railway **Volume**: Service → Volumes → Add Volume, Mount path `/data`.
4. Service → **Variables**:
   - `SESSION_SECRET`: kamida 32 belgi, tasodifiy (masalan, `openssl rand -hex 32`).
   - `ADMIN_PASSWORD`: kamida 8 belgi (birinchi administrator, login `admin`, ixtiyoriy `ADMIN_LOGIN`).
5. Settings → Networking → Generate Domain. Tekshirish: `<domen>/health` → `ok`.
6. Zaxira: Xodimlar → «Zaxira nusxa» faylini muntazam yuklab oling.

## Netlify (muqobil)
Netlify'da Import from Git (build buyrug'i kerak emas), o'zgaruvchilar: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `ADMIN_PASSWORD`.

## Rollar
- **Administrator / direktor**: butun maktab, xodimlar, sozlamalar, e'lonlar, zaxira.
- **O'qituvchi**: o'z sinf va fanlari jurnali, davomat, baho, uy vazifasi.
- **Sinf rahbari**: o'z sinfi o'quvchilari va ota-onalariga login-parol beradi.
- **O'quvchi** va **ota-ona**: faqat o'z kabineti (baho, davomat, jadval, uy vazifasi, e'lonlar). Ota-ona logini `ota.<familiya>`.

## Asosiy imkoniyatlar
- eMaktab uslubidagi jurnal: ustunlar dars jadvaliga mos, davomat belgilari `k` (sababli), `s` (sababsiz), `dq` (kech qoldi). Mavzu va uy vazifasi jadvalning yonida: sana ustunini bosib tanlanadi, avtomatik saqlanadi.
- Dars jadvali dars raqami bo'yicha, sudrab ko'chiriladi.
- **Nazorat imtihoniga ruxsat**: oxirgi 14 kunda fan bo'yicha 4 ta sababsiz dars bo'lsa ruxsat berilmaydi (sozlanadi: Sozlamalar). O'quvchi ko'radi: mavzuni otrabotka qiling. O'qituvchi otrabotkadan keyin hisobni nolga tushiradi.
- Hisobotlar (davomat qatnashgan/qatnashmagan, jurnal holati, sinf natijalari, ruxsat hisoboti): Excel, CSV, chop etish.
- E'lonlar: hammaga, xodimlarga, o'quvchilarga yoki ota-onalarga; qadash mumkin.
- Ochiq mehmon sahifa va kirish oynasi; hafta/oy o'quvchisi (standart o'chiq, Sozlamalar'da yoqiladi).
- Zaxira nusxa va bitta tranzaksiyali tiklash, audit jurnali.

## Xavfsizlik
- Parollar scrypt bilan xeshlanadi; sessiya HMAC bilan imzolangan, `HttpOnly; Secure; SameSite=Strict` cookie (12 soat).
- Login urinishi cheklanadi: IP+login uchun 10 daqiqada 8 ta xato, bitta login uchun jami 30 ta xato.
- O'quvchi va ota-ona faqat `/me` va `/student/*` yo'llariga kira oladi; parol almashsa yoki hisob bloklansa sessiya darhol bekor bo'ladi.
- Server sarlavhalari: CSP, X-Frame-Options, HSTS, nosniff.

## To'lovlar (buxgalteriya)
- Administrator **Sozlamalar** bo'limida tashkilot rekvizitlari (nom, INN, bank, hisob), buxgalter(lar)ni (o'qituvchi hisobi) va Click/Payme ma'lumotlarini kiritadi.
- Tariflar: sinf uchun oylik summa, o'quvchiga alohida narx yoki chegirma (%). «Oylik to'lovni hisoblash» tanlangan oy uchun hisob yozadi (qayta bosilsa dublikat bo'lmaydi).
- Qoldiq = hisoblangan − to'langan (musbat = qarz). Buxgalter to'lov qabul qiladi (naqd/bank/plastik), kvitansiya chop etadi, to'lovni bekor qiladi, qo'shimcha hisob yoki chegirma yozadi.
- Buxgalteriya hisoboti: oylar, sinflar, to'lov turlari bo'yicha, qarzdorlar ro'yxati (Excel/CSV/chop etish).
- O'quvchi/ota-ona «To'lovlar» bo'limida qancha to'langani, qancha qolgani, bank rekvizitlari va tarixni ko'radi; Click/Payme orqali to'laydi.
- Click/Payme: kabinetlarida URL: `<domen>/api/pay/payme`, `<domen>/api/pay/click/prepare`, `<domen>/api/pay/click/complete`. **Haqiqiy to'lovdan oldin ularning sandbox/test muhitida albatta sinab ko'ring**: integratsiya faqat simulyatsiya bilan tekshirilgan.
- Sirli kalitlar va shaxsiy havolalar zaxira nusxaga kirmaydi.

## Boshqa imkoniyatlar
- Chorak/yillik baholar (tortilgan o'rtacha, o'qituvchi tasdiqlaydi) va qaydnoma; xodim paroli; Excel (.xlsx) orqali o'quvchilar yuklash; PWA (telefonga o'rnatish); «bugungi darslarim»; har bir o'quvchiga shaxsiy kirish havolasi (`/k/...`).

## Test
`npm test` (SQLite bazada, `/tmp/school.db` ni o'zi tozalaydi): rollar, jadval to'qnashuvlari, baho/davomat, o'quvchi/ota-ona hisoblari, nazorat ruxsati, zaxira-tiklash, migratsiya.

## Rejada (hali yo'q)
Chat (ota-ona, o'quvchi, xodim), ota-onaga Telegram xabarlari, dars jadvalining amal qilish muddati, o'quvchi/ota-ona parolini tiklash oqimi, avtomatik zaxira.
