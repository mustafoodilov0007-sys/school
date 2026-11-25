# Zaxira nusxa va tiklash

## Nima bor
- `scripts/backup.mjs` — `pg_dump` (custom format) + SHA-256, natijani `backups` jadvaliga yozadi (admin Dashboard'da ko'rinadi), eski nusxalarni o'chiradi (standart: oxirgi 14 ta).
- `scripts/restore-test.mjs` — eng so'nggi nusxani **vaqtinchalik** bazaga tiklaydi, jadvallar va migratsiyalarni tekshiradi, bazani o'chiradi va `restore_tested_at` ni belgilaydi. Haqiqiy bazaga tegmaydi.

Ikkala skript uchun `pg_dump`, `pg_restore`, `psql` (postgresql-client, 16-versiya tavsiya) kerak.

## Sinov natijasi (halol holat)
Mahalliy PostgreSQL 16 da haqiqatan bajarilgan: zaxira (86 KB, 31 jadval) → `restore-test` → "OK: tiklandi — 31 jadval, 1 migratsiya", vaqtinchalik baza o'chirildi, `backups.restore_tested_at` belgilandi.
Railway'da bajarilmagan — quyidagi cheklovlarni o'qing.

## Ishga tushirish
```
set DATABASE_URL=postgresql://...        (Windows)   |   export DATABASE_URL=...   (Linux/macOS)
node scripts/backup.mjs ./backups 14
node scripts/restore-test.mjs ./backups
```

## Kundalik avtomatik zaxira
- **Docker Compose / VPS:** cron, masalan `0 3 * * * cd /srv/pep && DATABASE_URL=... node scripts/backup.mjs /srv/backups 14`.
- **Railway:** Postgres servisining o'z **Backups** bo'limini yoqing (Railway panelida, Postgres → Backups; mavjudligi va tarifi hisobingizga bog'liq — tekshiring). Bu skript Railway'da servis fayl tizimi vaqtinchalik bo'lgani uchun faylni saqlab qola olmaydi; uni o'z kompyuteringizdan (`DATABASE_URL` — Railway'ning **ommaviy** (TCP proxy) manzili) ishga tushirib, faylni o'zingizda saqlashingiz mumkin.

## Zaxirani alohida joyga yuborish
Server ichidagi nusxa serverning o'zi buzilsa yo'qoladi. Har kuni faylni boshqa joyga ko'chiring: boshqa kompyuter/disk, yoki bulut (rclone, S3 va h.k.). Fayl ichida o'quvchilar ma'lumoti bor — shifrlang yoki yopiq joyda saqlang. Bot orqali yuborish **qilinmagan** (Telegram hajm cheklovi va maxfiylik sabab tavsiya etilmaydi).

## Tiklash (haqiqiy)
1. Tizimni to'xtating (bot, API) yoki o'quvchilar yo'q vaqtni tanlang.
2. Bo'sh baza yarating (yoki mavjudini tozalang).
3. `pg_restore --no-owner --clean --if-exists -d "$DATABASE_URL" backups/pep-....dump`
4. SHA-256 ni tekshiring: `sha256sum -c backups/pep-....dump.sha256`.
5. API'ni ishga tushiring — u migratsiyalarni o'zi tekshiradi.
6. Admin panelda Dashboard va bitta imtihon natijasini ochib ko'ring.

## Railway'da tiklash sinovi
`restore-test.mjs` `CREATE DATABASE` huquqini talab qiladi; Railway'ning umumiy Postgres foydalanuvchisida odatda bu huquq bor, lekin kafolat yo'q. Xato bersa: Railway'da ikkinchi, vaqtinchalik Postgres servisini yarating, `pg_restore` ni unga bajaring, jadvallarni tekshiring va servisni o'chiring.
