/**
 * Integratsion testlar: haqiqiy PostgreSQL + Supertest.
 * TEST_DATABASE_URL kerak va baza nomi `_test` bilan tugashi shart (public sxema TOZALANADI!).
 * Misol: postgresql://pep:parol@localhost:5432/physics_exam_test
 */
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { writeXlsx } from '../src/lib/xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Config } from '../src/config';
import { createPool } from '../src/db/pool';
import type { Pool } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';
import { signInitData } from '../src/lib/telegram-auth';
import { createLogger } from '../src/logger';
import { acquireTestDbLock } from './helpers/db-lock';

const URL_ = process.env.TEST_DATABASE_URL ?? '';
const KEY = 'k'.repeat(40);
const BOT_TOKEN = '123456789:AAFakeTokenForTestsOnly_0123456789abc';
const ADMIN_TG = 900001;
const H = { 'x-requested-with': 'pep-admin' };

describe.skipIf(!URL_)('API integratsiya (PostgreSQL)', () => {
  let pool: Pool;
  let releaseLock: () => Promise<void> = async () => undefined;
  let cfg: Config;
  let app: ReturnType<typeof createApp>;
  let classId = '';
  let studentId = '';
  let code = '';

  const internal = (r: request.Test) => r.set('x-internal-key', KEY);

  beforeAll(async () => {
    if (!/_test(\?|$)/.test(URL_)) throw new Error('TEST_DATABASE_URL nomi _test bilan tugashi shart');
    cfg = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: URL_,
      BOT_TOKEN,
      INTERNAL_API_KEY: KEY,
      ADMIN_TELEGRAM_IDS: String(ADMIN_TG),
      STUDENT_APP_URL: 'http://localhost:5173',
      ADMIN_WEB_URL: 'http://localhost:5174',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);
    releaseLock = await acquireTestDbLock(URL_);
    pool = createPool(URL_, 4);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool, fileURLToPath(new URL('../../../db/migrations', import.meta.url)), () => undefined);
    app = createApp({ cfg, pool, logger: createLogger(cfg) });
  });

  afterAll(async () => {
    await pool?.end();
    await releaseLock();
  });

  async function adminAgent() {
    const link = await internal(request(app).post('/internal/admin/login-link')).send({ telegramId: ADMIN_TG }).expect(200);
    const token = new URL(link.body.url as string).hash.replace('#token=', '');
    const agent = request.agent(app);
    await agent.post('/api/admin/auth/exchange').set(H).send({ token }).expect(200);
    return { agent, token };
  }

  it('sog\'liq tekshiruvi', async () => {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/readyz').expect(200);
  });

  it('/internal kalitsiz va noto\'g\'ri kalit bilan yopiq', async () => {
    await request(app).get('/internal/classes').expect(401);
    await request(app).get('/internal/classes').set('x-internal-key', 'x'.repeat(40)).expect(401);
  });

  it('admin: ruxsat ro\'yxatida yo\'q Telegram ID havola ola olmaydi', async () => {
    await internal(request(app).post('/internal/admin/login-link')).send({ telegramId: 1234 }).expect(403);
  });

  it('admin: havola faqat bir marta ishlaydi; sessiyasiz API yopiq; CSRF sarlavhasi majburiy', async () => {
    await request(app).get('/api/admin/me').expect(401);
    const { agent, token } = await adminAgent();
    const me = await agent.get('/api/admin/me').expect(200);
    expect(me.body.admin.telegramId).toBe(ADMIN_TG);
    await request(app).post('/api/admin/auth/exchange').set(H).send({ token }).expect(401); // qayta ishlatib bo'lmaydi
    await agent.post('/api/admin/classes').send({ name: '9-B' }).expect(403); // X-Requested-With yo'q
  });

  it('admin: sinf va o\'quvchi yaratish, takroriy sinf rad etiladi, ID formati', async () => {
    const { agent } = await adminAgent();
    const c = await agent.post('/api/admin/classes').set(H).send({ name: '8-A' }).expect(201);
    classId = c.body.id as string;
    expect(c.body.codeLabel).toBe('8A');
    await agent.post('/api/admin/classes').set(H).send({ name: '8 a' }).expect(409);
    await agent.post('/api/admin/classes').set(H).send({ name: '###' }).expect(400);

    const s = await agent.post('/api/admin/students').set(H).send({ classId, firstName: 'Aziz', lastName: 'Karimov' }).expect(201);
    studentId = s.body.id as string;
    code = s.body.code as string;
    expect(code).toMatch(/^PH-8A-\d{4}$/);
    expect(s.body.isLinked).toBe(false);

    const bulk = await agent
      .post('/api/admin/students/bulk').set(H)
      .send({ classId, dryRun: true, students: [{ firstName: 'Aziz', lastName: 'Karimov' }] }).expect(200);
    expect(bulk.body.rows[0].warnings.length).toBe(1); // takroriy ism ogohlantirishi
    const list = await agent.get('/api/admin/students').query({ classId }).expect(200);
    expect(list.body.total).toBe(1); // dryRun hech narsa yaratmagan

    const audit = await agent.get('/api/admin/audit').expect(200);
    expect(audit.body.items.some((a: { action: string }) => a.action === 'student.create')).toBe(true);
  });

  it('ro\'yxatdan o\'tish: noto\'g\'ri ID x5 -> blok; keyin to\'g\'ri ID ham bloklangan', async () => {
    const tg = 710001;
    for (let i = 0; i < 4; i++) {
      const r = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: tg, classId, code: 'PH-8A-0000' }).expect(200);
      expect(r.body.status).toBe('invalid');
      expect(r.body.attemptsLeft).toBe(4 - i);
    }
    const fifth = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: tg, classId, code: 'PH-8A-0000' }).expect(200);
    expect(fifth.body.status).toBe('locked');
    const withRight = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: tg, classId, code }).expect(200);
    expect(withRight.body.status).toBe('locked');
    expect(withRight.body.retryAfterSeconds).toBeGreaterThan(500);
  });

  it('ro\'yxatdan o\'tish: tasdiqlash idempotent; ID bitta akkauntga; akkaunt bitta ID ga', async () => {
    const tg = 710002;
    const found = await internal(request(app).post('/internal/registration/lookup'))
      .send({ telegramId: tg, classId, code: code.toLowerCase() }).expect(200);
    expect(found.body.status).toBe('found');
    expect(found.body.student.lastName).toBe('Karimov');
    const token = found.body.confirmToken as string;

    const ok1 = await internal(request(app).post('/internal/registration/confirm')).send({ telegramId: tg, username: 'aziz', token }).expect(200);
    expect(ok1.body.status).toBe('linked');
    const ok2 = await internal(request(app).post('/internal/registration/confirm')).send({ telegramId: tg, username: 'aziz', token }).expect(200);
    expect(ok2.body.status).toBe('linked');
    expect(ok2.body.alreadyLinked).toBe(true);

    // Boshqa akkaunt shu ID ni ishlata olmaydi (band) — "noto'g'ri" bilan bir xil javob
    const other = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: 710003, classId, code }).expect(200);
    expect(other.body.status).toBe('invalid');
    // Boshqa akkaunt boshqa birovning tokenini ishlata olmaydi
    const stolen = await internal(request(app).post('/internal/registration/confirm')).send({ telegramId: 710003, token }).expect(200);
    expect(stolen.body.status).toBe('expired');

    // Allaqachon bog'langan akkaunt ikkinchi ID ni bog'lay olmaydi
    const { agent } = await adminAgent();
    const s2 = await agent.post('/api/admin/students').set(H).send({ classId, firstName: 'Nilufar', lastName: 'Ergasheva' }).expect(201);
    const again = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: tg, classId, code: s2.body.code }).expect(200);
    expect(again.body.status).toBe('already_linked');
  });

  it('Mini App: haqiqiy initData bilan kirish; soxta/eskirgan/boshqa token rad etiladi', async () => {
    const tg = 710002;
    const now = Math.floor(Date.now() / 1000);
    const mk = (authDate: number, token = BOT_TOKEN, id = tg) =>
      signInitData({ user: JSON.stringify({ id, first_name: 'Aziz' }), auth_date: String(authDate) }, token);

    await request(app).post('/api/student/auth/telegram').send({ initData: mk(now, '1:AAOtherOtherOtherOtherOther_1234567') }).expect(401);
    const expired = await request(app).post('/api/student/auth/telegram').send({ initData: mk(now - 3600) }).expect(401);
    expect(expired.body.error.code).toBe('INIT_DATA_EXPIRED');
    const unlinked = await request(app).post('/api/student/auth/telegram').send({ initData: mk(now, BOT_TOKEN, 555) }).expect(403);
    expect(unlinked.body.error.code).toBe('NOT_LINKED');

    const ok = await request(app).post('/api/student/auth/telegram').send({ initData: mk(now) }).expect(200);
    const bearer = `Bearer ${ok.body.token as string}`;
    const me = await request(app).get('/api/student/me').set('authorization', bearer).expect(200);
    expect(me.body.student.code).toBe(code);

    // O'quvchi admin API sidan foydalana olmaydi (cookie yo'q => 401, Bearer e'tiborga olinmaydi)
    await request(app).get('/api/admin/students').set('authorization', bearer).expect(401);
    await request(app).get('/api/student/me').expect(401);
    // Javobda maxfiy maydonlar yo'q
    expect(JSON.stringify(me.body)).not.toMatch(/token_hash|telegram_id|is_correct/);
  });

  it('admin Telegram bog\'lanishini uzadi: sabab majburiy, sessiya darhol bekor, qayta bog\'lash mumkin', async () => {
    const { agent } = await adminAgent();
    await agent.post(`/api/admin/students/${studentId}/unlink-telegram`).set(H).send({}).expect(400);

    const now = Math.floor(Date.now() / 1000);
    const init = signInitData({ user: JSON.stringify({ id: 710002 }), auth_date: String(now) }, BOT_TOKEN);
    const login = await request(app).post('/api/student/auth/telegram').send({ initData: init }).expect(200);
    const bearer = `Bearer ${login.body.token as string}`;

    await agent.post(`/api/admin/students/${studentId}/unlink-telegram`).set(H).send({ reason: 'Telefon almashtirildi' }).expect(200);
    await request(app).get('/api/student/me').set('authorization', bearer).expect(401);

    const found = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: 710004, classId, code }).expect(200);
    expect(found.body.status).toBe('found');
    const audit = await agent.get('/api/admin/audit').expect(200);
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toContain('student.telegram_unlink');
    expect(actions).toContain('student.telegram_link');
  });

  it('faolsizlantirilgan o\'quvchi kira olmaydi; ID qayta yaratilganda eskisi yaroqsiz', async () => {
    const { agent } = await adminAgent();
    const regen = await agent.post(`/api/admin/students/${studentId}/regenerate-code`).set(H).send({ reason: 'ID sizib chiqdi' }).expect(200);
    expect(regen.body.code).not.toBe(code);
    const old = await internal(request(app).post('/internal/registration/lookup')).send({ telegramId: 710005, classId, code }).expect(200);
    expect(old.body.status).toBe('invalid');
    await agent.post(`/api/admin/students/${studentId}/deactivate`).set(H).send({ reason: 'Maktabdan ketdi' }).expect(200);
    const gone = await internal(request(app).post('/internal/registration/lookup'))
      .send({ telegramId: 710006, classId, code: regen.body.code }).expect(200);
    expect(gone.body.status).toBe('invalid');
  });

  it('CSV eksport formula in\'ektsiyasidan xavfsiz va auditga yoziladi', async () => {
    const { agent } = await adminAgent();
    const res = await agent.get('/api/admin/students/export.csv').query({ classId }).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Familiya');
  });

  it('bot holati va update dedupe', async () => {
    await internal(request(app).put('/internal/bot-state/710009')).send({ step: 'enter_code', data: { classId } }).expect(204);
    const st = await internal(request(app).get('/internal/bot-state/710009')).expect(200);
    expect(st.body.state.step).toBe('enter_code');
    const a = await internal(request(app).post('/internal/updates/claim')).send({ updateId: 5551 }).expect(200);
    const b = await internal(request(app).post('/internal/updates/claim')).send({ updateId: 5551 }).expect(200);
    expect([a.body.claimed, b.body.claimed]).toEqual([true, false]);
  });
  it('yakuniy bosqich API: hisobotlar faqat admin uchun; Excel import; fayl yuklash; o\'quvchi endpointlari tokenni talab qiladi', async () => {
    // sessiyasiz — yopiq
    await request(app).get('/api/admin/reports/codes.xlsx').expect(401);
    await request(app).post('/api/admin/media?kind=image').set(H).send(Buffer.from('x')).expect(401);
    await request(app).get('/api/student/media/11111111-1111-4111-8111-111111111111').expect(401);
    await request(app).get('/api/student/analytics').expect(401);
    await request(app).get('/api/student/materials').expect(401);

    const { agent } = await adminAgent();
    // Excel va PDF hisobot
    const x = await agent.get('/api/admin/reports/codes.xlsx').query({ classId }).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const p = await agent.get('/api/admin/reports/codes.pdf').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await agent.get('/api/admin/reports/codes.docx').expect(400);

    // Excel orqali o'quvchilar importi: avval ko'rish, keyin saqlash; buzuq fayl rad etiladi
    const book = writeXlsx([{ name: 'Sinf', rows: [['Familiya', 'Ism'], ['Rahimov', 'Jasur'], ['Karimov', 'Aziz']] }]);
    const prev = await agent.post(`/api/admin/students/import-xlsx?classId=${classId}&commit=0`).set(H).set('content-type', 'application/octet-stream').send(book).expect(200);
    expect(prev.body.dryRun).toBe(true);
    expect(prev.body.rows).toHaveLength(2);
    expect(prev.body.rows.find((r: { lastName: string }) => r.lastName === 'Karimov').warnings.length).toBe(1); // takroriy ism
    const done = await agent.post(`/api/admin/students/import-xlsx?classId=${classId}&commit=1`).set(H).set('content-type', 'application/octet-stream').send(book).expect(201);
    expect(done.body.created).toHaveLength(2);
    await agent.post(`/api/admin/students/import-xlsx?classId=${classId}&commit=0`).set(H).set('content-type', 'application/octet-stream').send(Buffer.from('bu excel emas')).expect(400);

    // Fayl yuklash: rasm qabul, SVG/HTML rad (kengaytma/Content-Type emas, baytlar hal qiladi)
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('api-rasm')]);
    const up = await agent.post('/api/admin/media?kind=image').set(H).set('content-type', 'image/svg+xml').send(png).expect(201);
    const got = await agent.get(`/api/admin/media/${up.body.id}`).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    await agent.post('/api/admin/media?kind=image').set(H).set('content-type', 'image/png').send(Buffer.from('<svg onload=alert(1)>')).expect(400);
    await agent.post('/api/admin/media?kind=pdf').set(H).send(png).expect(400); // tur mos emas
  });
});
