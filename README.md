# Maktab boshqaruv platformasi (Netlify + Turso)
## Joylash
1. Turso: `turso db create school` → `turso db show school --url` va `turso db tokens create school`.
2. Kodni GitHub'ga yuklang → Netlify'da "Import from Git". (Build command kerak emas.)
3. Netlify → Site settings → Environment variables:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (uzun tasodifiy qator), `ADMIN_PASSWORD` (birinchi administrator, login: `admin`, ixtiyoriy `ADMIN_LOGIN`).
4. Deploy. Jadvallar birinchi so'rovda avtomatik yaratiladi (CREATE IF NOT EXISTS — ma'lumot o'chmaydi).
## Test
`npm i && npm test` — toza mahalliy SQLite bazada API testlari (rollar, to'qnashuvlar, baho/davomat, hisobotlar, zaxira-tiklash, xlsx) va eski bazadan migratsiya testi. Test `/tmp/school.db` ni o'zi tozalaydi.

## Railway (Hobby) ga joylash
1. Kodni GitHub'ga yuklang (`node_modules` yuklanmaydi — `.gitignore` da).
2. Railway → New Project → Deploy from GitHub repo. Start buyrug'i `npm start` (avtomatik aniqlanadi).
3. Servis → **Volumes** → Add Volume, Mount path: `/data`. (Railway `RAILWAY_VOLUME_MOUNT_PATH` ni o'zi beradi.)
4. Servis → **Variables**: `SESSION_SECRET` (uzun tasodifiy matn), `ADMIN_PASSWORD` (kamida 8 belgi). `TURSO_*` kerak EMAS.
5. Settings → Networking → **Generate Domain**. Tekshirish: `<domen>/api/public`.
6. Kirish: login `admin`, parol — `ADMIN_PASSWORD`. Zaxira: Foydalanuvchilar → «Zaxira nusxa» ni muntazam yuklab oling.

## Yangi imkoniyatlar (v1.1)
- **Sozlamalar** (administrator): o'quv yili va choraklar, dars vaqtlari (qo'ng'iroq jadvali), baholash turlari va maksimal ballari, zaxira + **tiklash**, audit jurnali.
- **Davomat dars kesimida**: jurnalda «Dars: 1, 2…» tanlanadi (tanlanmasa eski usul: fan+sana). Mavjud davomat yozuvlari avtomatik `slot=0` bilan ko'chiriladi (migratsiya idempotent).
- **O'quvchi**: tahrirlash (F.I.Sh., kod, ota-ona aloqasi, sinf, holat) va individual sahifa (fanlar bo'yicha o'rtacha, baholar va davomat tarixi). Sinf o'zgarsa eski baho/davomat eski sinf bilan qoladi.
- **Hisobotlar**: davomat (davr bo'yicha, kun/hafta/oy/chorak), jurnal to'ldirish holati, sinf natijalari — Excel (.xlsx), CSV va chop etish/PDF.
- **Bosh sahifa**: bugungi darslar, davomat, so'nggi baholar. O'qituvchi faqat o'zinikini, admin/direktor butun maktabni ko'radi.

## Zaxiradan tiklash
Sozlamalar → «Zaxira nusxa olish» (JSON). Tiklash: «Zaxiradan tiklash» → fayl → `TIKLASH` deb yozing. Bitta tranzaksiya: xato bo'lsa baza o'zgarmaydi. Xodimlar o'chirilmaydi; parollar zaxiraga kirmaydi, shuning uchun zaxirada bor-u bazada yo'q xodim faolsiz tiklanadi — administrator yangi parol beradi.

## Hozircha mavjud EMAS (rejada)
Ommaviy sayt va yangiliklar, Excel *import* (o'quvchilar faqat matn orqali qo'shiladi), PDF fayl generatsiyasi (brauzer «Chop etish → PDF»), baho vaznining o'rtachaga ta'siri, yaqinlashayotgan nazorat ishlari kalendari, jadval amal qilish davri, o'quvchi/ota-ona kabineti.

## Ochiq bosh sahifa va hafta/oy o'quvchisi
- Kirmagan foydalanuvchi ochiq sahifani ko'radi: «Xodimlar kirishi» (login/parol), «O'quvchi va ota-ona» (ma'lumot), maktab ko'rsatkichlari.
- **Hafta/oy o'quvchisi** — baholangan ishlarning o'rtacha foizi (hafta: kamida 2, oy: kamida 4 baho); davr bo'sh bo'lsa oldingi hafta/oy ko'rsatiladi. Arxivlangan o'quvchilar hisobga olinmaydi.
- Ochiq sahifada bu reyting **standart o'chiq**. Administrator Sozlamalar'da yoqadi; yoqilganda faqat «Familiya I.» va sinf ko'rinadi. Xodimlar paneli (Bosh sahifa) reytingni to'liq ism bilan, o'z ruxsati doirasida ko'rsatadi.
- Login: bir IP+login uchun 10 daqiqada 8 ta xato urinishdan keyin vaqtincha bloklanadi (jarayon xotirasida).
- Testlar: `npm test` (test.js, test-migration.js, test-public.js).
