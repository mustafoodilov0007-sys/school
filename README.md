# Maktab boshqaruv platformasi (Netlify + Turso)
## Joylash
1. Turso: `turso db create school` → `turso db show school --url` va `turso db tokens create school`.
2. Kodni GitHub'ga yuklang → Netlify'da "Import from Git". (Build command kerak emas.)
3. Netlify → Site settings → Environment variables:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (uzun tasodifiy qator), `ADMIN_PASSWORD` (birinchi administrator, login: `admin`, ixtiyoriy `ADMIN_LOGIN`).
4. Deploy. Jadvallar birinchi so'rovda avtomatik yaratiladi (CREATE IF NOT EXISTS — ma'lumot o'chmaydi).
## Test
`npm i && npm test` (mahalliy SQLite faylida 22 ta tekshiruv).

## Railway (Hobby) ga joylash
1. Kodni GitHub'ga yuklang (`node_modules` yuklanmaydi — `.gitignore` da).
2. Railway → New Project → Deploy from GitHub repo. Start buyrug'i `npm start` (avtomatik aniqlanadi).
3. Servis → **Volumes** → Add Volume, Mount path: `/data`. (Railway `RAILWAY_VOLUME_MOUNT_PATH` ni o'zi beradi.)
4. Servis → **Variables**: `SESSION_SECRET` (uzun tasodifiy matn), `ADMIN_PASSWORD` (kamida 8 belgi). `TURSO_*` kerak EMAS.
5. Settings → Networking → **Generate Domain**. Tekshirish: `<domen>/api/public`.
6. Kirish: login `admin`, parol — `ADMIN_PASSWORD`. Zaxira: Foydalanuvchilar → «Zaxira nusxa» ni muntazam yuklab oling.
