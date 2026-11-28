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

## Yangi o'quv yiliga o'tkazish
- Sinflar → «Yangi o'quv yiliga o'tkazish»: har bir sinf uchun yangi sinf nomi (6-A kabi, taklif qilinadi) yoki «Bitiradi». O'quvchilar yangi sinfga ko'chadi, bitiruvchilar `arxiv` holatiga o'tadi (kirishi yopiladi), eski sinflar arxivga tushadi va eski jadval kiritilgan sanada tugaydi. Ixtiyoriy: sinf tarifini nusxalash, sinf rahbarini qoldirish. Bir nechta eski sinfni bitta yangi sinfga birlashtirish mumkin.
- Tarix saqlanadi: baho, davomat va jurnallar eski sinf yozuvida qoladi. «Arxiv sinflar» orqali eski jurnalni ko'rish mumkin (boshqa sinfga o'tgan yoki bitirgan o'quvchilar ham ko'rinadi). O'quvchi kabinetida o'z baholari tarixi saqlanadi.
- Tasdiqlash uchun `OTKAZISH` yoziladi. Boshlashdan oldin server avto-zaxira oladi (Railway), baribir qo'lda zaxirani yuklab oling. Amalni qaytarib bo'lmaydi.
- Eslatma: bitiruvchilarning qarzi buxgalteriya hisobotlaridan chiqib ketadi (oynada ko'rsatiladi). Yangi o'quv yili uchun chorak sanalarini Sozlamalar'da kiriting; fan o'qituvchilari va jadvalni yangi sinflar uchun kiriting.

## Qarz eslatmasi
To'lovlar → Qoldiq: «Qarzdorlarga Telegram eslatmasi» (barcha yoki tanlangan sinf). Bir oilaga 6 kundan tez-tez yuborilmaydi; Telegram ulanmagan oilalar sanab ko'rsatiladi. To'lovlar → Sozlamalar: har oyning tanlangan kuni (1–28) 10:00 dan keyin avtomatik eslatma va minimal qarz. Eslatma turini Telegram sozlamalarida o'chirish mumkin. Avtomatik yuborish faqat doimiy serverda (Railway) ishlaydi.

## Parolni tiklash va avto-zaxira
- **Parolni tiklash**: kirish oynasida «Telegram orqali tiklash». Ota-ona yoki o'quvchi logini kiritadi, 6 xonali bir martalik kod (10 daqiqa) ota-onaning ulangan Telegramiga yuboriladi, kod bilan yangi parol qo'yiladi (kamida 8 belgi). Login bor-yo'qligi oshkor qilinmaydi; urinishlar cheklangan (IP va login bo'yicha, 5 xato kodni bekor qiladi, 60 soniyada bir kod). Eski sessiyalar bekor bo'ladi. Telegram ulanmagan bo'lsa yoki xodim bo'lsa, avvalgidek sinf rahbari/administrator yangi parol beradi.
- **Avto-zaxira** (Railway serveri): har kuni Toshkent 03:00 dan keyin siqilgan JSON fayl, oxirgi 14 tasi saqlanadi (`BACKUP_KEEP`). Papka: `BACKUP_DIR` yoki Railway Volume ichidagi `backups`. **Volume ulanmagan bo'lsa fayllar deploydan keyin o'chadi**: Sozlamalar → «Avtomatik zaxira» kartasi buni ogohlantiradi. Kartada ro'yxat, yuklab olish va «Hozir zaxira olish». Tiklash: yuklab olingan faylni Xodimlar → tiklash orqali.
- Zaxira fayllarida shaxsiy ma'lumot bor: ularni xavfsiz joyda saqlang.

## Dars jadvali versiyalari
- Har bir dars «qaysi sanadan qaysi sanagacha» amal qiladi. Jadvalni o'zgartirish yoki darsni o'chirish faqat tanlangan **kuchga kirish sanasidan** boshlab ta'sir qiladi; eski dars tarixga qoladi, shuning uchun o'tgan jurnal ustunlari, davomat va «jurnal to'ldirilishi» hisobotlari buzilmaydi.
- O'tmish sanasiga o'zgartirish taqiqlanadi. Dars qo'shish mumkin.
- **Yangi versiya (semestr)**: tanlangan sanadan boshlab amaldagi jadval nusxalanadi, eskisi bir kun oldin tugaydi; so'ng yangi nusxani erkin tahrirlaysiz. Yuqoridagi «Jadval sanasi» orqali istalgan davrdagi jadvalni ko'rish mumkin (o'tmish faqat ko'rish uchun).
- To'qnashuv (o'qituvchi, sinf, xona) faqat amal qilish oralig'i kesishgan darslar orasida tekshiriladi. O'quvchi kabineti va «bugungi darslar» faqat bugun amaldagi jadvalni ko'rsatadi.
- Eslatma: fan o'qituvchisi yangi versiyada boshqa xodimga o'zgarsa, jurnal ruxsati uchun Sinflar bo'limida fanni shu xodimga biriktirishni unutmang.

## Xabarlar (chat) va Telegram
- **Xabarlar** bo'limi: xodimlar o'zaro, xodim ↔ ota-ona/o'quvchi. O'qituvchi faqat o'z sinfi (sinf rahbari yoki dars beradigan sinf) oilalariga yoza oladi; administrator/direktor hammaga. Ota-ona va o'quvchi faqat o'z sinf ustozlari va ma'muriyatga yozadi; o'quvchilar bir-biriga va ota-ona o'quvchiga yoza olmaydi. Yangi xabar nishoni menyuda ko'rinadi (har 20 soniyada yangilanadi), ochiq suhbat har 5 soniyada.
- **Telegram** (ota-onalarga): Sozlamalar → «Telegram»: @BotFather'dan bot tokeni → Saqlash → «Webhookni ulash» (sayt https da bo'lishi shart). Ota-ona Profil bo'limida «Telegramni ulash» tugmasini bosadi, botda Start bosadi. Xabarlar: sababsiz kelmadi/kech qoldi, yangi baho, to'lov (qoldiq bilan), ota-onalarga e'lon, yangi chat xabari (matnsiz). Har turini Sozlamalar'da o'chirish mumkin. Bot tokeni va ulanishlar zaxira nusxaga kirmaydi.
- Telegram xabarlari server jarayonida yuboriladi: Railway (doimiy server) uchun mos; Netlify funksiyasida ishonchli emas.
- Chat yozishmalari zaxira nusxaga kirmaydi va ma'muriyat tomonidan o'qilmaydi (maxfiylik). Kerak bo'lsa moderatsiya keyin qo'shiladi.

## Boshqa imkoniyatlar
- Chorak/yillik baholar (tortilgan o'rtacha, o'qituvchi tasdiqlaydi) va qaydnoma; xodim paroli; Excel (.xlsx) orqali o'quvchilar yuklash; PWA (telefonga o'rnatish); «bugungi darslarim»; har bir o'quvchiga shaxsiy kirish havolasi (`/k/...`).

## Test
`npm test` (SQLite bazada, `/tmp/school.db` ni o'zi tozalaydi): rollar, jadval to'qnashuvlari, baho/davomat, o'quvchi/ota-ona hisoblari, nazorat ruxsati, zaxira-tiklash, migratsiya.

## Rejada (hali yo'q)
O'quvchi/ota-ona parolini tiklash oqimi, avtomatik zaxira.

## Chat moderatsiyasi va monitoring
- **Xabarni o'chirish:** har kim o'z xabarini o'chiradi; admin/direktor istalgan shikoyat qilingan xabarni o'chiradi. O'chirish "yumshoq": foydalanuvchiga "Xabar o'chirildi" ko'rinadi, yozuv esa shikoyatni ko'rish uchun bazada qoladi.
- **Shikoyat:** suhbat ishtirokchisi boshqaning xabariga shikoyat qiladi (soatiga 10 tagacha). Admin chatdagi «Shikoyatlar» tugmasida ko'radi va faqat shu xabar atrofidagi yozishmani ochadi (boshqa suhbatlarni o'qimaydi).
- **Cheklash:** admin/direktor o'quvchi yoki ota-onani 1–365 kunga yozishdan cheklaydi (sabab ko'rinadi, o'qish mumkin). Xodimlar cheklanmaydi. Barcha moderator amallari audit jurnaliga yoziladi.
- **/health:** baza javob bersa `200 {"status":"ok"}`, aks holda `503`. UptimeRobot: HTTP(s) monitor, URL `https://SAYT/health`, interval 5 daqiqa.
- **Tizim holati kartasi** (Sozlamalar): baza tezligi, server ishlash vaqti, zaxira holati va ogohlantirishlar (doimiy baza yo'q, SESSION_SECRET qisqa, avto-zaxira eskirgan).
