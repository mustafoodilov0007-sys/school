const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const db = createClient({ url: process.env.TURSO_DATABASE_URL || ('file:' + (process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp') + '/school.db'), authToken: process.env.TURSO_AUTH_TOKEN });
const SECRET = process.env.SESSION_SECRET || '';
const UF = ['first_name','last_name','middle_name','phone','email','birth_date','gender','hire_date','education','category','bio','photo'];
const ST = ['keldi', 'kelmadi', 'kechikdi', 'uzrli'];
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows.map(r => ({ ...r }));
const one = async (sql, args) => (await q(sql, args))[0];
const run = (sql, args = []) => db.execute({ sql, args });
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC; UI shows Asia/Tashkent

const SCHEMA = [
`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)`,
`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,login TEXT UNIQUE NOT NULL,name TEXT NOT NULL,pass TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','director','teacher')),is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT)`,
`CREATE TABLE IF NOT EXISTS teacher_subjects(user_id INTEGER NOT NULL REFERENCES users(id),subject_id INTEGER NOT NULL REFERENCES subjects(id),PRIMARY KEY(user_id,subject_id))`,
`CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL)`,
`CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY,name TEXT NOT NULL,year TEXT NOT NULL,homeroom_id INTEGER REFERENCES users(id),UNIQUE(name,year))`,
`CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),subject_id INTEGER NOT NULL REFERENCES subjects(id),teacher_id INTEGER NOT NULL REFERENCES users(id),UNIQUE(class_id,subject_id))`,
`CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT NOT NULL,class_id INTEGER NOT NULL REFERENCES classes(id),status TEXT NOT NULL DEFAULT 'faol',parent_contact TEXT)`,
`CREATE TABLE IF NOT EXISTS student_accounts(student_id INTEGER PRIMARY KEY,login TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT,last_login TEXT)`,
`CREATE TABLE IF NOT EXISTS parent_accounts(student_id INTEGER PRIMARY KEY,login TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT,last_login TEXT)`,
`CREATE TABLE IF NOT EXISTS admission_resets(student_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,cleared_on TEXT NOT NULL,note TEXT,by_id INTEGER,PRIMARY KEY(student_id,subject_id))`,
`CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,audience TEXT NOT NULL DEFAULT 'all' CHECK(audience IN('all','staff','students','parents')),pinned INTEGER NOT NULL DEFAULT 0,author_id INTEGER,created_at TEXT)`,
`CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),subject_id INTEGER NOT NULL REFERENCES subjects(id),teacher_id INTEGER NOT NULL REFERENCES users(id),weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),start TEXT NOT NULL,end TEXT NOT NULL,room TEXT)`,
`CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,teacher_id INTEGER NOT NULL,date TEXT NOT NULL,topic TEXT,homework TEXT,note TEXT,UNIQUE(class_id,subject_id,date))`,
`CREATE TABLE IF NOT EXISTS grades(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,teacher_id INTEGER NOT NULL,date TEXT NOT NULL,type TEXT NOT NULL,value REAL NOT NULL,max REAL NOT NULL DEFAULT 5,comment TEXT,UNIQUE(student_id,subject_id,date,type))`,
`CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('keldi','kelmadi','kechikdi','uzrli')),note TEXT,UNIQUE(student_id,subject_id,date))`,
`CREATE TABLE IF NOT EXISTS period_grades(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN('term','year')),term_id INTEGER NOT NULL DEFAULT 0,value INTEGER NOT NULL CHECK(value BETWEEN 2 AND 5),teacher_id INTEGER,updated_at TEXT,UNIQUE(student_id,subject_id,kind,term_id))`,
`CREATE TABLE IF NOT EXISTS access_links(student_id INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN('student','parent')),token_hash TEXT UNIQUE NOT NULL,created_at TEXT,last_used TEXT,PRIMARY KEY(student_id,kind))`,
`CREATE TABLE IF NOT EXISTS fin_config(key TEXT PRIMARY KEY,value TEXT)`,
`CREATE TABLE IF NOT EXISTS class_fee(class_id INTEGER PRIMARY KEY REFERENCES classes(id),monthly INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS fee_plans(student_id INTEGER PRIMARY KEY REFERENCES students(id),monthly INTEGER,discount_pct INTEGER NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100),note TEXT)`,
`CREATE TABLE IF NOT EXISTS charges(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),period TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT 'oylik',note TEXT,created_at TEXT)`,
`CREATE UNIQUE INDEX IF NOT EXISTS ux_charge_month ON charges(student_id,period) WHERE kind='oylik'`,
`CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL,paid_on TEXT NOT NULL,note TEXT,ext_id TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'ok',created_by INTEGER,created_at TEXT)`,
`CREATE TABLE IF NOT EXISTS gateway_tx(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,ext_id TEXT NOT NULL,student_id INTEGER NOT NULL,amount INTEGER NOT NULL,state INTEGER NOT NULL,create_time INTEGER,perform_time INTEGER,cancel_time INTEGER,reason INTEGER,payment_id INTEGER,UNIQUE(provider,ext_id))`,
`CREATE TABLE IF NOT EXISTS chat_threads(id INTEGER PRIMARY KEY,a TEXT NOT NULL,b TEXT NOT NULL,last_at TEXT,last_text TEXT,UNIQUE(a,b))`,
`CREATE TABLE IF NOT EXISTS chat_msgs(id INTEGER PRIMARY KEY,thread_id INTEGER NOT NULL,sender TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS ix_cm ON chat_msgs(thread_id,id)`,
`CREATE TABLE IF NOT EXISTS chat_reports(id INTEGER PRIMARY KEY,msg_id INTEGER NOT NULL,thread_id INTEGER NOT NULL,reporter TEXT NOT NULL,reason TEXT,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',handled_by INTEGER,handled_at TEXT,note TEXT,UNIQUE(msg_id,reporter))`,
`CREATE TABLE IF NOT EXISTS chat_mutes(party TEXT PRIMARY KEY,until TEXT NOT NULL,reason TEXT,by_user INTEGER,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS chat_reads(thread_id INTEGER NOT NULL,party TEXT NOT NULL,last_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(thread_id,party))`,
`CREATE TABLE IF NOT EXISTS tg_config(key TEXT PRIMARY KEY,value TEXT)`,
`CREATE TABLE IF NOT EXISTS tg_links(chat_id TEXT NOT NULL,student_id INTEGER NOT NULL,created_at TEXT,PRIMARY KEY(chat_id,student_id))`,
`CREATE TABLE IF NOT EXISTS remind_log(student_id INTEGER PRIMARY KEY,sent_on TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS reset_codes(login TEXT PRIMARY KEY,code TEXT NOT NULL,exp INTEGER NOT NULL,tries INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS tg_codes(code TEXT PRIMARY KEY,student_id INTEGER NOT NULL,exp INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity TEXT,entity_id TEXT,old TEXT,new TEXT,at TEXT)`,
`CREATE TABLE IF NOT EXISTS academic_years(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,is_current INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS terms(id INTEGER PRIMARY KEY,year_id INTEGER NOT NULL REFERENCES academic_years(id),name TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,UNIQUE(year_id,name))`,
`CREATE TABLE IF NOT EXISTS bell_slots(id INTEGER PRIMARY KEY,no INTEGER UNIQUE NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS grade_types(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,max REAL NOT NULL DEFAULT 5,weight REAL NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 1)`,
`INSERT OR IGNORE INTO grade_types(name,max,weight) VALUES('joriy',5,1),('nazorat',5,2),('uy vazifasi',5,1)`,
`CREATE INDEX IF NOT EXISTS ix_g ON grades(class_id,subject_id)`,
`CREATE INDEX IF NOT EXISTS ix_a ON attendance(class_id,date)`,
`CREATE INDEX IF NOT EXISTS ix_t ON timetable(weekday,teacher_id)`];

let ready;
const init = () => ready || (ready = (async () => {
  await db.batch(SCHEMA, 'write');
  const have = (await q('PRAGMA table_info(users)')).map(c => c.name); // xavfsiz migratsiya: faqat yetishmaydigan ustunlar qo'shiladi
  for (const c of [...UF, 'experience_years']) if (!have.includes(c)) await run(`ALTER TABLE users ADD COLUMN ${c} ${c === 'experience_years' ? 'INTEGER' : 'TEXT'}`);
  if (!(await q('PRAGMA table_info(attendance)')).some(c => c.name === 'slot')) // davomatni dars (slot) kesimida yuritish: mavjud yozuvlar slot=0 bilan ko'chiriladi
    await db.batch([
      `CREATE TABLE attendance_new(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,date TEXT NOT NULL,slot INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL CHECK(status IN('keldi','kelmadi','kechikdi','uzrli')),note TEXT,UNIQUE(student_id,subject_id,date,slot))`,
      `INSERT INTO attendance_new(id,student_id,class_id,subject_id,date,slot,status,note) SELECT id,student_id,class_id,subject_id,date,0,status,note FROM attendance`,
      `DROP TABLE attendance`, `ALTER TABLE attendance_new RENAME TO attendance`, `CREATE INDEX IF NOT EXISTS ix_a ON attendance(class_id,date)`], 'write');
  if (!(await q('PRAGMA table_info(timetable)')).some(c => c.name === 'slot')) await run('ALTER TABLE timetable ADD COLUMN slot INTEGER'); // dars raqami (1-dars, 2-dars ...): mavjud darslar vaqti bo'yicha avtomatik bog'lanadi
  if (!(await q('PRAGMA table_info(classes)')).some(x => x.name === 'archived')) await run('ALTER TABLE classes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); // o'quv yili tugagan sinf arxivga o'tadi
  for (const c of ['del_at', 'del_by']) if (!(await q('PRAGMA table_info(chat_msgs)')).some(x => x.name === c)) await run(`ALTER TABLE chat_msgs ADD COLUMN ${c} TEXT`); // chat: xabar o'chirilsa yozuv saqlanadi (shikoyat dalili), foydalanuvchiga ko'rinmaydi
  for (const c of ['valid_from', 'valid_to']) if (!(await q('PRAGMA table_info(timetable)')).some(x => x.name === c)) await run(`ALTER TABLE timetable ADD COLUMN ${c} TEXT`); // jadval versiyasi: dars shu sanalar oralig'ida amal qiladi (NULL = chegarasiz)
  await mapSlots();
  await run(`INSERT OR IGNORE INTO settings VALUES('school_name','Deutsch School MCHJ')`);
  if (!(await one('SELECT id FROM users LIMIT 1')) && process.env.ADMIN_PASSWORD)
    await run('INSERT INTO users(login,name,pass,role,created_at) VALUES(?,?,?,?,?)', [process.env.ADMIN_LOGIN || 'admin', 'Administrator', hash(process.env.ADMIN_PASSWORD), 'admin', now()]);
})());

function hash(p) { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); }
function verify(p, h) { const [s, k] = h.split(':'); const x = crypto.scryptSync(p, s, 32); return crypto.timingSafeEqual(x, Buffer.from(k, 'hex')); }
const sign = d => { const b = Buffer.from(JSON.stringify(d)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); };
function unsign(t) {
  const [b, s] = (t || '').split('.'); if (!b || !s) return null;
  const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  const d = JSON.parse(Buffer.from(b, 'base64url').toString()); return d.exp > Date.now() ? d : null;
}
class HttpErr extends Error { constructor(c, m) { super(m); this.c = c; } }
const bad = (m, c = 400) => { throw new HttpErr(c, m); };
const audit = (u, action, entity, id, old, nw) => run('INSERT INTO audit_logs(user_id,action,entity,entity_id,old,new,at) VALUES(?,?,?,?,?,?,?)', [u.id, action, entity, String(id), old ? JSON.stringify(old) : null, nw ? JSON.stringify(nw) : null, now()]);

// ruxsatlar (backend darajasida)
const teaches = async (u, c, s) => u.role === 'admin' || !!(await one('SELECT 1 x FROM assignments WHERE class_id=? AND subject_id=? AND teacher_id=?', [c, s, u.id]));
const homeroom = async (u, c) => u.role === 'admin' || !!(await one('SELECT 1 x FROM classes WHERE id=? AND homeroom_id=?', [c, u.id]));
const canView = async (u, c, s) => u.role !== 'teacher' || (await homeroom(u, c)) || (s ? await teaches(u, c, s) : !!(await one('SELECT 1 x FROM assignments WHERE class_id=? AND teacher_id=?', [c, u.id])));
const need = (u, ...r) => { if (!r.includes(u.role)) bad('Ruxsat yo\'q', 403); };
const hhmm = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') || bad('Vaqt formati HH:MM bo\'lishi kerak');

// Vaqti qo'ng'iroq jadvalidagi darsga aynan mos keladigan, lekin raqami yo'q darslarga raqam beradi
async function mapSlots() { await run('UPDATE timetable SET slot=(SELECT no FROM bell_slots b WHERE b.start=timetable.start AND b.end=timetable.end) WHERE slot IS NULL'); }
// Amal qilish oralig'i kesishgan darslargina to'qnashadi (eski va yangi versiya bir-biriga xalaqit bermaydi)
const OVL = ' AND (t.valid_from IS NULL OR ? IS NULL OR t.valid_from<=?) AND (? IS NULL OR t.valid_to IS NULL OR ?<=t.valid_to)';
const dAdd = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ACT = (a = 't.') => `(${a}valid_from IS NULL OR ${a}valid_from<=?) AND (${a}valid_to IS NULL OR ${a}valid_to>=?)`; // berilgan sanada amalda (2 ta parametr: sana, sana)
async function conflict(b, skip = 0) {
  const base = 'SELECT t.*,c.name cn,u.name un FROM timetable t JOIN classes c ON c.id=t.class_id JOIN users u ON u.id=t.teacher_id WHERE t.weekday=? AND t.start<? AND t.end>? AND t.id!=?' + OVL;
  const vf = b.vf || null, vt = b.vt || null;
  for (const r of await q(base, [b.weekday, b.end, b.start, skip, vt, vt, vf, vf])) {
    if (r.teacher_id == b.teacher_id) bad(`To'qnashuv: ${r.un} ${r.start}–${r.end} da ${r.cn} sinfida darsi bor`, 409);
    if (r.class_id == b.class_id) bad(`To'qnashuv: ${r.cn} sinfida ${r.start}–${r.end} da boshqa dars bor`, 409);
    if (b.room && r.room && r.room === b.room) bad(`To'qnashuv: ${b.room}-xona ${r.start}–${r.end} da band`, 409);
  }
}
const needStudent = async (id, c) => { const s = await one('SELECT * FROM students WHERE id=?', [id]); if (!s || s.class_id != c) bad('O\'quvchi bu sinfga tegishli emas'); if (s.status !== 'faol') bad('O\'quvchi arxivlangan'); return s; };

const routes = [];
const r = (m, p, f) => routes.push([m, new RegExp('^' + p + '$'), f]);

const admFrom = s => { const n = (v, d, lo, hi) => { v = parseInt(v, 10); return v >= lo && v <= hi ? v : d; }; return { max: n(s.adm_max, 4, 1, 30), days: n(s.adm_days, 14, 7, 60), week: n(s.adm_week, 2, 1, 15) }; };
const admCfg = async () => admFrom(Object.fromEntries((await q("SELECT key,value FROM settings WHERE key LIKE 'adm_%'")).map(x => [x.key, x.value])));
r('GET', '/public', async () => { const s = Object.fromEntries((await q('SELECT key,value FROM settings')).map(x => [x.key, x.value])); return { school_name: s.school_name, logo: s.logo || null, brand: s.brand || null, leaders_public: s.public_leaders === '1', adm: admFrom(s) }; });
r('POST', '/login', async ({ b, ip }) => {
  if (!SECRET) bad('Server sozlanmagan', 500);
  const fk = failKey(ip, b.login), lk = loginKey(b.login); if (locked(fk) || locked(lk, 30)) bad("Juda ko'p noto'g'ri urinish. 10 daqiqadan keyin qayta urinib ko'ring", 429);
  const lg = String(b.login || '').trim(), u = await one('SELECT * FROM users WHERE login=?', [lg]);
  if (!u) { // o'quvchi yoki ota-ona hisobi (login xodimlar bilan umumiy nomlar maydonida)
    let kind = 's', a = await one('SELECT a.*,s.name,s.status FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE lower(a.login)=lower(?)', [lg]);
    if (!a) { kind = 'p'; a = await one('SELECT a.*,s.name,s.status FROM parent_accounts a JOIN students s ON s.id=a.student_id WHERE lower(a.login)=lower(?)', [lg]); }
    if (!a || !a.is_active || a.status !== 'faol' || !verify(String(b.password || ''), a.pass)) { failed(fk); failed(lk); bad('Login yoki parol noto\'g\'ri', 401); }
    FAILS.delete(fk); FAILS.delete(lk); await run(`UPDATE ${kind === 'p' ? 'parent_accounts' : 'student_accounts'} SET last_login=? WHERE student_id=?`, [now(), a.student_id]);
    return { body: { id: a.student_id, name: a.name, role: kind === 'p' ? 'parent' : 'student' }, cookie: sign({ id: a.student_id, k: kind, pv: a.pass.slice(-12), exp: Date.now() + 12 * 3600e3 }) };
  }
  if (!u.is_active || !verify(String(b.password || ''), u.pass)) { failed(fk); failed(lk); bad('Login yoki parol noto\'g\'ri', 401); }
  FAILS.delete(fk); FAILS.delete(lk);
  return { body: { id: u.id, name: u.name, role: u.role, fin: await isFin(u) }, cookie: sign({ id: u.id, pv: u.pass.slice(-12), exp: Date.now() + 12 * 3600e3 }) };
});
r('POST', '/me/password', async ({ u, b }) => {
  if (u.role === 'student' || u.role === 'parent') bad("Ruxsat yo'q", 403);
  const a = await one('SELECT pass FROM users WHERE id=?', [u.id]); if (!a || !verify(String(b.old || ''), a.pass)) bad("Joriy parol noto'g'ri", 400);
  const np = String(b.new || ''); if (np.length < 8) bad("Yangi parol kamida 8 belgi bo'lsin"); if (np === b.old) bad('Yangi parol eskisidan farq qilsin');
  const h = hash(np); await run('UPDATE users SET pass=? WHERE id=?', [h, u.id]); await audit(u, 'password', 'user', u.id, null, null);
  return { body: { ok: 1 }, cookie: sign({ id: u.id, pv: h.slice(-12), exp: Date.now() + 12 * 3600e3 }) };
});
r('POST', '/logout', async () => ({ cookie: '' }));
r('GET', '/me', async ({ u }) => (u.role === 'student' || u.role === 'parent' ? u : { ...u, fin: await isFin(u) }));
r('PUT', '/settings', async ({ u, b }) => {
  need(u, 'admin'); const set = (k, v) => run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
  if (b.school_name !== undefined) { const n = String(b.school_name).trim().slice(0, 100); if (n.length < 2) bad('Maktab nomi juda qisqa'); await set('school_name', n); }
  if (b.brand !== undefined && b.brand && !/^#[0-9a-fA-F]{6}$/.test(b.brand)) bad("Rang #RRGGBB formatida bo'lsin");
  if (b.logo && (String(b.logo).length > 300000 || !/^data:image\/(png|jpeg|webp);base64,/.test(b.logo))) bad("Logo PNG/JPG/WEBP va 300 KB dan kichik bo'lsin");
  if (b.public_leaders !== undefined) await set('public_leaders', b.public_leaders ? '1' : '0');
  for (const [k, lo, hi, nm] of [['adm_max', 1, 30, "Ruxsat chegarasi"], ['adm_days', 7, 60, 'Nazorat davri'], ['adm_week', 1, 15, 'Haftalik chegara']]) if (b[k] !== undefined) { const v = parseInt(b[k], 10); if (!(v >= lo && v <= hi)) bad(`${nm} ${lo}–${hi} oralig'ida bo'lsin`); await set(k, String(v)); }
  if (b.brand !== undefined) await set('brand', b.brand || '');
  if (b.logo !== undefined) await set('logo', b.logo || '');
  HOME = null; await audit(u, 'update', 'settings', '-', null, { keys: Object.keys(b) }); return { ok: 1 };
});

const ROLES = ['admin', 'director', 'teacher'];
function profile(b, full) {
  const o = {};
  if (b.photo && String(b.photo).length > 300000) bad("Rasm juda katta");
  for (const k of UF) if (b[k] !== undefined) o[k] = String(b[k] ?? '').trim().slice(0, k === 'photo' ? 300000 : 500) || null;
  if (b.experience_years !== undefined) {
    if (b.experience_years === '' || b.experience_years === null) o.experience_years = null;
    else { const n = +b.experience_years; if (!(n >= 0 && n <= 60)) bad("Staj 0–60 yil oralig'ida bo'lishi kerak"); o.experience_years = Math.round(n); }
  }
  if ((full || 'first_name' in o) && (!o.first_name || o.first_name.length < 2)) bad("Ism kamida 2 harfdan iborat bo'lsin");
  if ((full || 'last_name' in o) && (!o.last_name || o.last_name.length < 2)) bad("Familiya kamida 2 harfdan iborat bo'lsin");
  if (o.phone && !/^\+?[0-9 ()-]{7,20}$/.test(o.phone)) bad("Telefon raqami noto'g'ri");
  if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) bad("Email noto'g'ri");
  for (const d of ['birth_date', 'hire_date']) if (o[d] && !/^\d{4}-\d{2}-\d{2}$/.test(o[d])) bad("Sana formati noto'g'ri");
  if (o.gender && !['erkak', 'ayol'].includes(o.gender)) bad("Jins noto'g'ri");
  if (o.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(o.photo)) bad("Rasm formati noto'g'ri");
  return o;
}
async function subjIds(ids) {
  const c = [...new Set((Array.isArray(ids) ? ids : []).map(Number))];
  for (const x of c) if (!(await one('SELECT 1 x FROM subjects WHERE id=?', [x]))) bad('Fan topilmadi');
  return c;
}
const writeSubj = (uid, c) => db.batch([{ sql: 'DELETE FROM teacher_subjects WHERE user_id=?', args: [uid] }, ...c.map(x => ({ sql: 'INSERT INTO teacher_subjects VALUES(?,?)', args: [uid, x] }))], 'write');
const USEL = 'SELECT id,login,name,first_name,last_name,middle_name,phone,email,birth_date,gender,hire_date,experience_years,education,category,bio,photo,role,is_active FROM users';

r('GET', '/users', async ({ u }) => {
  need(u, 'admin', 'director');
  const us = await q(USEL + ' ORDER BY name');
  const ts = await q('SELECT ts.user_id,s.id sid,s.name FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id');
  us.forEach(x => { x.subjects = ts.filter(t => t.user_id == x.id).map(t => ({ id: t.sid, name: t.name })); });
  return us;
});
r('POST', '/users', async ({ u, b }) => {
  need(u, 'admin'); const o = profile(b, true);
  if (!/^[a-z0-9._-]{3,30}$/i.test(b.login || '')) bad("Login 3–30 ta lotin harf, raqam yoki . _ - belgilaridan iborat bo'lsin");
  if (String(b.password || '').length < 8) bad("Parol kamida 8 belgi bo'lsin");
  if (!ROLES.includes(b.role)) bad("Noto'g'ri rol");
  if (await one('SELECT 1 x FROM users WHERE login=?', [b.login]) || await one('SELECT 1 x FROM student_accounts WHERE lower(login)=lower(?)', [b.login]) || await one('SELECT 1 x FROM parent_accounts WHERE lower(login)=lower(?)', [b.login])) bad('Bu login band', 409);
  const sids = await subjIds(b.subject_ids);
  const name = [o.last_name, o.first_name, o.middle_name].filter(Boolean).join(' ');
  const x = await run(`INSERT INTO users(login,name,pass,role,created_at,experience_years,${UF.join(',')}) VALUES(?,?,?,?,?,?,${UF.map(() => '?').join(',')})`,
    [b.login, name, hash(b.password), b.role, now(), o.experience_years ?? null, ...UF.map(k => o[k] ?? null)]);
  const id = Number(x.lastInsertRowid); await writeSubj(id, sids);
  await audit(u, 'create', 'user', id, null, { login: b.login, role: b.role, subjects: sids }); return { id };
});
r('PATCH', '/users/(\\d+)', async ({ u, b, m }) => {
  need(u, 'admin'); const id = +m[1]; const old = await one('SELECT * FROM users WHERE id=?', [id]); if (!old) bad('Topilmadi', 404);
  if (id === u.id && b.is_active === 0) bad("O'zingizni faolsizlantira olmaysiz");
  if (b.role && !ROLES.includes(b.role)) bad("Noto'g'ri rol");
  if (b.password && String(b.password).length < 8) bad("Parol kamida 8 belgi bo'lsin");
  const o = profile(b, false), sids = b.subject_ids !== undefined ? await subjIds(b.subject_ids) : null;
  const n = { ...old, ...o }; n.name = [n.last_name, n.first_name, n.middle_name].filter(Boolean).join(' ') || old.name;
  await run(`UPDATE users SET name=?,role=?,is_active=?,pass=?,experience_years=?,${UF.map(k => k + '=?').join(',')} WHERE id=?`,
    [n.name, b.role ?? old.role, b.is_active ?? old.is_active, b.password ? hash(b.password) : old.pass, n.experience_years ?? null, ...UF.map(k => n[k] ?? null), id]);
  if (sids) await writeSubj(id, sids);
  await audit(u, 'update', 'user', id, { role: old.role, is_active: old.is_active }, { role: b.role, is_active: b.is_active, fields: Object.keys(o).filter(k => k !== 'photo'), subjects: sids }); return { ok: 1 };
});

r('GET', '/subjects', async () => q('SELECT * FROM subjects ORDER BY name'));
r('POST', '/subjects', async ({ u, b }) => { need(u, 'admin'); if (!b.name) bad('Fan nomi kerak'); await run('INSERT OR IGNORE INTO subjects(name) VALUES(?)', [b.name.trim()]); return { ok: 1 }; });
r('GET', '/classes', async ({ u, qs }) => { // standart: faqat joriy (arxivlanmagan) sinflar; ?archived=only: arxiv sinflar
  const ar = qs.archived === 'only' ? 1 : 0;
  return q(u.role === 'teacher'
    ? 'SELECT DISTINCT c.*,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom FROM classes c LEFT JOIN assignments a ON a.class_id=c.id WHERE c.archived=? AND (c.homeroom_id=? OR a.teacher_id=?) ORDER BY c.year DESC,c.name'
    : 'SELECT c.*,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom FROM classes c WHERE c.archived=? ORDER BY c.year DESC,c.name', u.role === 'teacher' ? [ar, u.id, u.id] : [ar]);
});
r('POST', '/classes', async ({ u, b }) => {
  need(u, 'admin'); if (!b.name || !b.year) bad('Sinf nomi va o\'quv yili kerak');
  try { const x = await run('INSERT INTO classes(name,year,homeroom_id) VALUES(?,?,?)', [b.name.trim(), b.year.trim(), b.homeroom_id || null]); await audit(u, 'create', 'class', x.lastInsertRowid, null, b); return { id: Number(x.lastInsertRowid) }; }
  catch { bad('Bu sinf shu yilda mavjud', 409); }
});
r('GET', '/assignments', async ({ u }) => { const rows = await q('SELECT a.*,s.name subject,u.name teacher,c.name class FROM assignments a JOIN subjects s ON s.id=subject_id JOIN users u ON u.id=teacher_id JOIN classes c ON c.id=class_id'); return u.role === 'teacher' ? rows.filter(x => x.teacher_id === u.id) : rows; });
r('POST', '/assignments', async ({ u, b }) => { need(u, 'admin'); await run('INSERT INTO assignments(class_id,subject_id,teacher_id) VALUES(?,?,?) ON CONFLICT(class_id,subject_id) DO UPDATE SET teacher_id=excluded.teacher_id', [b.class_id, b.subject_id, b.teacher_id]); await audit(u, 'assign', 'assignment', `${b.class_id}-${b.subject_id}`, null, b); return { ok: 1 }; });

r('GET', '/students', async ({ u, qs }) => {
  const c = +qs.class_id; if (!c) bad('class_id kerak'); if (!(await canView(u, c))) bad('Ruxsat yo\'q', 403);
  const hm = await homeroom(u, c); // login nomini faqat admin va sinf rahbari ko'radi (parol hech kimga ko'rsatilmaydi)
  const rows = await q('SELECT s.*,a.login acc_login,a.is_active acc_active,a.last_login acc_last,a.student_id acc,pa.login par_login,pa.is_active par_active,pa.student_id par,(SELECT 1 FROM access_links l WHERE l.student_id=s.id AND l.kind=\'student\') ls,(SELECT 1 FROM access_links l WHERE l.student_id=s.id AND l.kind=\'parent\') lp FROM students s LEFT JOIN student_accounts a ON a.student_id=s.id LEFT JOIN parent_accounts pa ON pa.student_id=s.id WHERE s.class_id=? ORDER BY s.status,s.name', [c]);
  return rows.map(({ acc_login, acc_active, acc_last, acc, par_login, par_active, par, ls, lp, ...x }) => ({ ...x, has_account: acc ? 1 : 0, has_parent: par ? 1 : 0, has_link: ls ? 1 : 0, has_link_parent: lp ? 1 : 0, ...(hm && acc ? { login: acc_login, acc_active, acc_last } : {}), ...(hm && par ? { par_login, par_active } : {}) }));
});
r('POST', '/students', async ({ u, b }) => {
  const c = +b.class_id; if (!(await homeroom(u, c))) bad('Ruxsat yo\'q', 403);
  const rows = Array.isArray(b.rows) ? b.rows : []; let added = 0; const skipped = [];
  for (const [i, x] of rows.entries()) {
    const name = String(x.name || '').trim(), code = String(x.code || '').trim() || null;
    if (name.length < 3) { skipped.push(`${i + 1}-qator: ism noto'g'ri`); continue; }
    if (code && await one('SELECT 1 x FROM students WHERE code=?', [code])) { skipped.push(`${i + 1}-qator: kod takror (${code})`); continue; }
    if (await one('SELECT 1 x FROM students WHERE class_id=? AND lower(name)=lower(?)', [c, name])) { skipped.push(`${i + 1}-qator: takror (${name})`); continue; }
    await run('INSERT INTO students(code,name,class_id,parent_contact) VALUES(?,?,?,?)', [code, name, c, x.parent_contact || null]); added++;
  }
  await audit(u, 'import', 'student', c, null, { added }); return { added, skipped };
});
r('PATCH', '/students/(\\d+)', async ({ u, b, m }) => {
  const s = await one('SELECT * FROM students WHERE id=?', [+m[1]]); if (!s) bad('Topilmadi', 404);
  if (!(await homeroom(u, s.class_id)) || (b.class_id && !(await homeroom(u, +b.class_id)))) bad('Ruxsat yo\'q', 403);
  const name = b.name !== undefined ? String(b.name).trim() : s.name; if (name.length < 3) bad("F.I.Sh. kamida 3 belgi bo'lsin");
  const code = b.code !== undefined ? (String(b.code).trim() || null) : s.code;
  if (code && code !== s.code && await one('SELECT 1 x FROM students WHERE code=? AND id!=?', [code, s.id])) bad('Bu o\'quvchi kodi band', 409);
  const status = b.status ?? s.status; if (!['faol', 'arxiv'].includes(status)) bad("Holat 'faol' yoki 'arxiv' bo'lsin");
  const cls = b.class_id ? +b.class_id : s.class_id; if (!(await one('SELECT 1 x FROM classes WHERE id=?', [cls]))) bad('Sinf topilmadi');
  const pc = b.parent_contact !== undefined ? (String(b.parent_contact).trim().slice(0, 200) || null) : s.parent_contact;
  await run('UPDATE students SET name=?,code=?,class_id=?,status=?,parent_contact=? WHERE id=?', [name, code, cls, status, pc, s.id]);
  await audit(u, 'update', 'student', s.id, { name: s.name, code: s.code, class_id: s.class_id, status: s.status }, { name, code, class_id: cls, status }); return { ok: 1 };
});
// O'quvchini butunlay o'chirish: baho va davomati ham o'chadi (tranzaksiya). Faqat admin yoki sinf rahbari; to'liq nusxa auditga yoziladi.
r('DELETE', '/students/(\\d+)', async ({ u, m }) => {
  const s = await one('SELECT * FROM students WHERE id=?', [+m[1]]); if (!s) bad('Topilmadi', 404);
  if (!(await homeroom(u, s.class_id))) bad('Ruxsat yo\'q', 403);
  const g = await q('SELECT * FROM grades WHERE student_id=?', [s.id]), a = await q('SELECT * FROM attendance WHERE student_id=?', [s.id]);
  await db.batch([{ sql: 'DELETE FROM grades WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM attendance WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM student_accounts WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM parent_accounts WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM admission_resets WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM period_grades WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM access_links WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM fee_plans WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM charges WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM gateway_tx WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM payments WHERE student_id=?', args: [s.id] }, { sql: 'DELETE FROM students WHERE id=?', args: [s.id] }], 'write');
  await chatPurge(s.id); await audit(u, 'delete', 'student', s.id, { student: s, grades: g, attendance: a }, null); return { ok: 1, grades: g.length, attendance: a.length };
});
// ===== O'quvchi hisoblari (login/parol): admin va sinf rahbari beradi; parol faqat yaratilganda bir marta ko'rsatiladi =====
const PWA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genPass = () => Array.from(crypto.randomBytes(8), x => PWA[x % PWA.length]).join('');
const tl = x => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[ʻʼ'`’‘]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const loginBase = name => { const p = String(name).trim().split(/\s+/); const b = tl(p[0]) + (tl(p[1]) ? '.' + tl(p[1])[0] : ''); return (b.length >= 3 ? b : b + 'ucv').slice(0, 24); };
const ACC = { student: 'student_accounts', parent: 'parent_accounts' };
const loginTaken = async (l, sid = 0, kind = 'student') => !!(await one('SELECT 1 x FROM users WHERE lower(login)=lower(?)', [l])) ||
  !!(await one('SELECT 1 x FROM student_accounts WHERE lower(login)=lower(?) AND NOT(?=\'student\' AND student_id=?)', [l, kind, sid])) || !!(await one('SELECT 1 x FROM parent_accounts WHERE lower(login)=lower(?) AND NOT(?=\'parent\' AND student_id=?)', [l, kind, sid]));
async function freeLogin(base) { let l = base, i = 0; while (await loginTaken(l, 0, 'none')) { i++; l = base + (i < 10 ? i : Math.floor(100 + Math.random() * 900)); } return l; }
async function stuManage(u, id) { const s = await one('SELECT * FROM students WHERE id=?', [id]); if (!s) bad('Topilmadi', 404); if (!(await homeroom(u, s.class_id))) bad('Ruxsat yo\'q', 403); return s; }
const parBase = name => ('ota.' + tl(String(name).trim().split(/\s+/)[0])).slice(0, 24);
async function issueAccount(u, s, b, kind = 'student') {
  const T = ACC[kind], ex = await one(`SELECT * FROM ${T} WHERE student_id=?`, [s.id]); let login = ex ? ex.login : null; const want = String(b.login || '').trim().toLowerCase();
  if (want && (!ex || want !== ex.login)) {
    if (!/^[a-z0-9._-]{3,30}$/.test(want)) bad("Login 3–30 ta lotin harf, raqam yoki . _ - belgilaridan iborat bo'lsin");
    if (await loginTaken(want, s.id, kind)) bad('Bu login band', 409); login = want;
  }
  if (!login) login = await freeLogin(kind === 'parent' ? parBase(s.name) : loginBase(s.name));
  let pw = String(b.password || ''); if (pw) { if (pw.length < 8) bad("Parol kamida 8 belgi bo'lsin"); } else pw = genPass();
  if (ex) await run(`UPDATE ${T} SET login=?,pass=?,is_active=1 WHERE student_id=?`, [login, hash(pw), s.id]);
  else await run(`INSERT INTO ${T}(student_id,login,pass,created_at) VALUES(?,?,?,?)`, [s.id, login, hash(pw), now()]);
  await audit(u, ex ? 'reset' : 'create', kind + '_account', s.id, null, { login }); // parol auditga yozilmaydi
  return { id: s.id, name: s.name, login, password: pw, reset: !!ex };
}
r('POST', '/students/(\\d+)/account', async ({ u, b, m }) => { const s = await stuManage(u, +m[1]); if (s.status !== 'faol') bad("Arxivdagi o'quvchiga login berilmaydi"); return issueAccount(u, s, b); });
r('PATCH', '/students/(\\d+)/account', async ({ u, b, m }) => { const s = await stuManage(u, +m[1]); if (!(await one('SELECT 1 x FROM student_accounts WHERE student_id=?', [s.id]))) bad('Hisob yo\'q', 404);
  await run('UPDATE student_accounts SET is_active=? WHERE student_id=?', [b.is_active ? 1 : 0, s.id]); await audit(u, b.is_active ? 'enable' : 'disable', 'student_account', s.id, null, null); return { ok: 1 }; });
r('DELETE', '/students/(\\d+)/account', async ({ u, m }) => { const s = await stuManage(u, +m[1]); await run('DELETE FROM student_accounts WHERE student_id=?', [s.id]); await audit(u, 'delete', 'student_account', s.id, null, null); return { ok: 1 }; });
// butun sinfga: faol, hisobi yo'q o'quvchilarga login va parol yaratadi (varaqani chop etish uchun ro'yxat qaytaradi)

// ===== Shaxsiy kirish havolasi (maxfiy token): login-parolsiz bir bosishda kabinetga kiradi =====
// Token bazada faqat xesh ko'rinishida saqlanadi, shuning uchun u faqat yaratilgan paytda ko'rsatiladi. Yangilansa eskisi ishlamaydi.
const tokHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
async function makeLink(u, s, kind) {
  const T = ACC[kind];
  if (!(await one(`SELECT 1 x FROM ${T} WHERE student_id=?`, [s.id]))) await issueAccount(u, s, {}, kind); // hisob bo'lmasa yashirin tasodifiy parol bilan ochiladi (keyin xohlasangiz login-parol bering)
  const token = crypto.randomBytes(24).toString('base64url');
  await run('INSERT INTO access_links(student_id,kind,token_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(student_id,kind) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_used=NULL', [s.id, kind, tokHash(token), now()]);
  await audit(u, 'link', kind + '_link', s.id, null, null); return { id: s.id, name: s.name, token };
}
const linkKind = k => (k === 'parent' ? 'parent' : 'student');
r('POST', '/students/(\\d+)/link', async ({ u, b, m }) => { const s = await stuManage(u, +m[1]); if (s.status !== 'faol') bad("Arxivdagi o'quvchiga havola berilmaydi"); return makeLink(u, s, linkKind(b.kind)); });
r('DELETE', '/students/(\\d+)/link', async ({ u, qs, m }) => { const s = await stuManage(u, +m[1]); await run('DELETE FROM access_links WHERE student_id=? AND kind=?', [s.id, linkKind(qs.kind)]); await audit(u, 'revoke', 'link', s.id, null, null); return { ok: 1 }; });
r('POST', '/classes/(\\d+)/links', async ({ u, b, m }) => {
  const c = +m[1]; if (!(await homeroom(u, c))) bad("Ruxsat yo'q", 403); const kind = linkKind(b.kind);
  const L = await q(`SELECT s.* FROM students s WHERE s.class_id=? AND s.status='faol'${b.regen ? '' : ' AND NOT EXISTS(SELECT 1 FROM access_links l WHERE l.student_id=s.id AND l.kind=?)'} ORDER BY s.name`, b.regen ? [c] : [c, kind]);
  const links = []; for (const s of L) links.push(await makeLink(u, s, kind)); return { links, skipped: (await one("SELECT COUNT(*) n FROM students WHERE class_id=? AND status='faol'", [c])).n - links.length };
});
r('POST', '/link-login', async ({ b, ip }) => {
  if (!SECRET) bad('Server sozlanmagan', 500);
  const fk = 'K|' + ip; if (locked(fk)) bad("Juda ko'p noto'g'ri urinish. Keyinroq urinib ko'ring", 429);
  const t = String(b.token || ''); const l = /^[A-Za-z0-9_-]{20,64}$/.test(t) ? await one('SELECT * FROM access_links WHERE token_hash=?', [tokHash(t)]) : null;
  const par = l && l.kind === 'parent', a = l && await one(`SELECT s.id,s.name,a.pass FROM students s JOIN ${par ? 'parent_accounts' : 'student_accounts'} a ON a.student_id=s.id WHERE s.id=? AND a.is_active=1 AND s.status='faol'`, [l.student_id]);
  if (!a) { failed(fk); bad("Havola yaroqsiz yoki bekor qilingan. Sinf rahbaringizdan yangisini so'rang", 401); }
  FAILS.delete(fk); await run('UPDATE access_links SET last_used=? WHERE student_id=? AND kind=?', [now(), l.student_id, l.kind]);
  await run(`UPDATE ${par ? 'parent_accounts' : 'student_accounts'} SET last_login=? WHERE student_id=?`, [now(), a.id]);
  return { body: { id: a.id, name: a.name, role: par ? 'parent' : 'student' }, cookie: sign({ id: a.id, k: par ? 'p' : 's', pv: a.pass.slice(-12), exp: Date.now() + 12 * 3600e3 }) };
});
r('POST', '/classes/(\\d+)/accounts', async ({ u, m }) => {
  const c = +m[1]; if (!(await homeroom(u, c))) bad('Ruxsat yo\'q', 403);
  const L = await q("SELECT s.* FROM students s WHERE s.class_id=? AND s.status='faol' AND NOT EXISTS(SELECT 1 FROM student_accounts a WHERE a.student_id=s.id) ORDER BY s.name", [c]);
  const created = []; for (const s of L) created.push(await issueAccount(u, s, {}));
  const have = (await one("SELECT COUNT(*) n FROM students s JOIN student_accounts a ON a.student_id=s.id WHERE s.class_id=? AND s.status='faol'", [c])).n - created.length;
  return { created, already: have };
});
r('POST', '/students/(\\d+)/parent', async ({ u, b, m }) => { const s = await stuManage(u, +m[1]); if (s.status !== 'faol') bad("Arxivdagi o'quvchining ota-onasiga login berilmaydi"); return issueAccount(u, s, b, 'parent'); });
r('PATCH', '/students/(\\d+)/parent', async ({ u, b, m }) => { const s = await stuManage(u, +m[1]); if (!(await one('SELECT 1 x FROM parent_accounts WHERE student_id=?', [s.id]))) bad('Hisob yo\'q', 404);
  await run('UPDATE parent_accounts SET is_active=? WHERE student_id=?', [b.is_active ? 1 : 0, s.id]); await audit(u, b.is_active ? 'enable' : 'disable', 'parent_account', s.id, null, null); return { ok: 1 }; });
r('DELETE', '/students/(\\d+)/parent', async ({ u, m }) => { const s = await stuManage(u, +m[1]); await run('DELETE FROM parent_accounts WHERE student_id=?', [s.id]); await audit(u, 'delete', 'parent_account', s.id, null, null); return { ok: 1 }; });
r('POST', '/classes/(\\d+)/parents', async ({ u, m }) => {
  const c = +m[1]; if (!(await homeroom(u, c))) bad('Ruxsat yo\'q', 403);
  const L = await q("SELECT s.* FROM students s WHERE s.class_id=? AND s.status='faol' AND NOT EXISTS(SELECT 1 FROM parent_accounts a WHERE a.student_id=s.id) ORDER BY s.name", [c]);
  const created = []; for (const s of L) created.push(await issueAccount(u, s, {}, 'parent'));
  const have = (await one("SELECT COUNT(*) n FROM students s JOIN parent_accounts a ON a.student_id=s.id WHERE s.class_id=? AND s.status='faol'", [c])).n - created.length;
  return { created, already: have };
});
// ===== E'lonlar: admin/direktor yozadi, auditoriya bo'yicha ko'rinadi =====
const AUD = { admin: ['all', 'staff', 'students', 'parents'], director: ['all', 'staff', 'students', 'parents'], teacher: ['all', 'staff'], student: ['all', 'students'], parent: ['all', 'parents'] };
const newsFor = async u => { const a = AUD[u.role] || ['all']; return q(`SELECT n.id,n.title,n.body,n.audience,n.pinned,n.created_at,(SELECT name FROM users WHERE id=n.author_id) author FROM announcements n WHERE n.audience IN(${a.map(() => '?').join(',')}) ORDER BY n.pinned DESC,n.id DESC LIMIT 100`, a); };
r('GET', '/announcements', async ({ u }) => newsFor(u));
r('GET', '/student/news', async ({ u }) => { needS(u); return newsFor(u); });
const newsIn = b => { const t = String(b.title || '').trim(), body = String(b.body || '').trim(), aud = b.audience || 'all'; if (!t || t.length > 150) bad("Sarlavha 1–150 belgi bo'lsin"); if (!body || body.length > 4000) bad("Matn 1–4000 belgi bo'lsin"); if (!AUD.admin.includes(aud)) bad("Noto'g'ri auditoriya"); return [t, body, aud, b.pinned ? 1 : 0]; };
r('POST', '/announcements', async ({ u, b }) => { need(u, 'admin', 'director'); const v = newsIn(b); const x = await run('INSERT INTO announcements(title,body,audience,pinned,author_id,created_at) VALUES(?,?,?,?,?,?)', [...v, u.id, now()]); tgAnn(v[0], v[1], v[2]); await audit(u, 'create', 'announcement', Number(x.lastInsertRowid), null, { title: v[0] }); return { id: Number(x.lastInsertRowid) }; });
r('PUT', '/announcements/(\\d+)', async ({ u, b, m }) => { need(u, 'admin', 'director'); if (!(await one('SELECT 1 x FROM announcements WHERE id=?', [+m[1]]))) bad('Topilmadi', 404); await run('UPDATE announcements SET title=?,body=?,audience=?,pinned=? WHERE id=?', [...newsIn(b), +m[1]]); await audit(u, 'update', 'announcement', +m[1], null, null); return { ok: 1 }; });
r('DELETE', '/announcements/(\\d+)', async ({ u, m }) => { need(u, 'admin', 'director'); await run('DELETE FROM announcements WHERE id=?', [+m[1]]); await audit(u, 'delete', 'announcement', +m[1], null, null); return { ok: 1 }; });
// ===== Nazorat imtihoniga ruxsat: so'nggi N kunda uzrsiz ('kelmadi') darslar soni chegaradan oshsa ruxsat yo'q =====
const addDays = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
async function admission(where = '', args = []) {
  const cfg = await admCfg(), t = tashkentToday(), from = addDays(t, -cfg.days), wk = addDays(t, -7);
  const rows = await q(`SELECT a.student_id,a.subject_id,sb.name subject,st.name student,st.class_id,c.name class,a.date,l.topic FROM attendance a
    JOIN students st ON st.id=a.student_id AND st.status='faol' JOIN subjects sb ON sb.id=a.subject_id JOIN classes c ON c.id=st.class_id
    LEFT JOIN lessons l ON l.class_id=a.class_id AND l.subject_id=a.subject_id AND l.date=a.date
    LEFT JOIN admission_resets r ON r.student_id=a.student_id AND r.subject_id=a.subject_id
    WHERE a.status='kelmadi' AND a.date>? AND a.date<=? AND (r.cleared_on IS NULL OR a.date>r.cleared_on) ${where} ORDER BY a.date`, [from, t, ...args]);
  const G = new Map();
  for (const x of rows) { const k = x.student_id + ':' + x.subject_id; let g = G.get(k); if (!g) G.set(k, g = { student_id: x.student_id, student: x.student, class_id: x.class_id, class: x.class, subject_id: x.subject_id, subject: x.subject, absences: 0, week: 0, missed: [] }); g.absences++; if (x.date > wk) g.week++; g.missed.push({ date: x.date, topic: x.topic || '' }); }
  const items = [...G.values()].map(g => ({ ...g, blocked: g.absences >= cfg.max, warn: g.absences < cfg.max && (g.week >= cfg.week || g.absences >= cfg.max - 1) })).filter(g => g.blocked || g.warn)
    .sort((a, b) => b.blocked - a.blocked || b.absences - a.absences || a.class.localeCompare(b.class) || a.student.localeCompare(b.student));
  return { cfg, items };
}
r('GET', '/admission', async ({ u, qs }) => {
  need(u, 'admin', 'director', 'teacher'); const c = +qs.class_id || 0;
  if (c && !(await canView(u, c))) bad("Ruxsat yo'q", 403);
  const R = await admission(c ? 'AND st.class_id=?' : '', c ? [c] : []);
  if (u.role === 'teacher') { const ok = new Map(), keep = []; for (const g of R.items) { const k = g.class_id + ':' + g.subject_id; if (!ok.has(k)) ok.set(k, (await homeroom(u, g.class_id)) || (await teaches(u, g.class_id, g.subject_id))); if (ok.get(k)) keep.push(g); } R.items = keep; }
  return R;
});
r('POST', '/admission/clear', async ({ u, b }) => { // mavzu qayta topshirildi (otrabotka): hisob shu kundan qayta boshlanadi
  need(u, 'admin', 'teacher'); const st = await one('SELECT * FROM students WHERE id=?', [+b.student_id]), sid = +b.subject_id;
  if (!st || !sid) bad('Topilmadi', 404); if (!(await teaches(u, st.class_id, sid)) && !(await homeroom(u, st.class_id))) bad("Ruxsat yo'q", 403);
  await run('INSERT INTO admission_resets(student_id,subject_id,cleared_on,note,by_id) VALUES(?,?,?,?,?) ON CONFLICT(student_id,subject_id) DO UPDATE SET cleared_on=excluded.cleared_on,note=excluded.note,by_id=excluded.by_id', [st.id, sid, tashkentToday(), String(b.note || '').slice(0, 200), u.id]);
  await audit(u, 'admission_clear', 'student', st.id, null, { subject_id: sid }); return { ok: 1 };
});
// ===== O'quvchi kabineti (faqat o'z ma'lumotlari, faqat o'qish) =====
const needS = u => { if (u.role !== 'student' && u.role !== 'parent') bad('Ruxsat yo\'q', 403); };
r('GET', '/student/overview', async ({ u }) => {
  needS(u);
  const s = await one('SELECT st.id,st.name,st.code,c.id class_id,c.name class_name,c.year,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom FROM students st JOIN classes c ON c.id=st.class_id WHERE st.id=?', [u.id]);
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  return {
    student: s, role: u.role, finals: await q('SELECT p.kind,p.term_id,p.value,sb.name subject,t.name term FROM period_grades p JOIN subjects sb ON sb.id=p.subject_id LEFT JOIN terms t ON t.id=p.term_id WHERE p.student_id=? ORDER BY sb.name', [u.id]), admission: await admission('AND a.student_id=?', [u.id]),
    grades: await q('SELECT x.date,x.type,x.value,x.max,x.comment,x.subject_id,sb.name subject FROM grades x JOIN subjects sb ON sb.id=x.subject_id WHERE x.student_id=? ORDER BY x.date DESC,x.id DESC LIMIT 600', [u.id]),
    attendance: await q('SELECT x.date,x.status,x.note,sb.name subject FROM attendance x JOIN subjects sb ON sb.id=x.subject_id WHERE x.student_id=? ORDER BY x.date DESC LIMIT 600', [u.id]),
    timetable: await q('SELECT t.id,t.class_id,t.subject_id,t.weekday,t.start,t.end,t.room,t.slot,c.name class,sb.name subject,us.name teacher FROM timetable t JOIN classes c ON c.id=t.class_id JOIN subjects sb ON sb.id=t.subject_id JOIN users us ON us.id=t.teacher_id WHERE t.class_id=? AND ' + ACT() + ' ORDER BY t.weekday,COALESCE(t.slot,99),t.start', [s.class_id, tashkentToday(), tashkentToday()]),
    slots: await q('SELECT no,start,end FROM bell_slots ORDER BY no'),
    lessons: await q('SELECT l.date,sb.name subject,l.topic,l.homework FROM lessons l JOIN subjects sb ON sb.id=l.subject_id WHERE l.class_id=? AND l.date>=? AND (COALESCE(l.topic,\'\')!=\'\' OR COALESCE(l.homework,\'\')!=\'\') ORDER BY l.date DESC LIMIT 120', [s.class_id, since])
  };
});
r('POST', '/student/password', async ({ u, b }) => {
  needS(u); const kind = u.role === 'parent' ? 'parent' : 'student', T = ACC[kind], a = await one(`SELECT * FROM ${T} WHERE student_id=?`, [u.id]);
  if (!a || !verify(String(b.old || ''), a.pass)) bad('Joriy parol noto\'g\'ri', 400);
  const np = String(b.new || ''); if (np.length < 8) bad("Yangi parol kamida 8 belgi bo'lsin"); if (np === b.old) bad('Yangi parol eskisidan farq qilsin');
  const h = hash(np); await run(`UPDATE ${T} SET pass=? WHERE student_id=?`, [h, u.id]); await audit(u, 'password', kind + '_account', u.id, null, null);
  return { body: { ok: 1 }, cookie: sign({ id: u.id, k: kind[0], pv: h.slice(-12), exp: Date.now() + 12 * 3600e3 }) };
});
// O'quvchi individual sahifasi: o'qituvchi faqat o'z fanlarini ko'radi, sinf rahbari/admin/direktor hammasini
r('GET', '/students/(\\d+)', async ({ u, m }) => {
  const s = await one('SELECT st.*,c.name class_name,c.year FROM students st JOIN classes c ON c.id=st.class_id WHERE st.id=?', [+m[1]]); if (!s) bad('Topilmadi', 404);
  if (!(await canView(u, s.class_id))) bad('Ruxsat yo\'q', 403);
  const own = u.role === 'teacher' && !(await homeroom(u, s.class_id));
  const sf = own ? ' AND x.subject_id IN(SELECT subject_id FROM assignments WHERE teacher_id=' + (+u.id) + ')' : '';
  return {
    student: s,
    grades: await q(`SELECT x.date,x.type,x.value,x.max,x.comment,sb.name subject,c.name class_name FROM grades x JOIN subjects sb ON sb.id=x.subject_id JOIN classes c ON c.id=x.class_id WHERE x.student_id=?${sf} ORDER BY x.date DESC`, [s.id]),
    attendance: await q(`SELECT x.date,x.status,x.note,sb.name subject FROM attendance x JOIN subjects sb ON sb.id=x.subject_id WHERE x.student_id=?${sf} ORDER BY x.date DESC`, [s.id])
  };
});

// ===== O'quv yili, chorak, dars vaqtlari, baholash turlari =====
const dOk = (d, n) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') || bad(n + ' formati YYYY-MM-DD bo\'lsin');
r('GET', '/academic_years', async () => ({ years: await q('SELECT * FROM academic_years ORDER BY start_date DESC'), terms: await q('SELECT * FROM terms ORDER BY start_date') }));
r('POST', '/academic_years', async ({ u, b }) => {
  need(u, 'admin'); const name = String(b.name || '').trim(); if (!name) bad("O'quv yili nomi kerak");
  dOk(b.start_date, 'Boshlanish sanasi'); dOk(b.end_date, 'Tugash sanasi'); if (b.start_date >= b.end_date) bad('Tugash sanasi boshlanishdan keyin bo\'lsin');
  if (await one('SELECT 1 x FROM academic_years WHERE name=?', [name])) bad('Bu o\'quv yili mavjud', 409);
  const cur = b.is_current ? 1 : 0, stmts = [];
  if (cur) stmts.push({ sql: 'UPDATE academic_years SET is_current=0', args: [] });
  stmts.push({ sql: 'INSERT INTO academic_years(name,start_date,end_date,is_current) VALUES(?,?,?,?)', args: [name, b.start_date, b.end_date, cur] });
  await db.batch(stmts, 'write'); await audit(u, 'create', 'academic_year', name, null, b); return { ok: 1 };
});
r('PATCH', '/academic_years/(\\d+)', async ({ u, b, m }) => {
  need(u, 'admin'); const id = +m[1], y = await one('SELECT * FROM academic_years WHERE id=?', [id]); if (!y) bad('Topilmadi', 404);
  const st = b.start_date ?? y.start_date, en = b.end_date ?? y.end_date; dOk(st, 'Boshlanish sanasi'); dOk(en, 'Tugash sanasi'); if (st >= en) bad('Tugash sanasi boshlanishdan keyin bo\'lsin');
  const stmts = []; if (b.is_current) stmts.push({ sql: 'UPDATE academic_years SET is_current=0', args: [] });
  stmts.push({ sql: 'UPDATE academic_years SET name=?,start_date=?,end_date=?,is_current=? WHERE id=?', args: [String(b.name ?? y.name).trim(), st, en, b.is_current === undefined ? y.is_current : (b.is_current ? 1 : 0), id] });
  await db.batch(stmts, 'write'); await audit(u, 'update', 'academic_year', id, y, b); return { ok: 1 };
});
r('POST', '/terms', async ({ u, b }) => {
  need(u, 'admin'); const y = await one('SELECT * FROM academic_years WHERE id=?', [+b.year_id]); if (!y) bad("O'quv yili topilmadi");
  const name = String(b.name || '').trim(); if (!name) bad('Chorak/semestr nomi kerak'); dOk(b.start_date, 'Boshlanish sanasi'); dOk(b.end_date, 'Tugash sanasi');
  if (b.start_date >= b.end_date) bad('Tugash sanasi boshlanishdan keyin bo\'lsin');
  if (b.start_date < y.start_date || b.end_date > y.end_date) bad("Davr o'quv yili ichida bo'lishi kerak");
  const ov = await one('SELECT name FROM terms WHERE year_id=? AND start_date<=? AND end_date>=?', [y.id, b.end_date, b.start_date]); if (ov) bad(`Davr "${ov.name}" bilan kesishadi`, 409);
  try { await run('INSERT INTO terms(year_id,name,start_date,end_date) VALUES(?,?,?,?)', [y.id, name, b.start_date, b.end_date]); } catch { bad('Bu nomli davr mavjud', 409); }
  await audit(u, 'create', 'term', name, null, b); return { ok: 1 };
});
r('GET', '/bell_slots', async () => q('SELECT * FROM bell_slots ORDER BY no'));
r('PUT', '/bell_slots', async ({ u, b }) => { // butun ro'yxat almashtiriladi (tranzaksiya)
  need(u, 'admin'); const L = Array.isArray(b.slots) ? b.slots : bad("slots massivi kerak");
  if (L.length > 15) bad("Darslar soni 15 dan oshmasin");
  L.forEach((x, i) => { hhmm(x.start); hhmm(x.end); if (x.start >= x.end) bad(`${i + 1}-dars: tugash vaqti boshlanishdan keyin bo'lsin`); if (i && x.start < L[i - 1].end) bad(`${i + 1}-dars oldingi dars bilan kesishadi`); });
  await db.batch([{ sql: 'DELETE FROM bell_slots', args: [] }, ...L.map((x, i) => ({ sql: 'INSERT INTO bell_slots(no,start,end) VALUES(?,?,?)', args: [i + 1, x.start, x.end] }))], 'write');
  await run('UPDATE timetable SET start=(SELECT start FROM bell_slots b WHERE b.no=timetable.slot),end=(SELECT end FROM bell_slots b WHERE b.no=timetable.slot) WHERE slot IS NOT NULL AND EXISTS(SELECT 1 FROM bell_slots b WHERE b.no=timetable.slot)');
  await mapSlots();
  await audit(u, 'update', 'bell_slots', '-', null, { count: L.length }); return { ok: 1 };
});
r('GET', '/grade_types', async () => q('SELECT * FROM grade_types ORDER BY id'));
r('POST', '/grade_types', async ({ u, b }) => {
  need(u, 'admin'); const name = String(b.name || '').trim().toLowerCase(), max = +b.max, w = b.weight === undefined ? 1 : +b.weight;
  if (!name) bad('Baholash turi nomi kerak'); if (!(max > 0 && max <= 1000)) bad("Maksimal ball 0 dan katta bo'lsin"); if (!(w > 0 && w <= 100)) bad("Vazn 0 dan katta bo'lsin");
  await run('INSERT INTO grade_types(name,max,weight) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET max=excluded.max,weight=excluded.weight,is_active=1', [name, max, w]);
  await audit(u, 'upsert', 'grade_type', name, null, { max, weight: w }); return { ok: 1 };
});
r('PATCH', '/grade_types/(\\d+)', async ({ u, b, m }) => {
  need(u, 'admin'); const g = await one('SELECT * FROM grade_types WHERE id=?', [+m[1]]); if (!g) bad('Topilmadi', 404);
  const max = b.max ?? g.max, w = b.weight ?? g.weight; if (!(+max > 0) || !(+w > 0)) bad("Ball va vazn 0 dan katta bo'lsin");
  await run('UPDATE grade_types SET max=?,weight=?,is_active=? WHERE id=?', [+max, +w, b.is_active ?? g.is_active, g.id]); await audit(u, 'update', 'grade_type', g.id, g, b); return { ok: 1 };
});

r('GET', '/timetable', async ({ u, qs }) => {
  const w = [], a = [];
  if (qs.class_id) { w.push('t.class_id=?'); a.push(+qs.class_id); }
  if (qs.teacher_id) { w.push('t.teacher_id=?'); a.push(+qs.teacher_id); }
  if (qs.weekday) { w.push('t.weekday=?'); a.push(+qs.weekday); }
  if (!qs.all) { const d = qs.date || tashkentToday(); dateOk(d); w.push(ACT()); a.push(d, d); } // standart: bugun amaldagi versiya; ?date=YYYY-MM-DD yoki ?all=1
  return q(`SELECT t.*,c.name class,s.name subject,u.name teacher FROM timetable t JOIN classes c ON c.id=class_id JOIN subjects s ON s.id=subject_id JOIN users u ON u.id=teacher_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY weekday,COALESCE(slot,99),start`, a);
});
const ttSave = async (u, b, id) => {
  need(u, 'admin');
  b.class_id = +b.class_id; b.subject_id = +b.subject_id; b.teacher_id = +b.teacher_id; b.weekday = +b.weekday;
  if (!(b.weekday >= 1 && b.weekday <= 7)) bad('Hafta kuni noto\'g\'ri');
  if (!(await one('SELECT 1 x FROM classes WHERE id=?', [b.class_id])) || !(await one('SELECT 1 x FROM subjects WHERE id=?', [b.subject_id])) || !(await one('SELECT 1 x FROM users WHERE id=? AND role=\'teacher\'', [b.teacher_id]))) bad('Sinf, fan yoki o\'qituvchi topilmadi');
  let slot = b.slot ? +b.slot : null;
  if (slot) { const s = await one('SELECT * FROM bell_slots WHERE no=?', [slot]); if (!s) bad(`${slot}-dars vaqti sozlanmagan (Dars jadvali → Qo'ng'iroqlar)`); b.start = s.start; b.end = s.end; }
  hhmm(b.start); hhmm(b.end); if (b.start >= b.end) bad('Tugash vaqti boshlanishdan keyin bo\'lishi kerak');
  if (!slot) slot = (await one('SELECT no FROM bell_slots WHERE start=? AND end=?', [b.start, b.end]) || {}).no || null;
  const eff = b.effective ? String(b.effective) : null; if (eff) dateOk(eff);
  const room = String(b.room || '').trim().slice(0, 20) || null;
  if (id) {
    const old = await one('SELECT * FROM timetable WHERE id=?', [id]); if (!old) bad('Topilmadi', 404);
    if (eff && !(old.valid_from && old.valid_from >= eff)) { // eski versiya tarixga qoladi, o'zgarish eff sanasidan boshlanadi
      if (eff < tashkentToday()) bad("Kuchga kirish sanasi o'tmishda bo'lishi mumkin emas: o'tgan davomat va jurnal o'zgarib ketadi", 400);
      if (old.valid_to && old.valid_to < eff) bad("Bu dars shu sanada amalda emas (" + old.valid_to + " gacha edi)", 400);
      b.vf = eff; b.vt = old.valid_to || null; await conflict(b, id);
      const st = [{ sql: 'UPDATE timetable SET valid_to=? WHERE id=?', args: [dAdd(eff, -1), id] }, { sql: 'INSERT INTO timetable(class_id,subject_id,teacher_id,weekday,start,end,room,slot,valid_from,valid_to) VALUES(?,?,?,?,?,?,?,?,?,?)', args: [b.class_id, b.subject_id, b.teacher_id, b.weekday, b.start, b.end, room, slot, eff, b.vt] }];
      const rs = await db.batch(st, 'write'); const nid = Number(rs[1].lastInsertRowid);
      await audit(u, 'version', 'timetable', id, { valid_to: old.valid_to }, { new_id: nid, from: eff, weekday: b.weekday, slot }); return { id: nid, versioned: true, from: eff };
    }
    b.vf = old.valid_from || null; b.vt = old.valid_to || null; await conflict(b, id);
    await run('UPDATE timetable SET class_id=?,subject_id=?,teacher_id=?,weekday=?,start=?,end=?,room=?,slot=? WHERE id=?', [b.class_id, b.subject_id, b.teacher_id, b.weekday, b.start, b.end, room, slot, id]); await audit(u, 'update', 'timetable', id, null, { class_id: b.class_id, subject_id: b.subject_id, weekday: b.weekday, slot }); return { id }; }
  b.vf = eff; b.vt = null; await conflict(b, 0);
  const x = await run('INSERT INTO timetable(class_id,subject_id,teacher_id,weekday,start,end,room,slot,valid_from) VALUES(?,?,?,?,?,?,?,?,?)', [b.class_id, b.subject_id, b.teacher_id, b.weekday, b.start, b.end, room, slot, eff]);
  // sinf+fan uchun o'qituvchi hali biriktirilmagan bo'lsa, jurnal ruxsati ishlashi uchun avtomatik biriktiriladi
  const had = await one('SELECT 1 x FROM assignments WHERE class_id=? AND subject_id=?', [b.class_id, b.subject_id]);
  if (!had) { await run('INSERT INTO assignments(class_id,subject_id,teacher_id) VALUES(?,?,?)', [b.class_id, b.subject_id, b.teacher_id]); await audit(u, 'assign', 'assignment', `${b.class_id}-${b.subject_id}`, null, { teacher_id: b.teacher_id, auto: 1 }); }
  await audit(u, 'create', 'timetable', Number(x.lastInsertRowid), null, { class_id: b.class_id, subject_id: b.subject_id, weekday: b.weekday, slot });
  return { id: Number(x.lastInsertRowid), assigned: !had };
};
r('POST', '/timetable', async ({ u, b }) => ttSave(u, b));
r('PUT', '/timetable/(\\d+)', async ({ u, b, m }) => ttSave(u, b, +m[1]));
// O'chirish: effective berilsa dars shu sanadan boshlab yo'qoladi (tarix saqlanadi); bermasa va dars hali boshlanmagan/chegarasiz bo'lsa to'liq o'chadi
r('DELETE', '/timetable/(\\d+)', async ({ u, m, qs, b }) => {
  need(u, 'admin'); const o = await one('SELECT * FROM timetable WHERE id=?', [+m[1]]); if (!o) bad('Topilmadi', 404);
  const eff = qs.effective || (b && b.effective) || null;
  if (!eff) { await run('DELETE FROM timetable WHERE id=?', [o.id]); await audit(u, 'delete', 'timetable', o.id, o, null); return { ok: 1 }; }
  dateOk(eff); if (eff < tashkentToday()) bad("Kuchga kirish sanasi o'tmishda bo'lishi mumkin emas", 400);
  if (o.valid_from && o.valid_from >= eff) await run('DELETE FROM timetable WHERE id=?', [o.id]);
  else if (o.valid_to && o.valid_to < eff) bad("Bu dars shu sanada allaqachon amalda emas", 400);
  else await run('UPDATE timetable SET valid_to=? WHERE id=?', [dAdd(eff, -1), o.id]);
  await audit(u, 'end', 'timetable', o.id, o, { effective: eff }); return { ok: 1, ended_from: eff };
});
// Yangi versiya (masalan, yangi semestr): amaldagi jadval 'from' sanasidan boshlab nusxalanadi, eskisi 'from' dan oldin tugaydi. So'ng yangi nusxani erkin tahrirlash mumkin.
r('POST', '/timetable/version', async ({ u, b }) => {
  need(u, 'admin'); const from = String(b.from || ''); dateOk(from); if (from < tashkentToday()) bad("Yangi versiya sanasi o'tmishda bo'lishi mumkin emas", 400);
  const cls = +b.class_id || 0, rows = await q(`SELECT * FROM timetable t WHERE ${ACT()} AND (t.valid_from IS NULL OR t.valid_from<?)${cls ? ' AND t.class_id=?' : ''}`, [from, from, from, ...(cls ? [cls] : [])]);
  if (!rows.length) bad("Bu sanada amaldagi dars yo'q: nusxalash uchun jadval kerak", 400);
  const st = []; for (const x of rows) st.push({ sql: 'UPDATE timetable SET valid_to=? WHERE id=?', args: [dAdd(from, -1), x.id] }, { sql: 'INSERT INTO timetable(class_id,subject_id,teacher_id,weekday,start,end,room,slot,valid_from,valid_to) VALUES(?,?,?,?,?,?,?,?,?,?)', args: [x.class_id, x.subject_id, x.teacher_id, x.weekday, x.start, x.end, x.room, x.slot, from, x.valid_to] });
  await db.batch(st, 'write'); await audit(u, 'version', 'timetable', '-', null, { from, copied: rows.length, class_id: cls || null }); return { ok: 1, copied: rows.length, from };
});
// Versiyalar ro'yxati: har bir boshlanish sanasi va shu sanadan boshlanadigan darslar soni
r('GET', '/timetable/versions', async ({ u }) => {
  need(u, 'admin', 'director'); const today = tashkentToday();
  return { today, versions: await q("SELECT COALESCE(valid_from,'') from_date,COUNT(*) n FROM timetable GROUP BY valid_from ORDER BY valid_from"), ends: await q('SELECT valid_to to_date,COUNT(*) n FROM timetable WHERE valid_to IS NOT NULL GROUP BY valid_to ORDER BY valid_to') };
});

r('GET', '/journal', async ({ u, qs }) => {
  const c = +qs.class_id, s = +qs.subject_id; if (!c || !s) bad('class_id va subject_id kerak');
  if (!(await canView(u, c, s))) bad('Ruxsat yo\'q', 403);
  const p = [c, s];
  return {
    can_edit: await teaches(u, c, s),
    students: (await one('SELECT archived FROM classes WHERE id=?', [c])).archived // arxiv sinf: baho/davomati bor o'quvchilar (boshqa sinfga o'tgan yoki bitirganlar ham) ko'rinadi
      ? await q('SELECT id,name,code,1 moved FROM students WHERE id IN(SELECT student_id FROM grades WHERE class_id=? UNION SELECT student_id FROM attendance WHERE class_id=?) ORDER BY name', [c, c])
      : await q("SELECT id,name,code FROM students WHERE class_id=? AND status='faol' ORDER BY name", [c]),
    grades: await q('SELECT student_id,date,type,value,max,comment FROM grades WHERE class_id=? AND subject_id=?', p),
    attendance: await q('SELECT student_id,date,slot,status,note FROM attendance WHERE class_id=? AND subject_id=?', p),
    lessons: await q('SELECT date,topic,homework,note FROM lessons WHERE class_id=? AND subject_id=? ORDER BY date DESC LIMIT 500', p),
    schedule: await q('SELECT DISTINCT weekday,COALESCE(slot,0) slot,valid_from vf,valid_to vt FROM timetable WHERE class_id=? AND subject_id=? ORDER BY weekday,slot', p), // jurnal ustunlari dars jadvaliga mos
    terms: await q('SELECT t.name,t.start_date,t.end_date,y.name year,y.is_current FROM terms t JOIN academic_years y ON y.id=t.year_id ORDER BY t.start_date')
  };
});
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') || bad('Sana formati YYYY-MM-DD');
r('PUT', '/grades', async ({ u, b }) => {
  const { student_id: sid, class_id: c, subject_id: s, date, type } = b; dateOk(date);
  if (!(await teaches(u, c, s))) bad('Bu sinf/fan uchun ruxsatingiz yo\'q', 403); await needStudent(sid, c);
  const old = await one('SELECT * FROM grades WHERE student_id=? AND subject_id=? AND date=? AND type=?', [sid, s, date, type]);
  if (b.value === null || b.value === '' || b.value === undefined) { // baho o'chirish: nol emas, yozuv yo'q
    if (old) { await run('DELETE FROM grades WHERE id=?', [old.id]); await audit(u, 'delete', 'grade', old.id, old, null); } return { ok: 1 };
  }
  const max = +b.max || 5, v = +b.value; if (!(v >= 0 && v <= max)) bad(`Baho 0 dan ${max} gacha bo'lishi kerak`);
  await run('INSERT INTO grades(student_id,class_id,subject_id,teacher_id,date,type,value,max,comment) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,date,type) DO UPDATE SET value=excluded.value,max=excluded.max,comment=excluded.comment,teacher_id=excluded.teacher_id', [sid, c, s, u.id, date, type, v, max, b.comment || null]);
  await audit(u, old ? 'update' : 'create', 'grade', `${sid}-${s}-${date}-${type}`, old && { value: old.value, max: old.max }, { value: v, max }); if (!old || old.value !== v) tgGrade(sid, s, date, v, max, type); return { ok: 1 };
});
r('PUT', '/attendance', async ({ u, b }) => {
  const { student_id: sid, class_id: c, subject_id: sj, date } = b; dateOk(date);
  const slot = b.slot === undefined || b.slot === null || b.slot === '' ? 0 : +b.slot; if (!Number.isInteger(slot) || slot < 0 || slot > 15) bad("Dars raqami 0–15 bo'lsin");
  if (!(await teaches(u, c, sj))) bad('Ruxsatingiz yo\'q', 403); await needStudent(sid, c);
  const old = await one('SELECT * FROM attendance WHERE student_id=? AND subject_id=? AND date=? AND slot=?', [sid, sj, date, slot]);
  if (!b.status) { if (old) { await run('DELETE FROM attendance WHERE id=?', [old.id]); await audit(u, 'delete', 'attendance', old.id, old, null); } return { ok: 1 }; }
  if (!ST.includes(b.status)) bad('Noto\'g\'ri holat');
  await run('INSERT INTO attendance(student_id,class_id,subject_id,date,slot,status,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,date,slot) DO UPDATE SET status=excluded.status,note=excluded.note', [sid, c, sj, date, slot, b.status, b.note || null]);
  await audit(u, old ? 'update' : 'create', 'attendance', `${sid}-${sj}-${date}-${slot}`, old && { status: old.status, note: old.note }, { status: b.status, note: b.note || null });
  if (b.status !== (old && old.status) && (b.status === 'kelmadi' || b.status === 'kechikdi')) tgAbs(sid, sj, date, b.status); return { ok: 1 };
});
r('PUT', '/lessons', async ({ u, b }) => {
  const { class_id: c, subject_id: s, date } = b; dateOk(date); if (!(await teaches(u, c, s))) bad('Ruxsatingiz yo\'q', 403);
  const old = await one('SELECT * FROM lessons WHERE class_id=? AND subject_id=? AND date=?', [c, s, date]);
  await run('INSERT INTO lessons(class_id,subject_id,teacher_id,date,topic,homework,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(class_id,subject_id,date) DO UPDATE SET topic=excluded.topic,homework=excluded.homework,note=excluded.note,teacher_id=excluded.teacher_id', [c, s, u.id, date, b.topic || '', b.homework || '', b.note || '']);
  await audit(u, old ? 'update' : 'create', 'lesson', `${c}-${s}-${date}`, old && { topic: old.topic, homework: old.homework }, { topic: b.topic, homework: b.homework }); return { ok: 1 };
});
r('GET', '/reports/class', async ({ u, qs }) => {
  const c = +qs.class_id; if (!(await canView(u, c))) bad('Ruxsat yo\'q', 403);
  const own = u.role === 'teacher' && !(await homeroom(u, c)); // fan o'qituvchisi faqat o'z fanlarini ko'radi
  const sf = own ? 'AND g.subject_id IN(SELECT subject_id FROM assignments WHERE class_id=? AND teacher_id=?)' : '';
  const sa = own ? [c, c, u.id] : [c, c];
  return {
    students: await q("SELECT id,name FROM students WHERE class_id=? AND status='faol' ORDER BY name", [c]),
    grades: await q(`SELECT g.student_id,s.name subject,ROUND(AVG(g.value*100.0/g.max),1) pct,COUNT(*) n FROM grades g JOIN subjects s ON s.id=g.subject_id WHERE g.class_id=? ${sf.replace('g.class_id=?', '')} GROUP BY g.student_id,g.subject_id`, own ? [c, c, u.id] : [c]),
    attendance: own ? [] : await q('SELECT student_id,status,COUNT(*) n FROM attendance WHERE class_id=? GROUP BY student_id,status', [c])
  };
});
r('GET', '/audit', async ({ u }) => { need(u, 'admin'); return q('SELECT a.*,u.name user FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200'); });

// ===== Hisobotlar, boshqaruv paneli, Excel =====
const tashkentToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
const rangeOk = qs => { dOk(qs.from, 'from'); dOk(qs.to, 'to'); if (qs.from > qs.to) bad("Boshlanish sanasi tugashdan keyin bo'lmasin"); if ((Date.parse(qs.to) - Date.parse(qs.from)) / 864e5 > 366) bad("Davr 1 yildan oshmasin"); };
r('GET', '/reports/attendance', async ({ u, qs }) => { // sinf bo'yicha davomat: kun/hafta/oy/chorak — from..to bilan
  const c = +qs.class_id; if (!c) bad('class_id kerak'); rangeOk(qs); if (!(await canView(u, c))) bad('Ruxsat yo\'q', 403);
  const own = u.role === 'teacher' && !(await homeroom(u, c)), a = [c, qs.from, qs.to]; let f = '';
  if (own) { f = ' AND subject_id IN(SELECT subject_id FROM assignments WHERE class_id=? AND teacher_id=?)'; a.push(c, u.id); }
  if (qs.subject_id) { f += ' AND subject_id=?'; a.push(+qs.subject_id); }
  const rows = await q(`SELECT student_id,status,COUNT(*) n FROM attendance WHERE class_id=? AND date BETWEEN ? AND ?${f} GROUP BY student_id,status`, a);
  const students = (await q('SELECT id,name,status FROM students WHERE class_id=? ORDER BY status,name', [c])).map(s => {
    const o = { id: s.id, name: s.name, status: s.status, keldi: 0, kelmadi: 0, kechikdi: 0, uzrli: 0 };
    rows.filter(x => x.student_id === s.id).forEach(x => { o[x.status] = x.n; }); o.jami = o.keldi + o.kelmadi + o.kechikdi + o.uzrli; return o;
  });
  const total = { keldi: 0, kelmadi: 0, kechikdi: 0, uzrli: 0 }; students.forEach(s => { for (const k in total) total[k] += s[k]; });
  return { from: qs.from, to: qs.to, students, total, note: "Faqat belgilangan davomat hisoblanadi; belgilanmagan 'keldi' deb olinmaydi." };
});
r('GET', '/reports/journal_fill', async ({ u, qs }) => { // o'qituvchi jadvalidagi darslar va ularning mavzusi kiritilganlik holati
  need(u, 'admin', 'director', 'teacher'); rangeOk(qs);
  const tid = u.role === 'teacher' ? u.id : (+qs.teacher_id || 0);
  const tt = await q(`SELECT t.class_id,t.subject_id,t.teacher_id,t.weekday,t.valid_from,t.valid_to,c.name class,s.name subject,us.name teacher FROM timetable t JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id JOIN users us ON us.id=t.teacher_id${tid ? ' WHERE t.teacher_id=?' : ''}`, tid ? [tid] : []);
  const done = new Set((await q("SELECT class_id,subject_id,date FROM lessons WHERE date BETWEEN ? AND ? AND trim(coalesce(topic,''))!=''", [qs.from, qs.to])).map(x => `${x.class_id}|${x.subject_id}|${x.date}`));
  const planned = new Set(), by = {}; const end = Date.parse(qs.to + 'T12:00:00Z');
  for (let t = Date.parse(qs.from + 'T12:00:00Z'); t <= end; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10), w = new Date(t).getUTCDay() || 7;
    for (const x of tt) if (x.weekday === w && (!x.valid_from || x.valid_from <= d) && (!x.valid_to || x.valid_to >= d)) {
      const k = `${x.class_id}|${x.subject_id}|${d}|${x.teacher_id}`; if (planned.has(k)) continue; planned.add(k);
      const g = by[x.teacher_id] ??= { teacher_id: x.teacher_id, teacher: x.teacher, planned: 0, filled: 0 };
      g.planned++; if (done.has(`${x.class_id}|${x.subject_id}|${d}`)) g.filled++;
    }
  }
  return { from: qs.from, to: qs.to, rows: Object.values(by).map(g => ({ ...g, percent: g.planned ? Math.round(g.filled * 100 / g.planned) : null })).sort((a, b) => a.teacher.localeCompare(b.teacher)) };
});

// ===== Chorak va yillik baholar =====
// Avtomatik: chorak ichidagi baholarning vaznli o'rtachasi (5 ballik shkalaga keltiriladi), eng yaqin butun songa (2–5). Yakuniy bahoni o'qituvchi tasdiqlaydi/tuzatadi.
const round5 = a => a == null ? null : Math.min(5, Math.max(2, Math.round(a + 1e-9)));
async function classYear(c) { const cl = await one('SELECT year FROM classes WHERE id=?', [c]); if (!cl) bad('Sinf topilmadi', 404); return (await one('SELECT * FROM academic_years WHERE name=?', [cl.year])) || (await one('SELECT * FROM academic_years WHERE is_current=1')); }
async function pgData(c, s) {
  const y = await classYear(c), terms = y ? await q('SELECT id,name,start_date,end_date FROM terms WHERE year_id=? ORDER BY start_date', [y.id]) : [];
  const sts = await q("SELECT id,name FROM students WHERE class_id=? AND status='faol' ORDER BY name", [c]);
  const gr = await q('SELECT g.student_id,g.date,g.value,g.max,COALESCE(t.weight,1) w FROM grades g LEFT JOIN grade_types t ON t.name=g.type WHERE g.class_id=? AND g.subject_id=? AND g.max>0', [c, s]);
  const fin = await q('SELECT student_id,kind,term_id,value FROM period_grades WHERE class_id=? AND subject_id=?', [c, s]);
  const rows = sts.map(st => {
    const mine = gr.filter(g => g.student_id == st.id), tm = {}, tv = [];
    for (const t of terms) {
      const x = mine.filter(g => g.date >= t.start_date && g.date <= t.end_date), w = x.reduce((a, g) => a + g.w, 0), avg = w ? x.reduce((a, g) => a + g.w * 5 * g.value / g.max, 0) / w : null;
      const f = fin.find(z => z.student_id == st.id && z.kind === 'term' && z.term_id == t.id);
      tm[t.id] = { avg: avg == null ? null : +avg.toFixed(2), n: x.length, auto: round5(avg), value: f ? f.value : null };
      const use = f ? f.value : round5(avg); if (use != null) tv.push(use);
    }
    const yf = fin.find(z => z.student_id == st.id && z.kind === 'year');
    return { id: st.id, name: st.name, terms: tm, year: { auto: tv.length ? round5(tv.reduce((a, b) => a + b, 0) / tv.length) : null, value: yf ? yf.value : null } };
  });
  return { year: y ? { id: y.id, name: y.name } : null, terms, students: rows };
}
r('GET', '/period_grades', async ({ u, qs }) => {
  const c = +qs.class_id, s = +qs.subject_id; if (!c || !s) bad('class_id va subject_id kerak'); if (!(await canView(u, c, s))) bad("Ruxsat yo'q", 403);
  return { can_edit: await teaches(u, c, s), ...(await pgData(c, s)) };
});
const pgCheck = async (u, b) => {
  const c = +b.class_id, s = +b.subject_id, kind = b.kind; if (!(await teaches(u, c, s))) bad("Bu sinf/fan uchun ruxsatingiz yo'q", 403);
  if (kind !== 'term' && kind !== 'year') bad("Turi noto'g'ri"); const y = await classYear(c); if (!y) bad("O'quv yili kiritilmagan (Sozlamalar)");
  let tid = 0; if (kind === 'term') { tid = +b.term_id; if (!(await one('SELECT 1 x FROM terms WHERE id=? AND year_id=?', [tid, y.id]))) bad("Chorak bu o'quv yiliga tegishli emas"); }
  return { c, s, kind, tid };
};
r('PUT', '/period_grades', async ({ u, b }) => {
  const { c, s, kind, tid } = await pgCheck(u, b); await needStudent(b.student_id, c);
  const old = await one('SELECT * FROM period_grades WHERE student_id=? AND subject_id=? AND kind=? AND term_id=?', [b.student_id, s, kind, tid]);
  if (b.value === null || b.value === '' || b.value === undefined) { if (old) { await run('DELETE FROM period_grades WHERE id=?', [old.id]); await audit(u, 'delete', 'period_grade', old.id, old, null); } return { ok: 1 }; }
  const v = +b.value; if (!Number.isInteger(v) || v < 2 || v > 5) bad("Baho 2 dan 5 gacha butun son bo'lsin");
  await run('INSERT INTO period_grades(student_id,class_id,subject_id,kind,term_id,value,teacher_id,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,kind,term_id) DO UPDATE SET value=excluded.value,teacher_id=excluded.teacher_id,updated_at=excluded.updated_at', [b.student_id, c, s, kind, tid, v, u.id, now()]);
  await audit(u, old ? 'update' : 'create', 'period_grade', `${b.student_id}-${s}-${kind}-${tid}`, old && { value: old.value }, { value: v }); return { ok: 1 };
});
r('POST', '/period_grades/fill', async ({ u, b }) => {
  const { c, s, kind, tid } = await pgCheck(u, b), d = await pgData(c, s); let n = 0; const st = [];
  for (const x of d.students) {
    const cur = kind === 'year' ? x.year.value : x.terms[tid].value, auto = kind === 'year' ? x.year.auto : x.terms[tid].auto;
    if (auto == null || (cur != null && !b.overwrite)) continue;
    st.push({ sql: 'INSERT INTO period_grades(student_id,class_id,subject_id,kind,term_id,value,teacher_id,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,kind,term_id) DO UPDATE SET value=excluded.value,teacher_id=excluded.teacher_id,updated_at=excluded.updated_at', args: [x.id, c, s, kind, tid, auto, u.id, now()] }); n++;
  }
  if (st.length) await db.batch(st, 'write'); await audit(u, 'fill', 'period_grade', `${c}-${s}-${kind}-${tid}`, null, { filled: n }); return { filled: n };
});
// Qaydnoma: o'quvchi × fan. Faqat o'qituvchi tasdiqlagan yakuniy baholar ko'rsatiladi
r('GET', '/reports/qaydnoma', async ({ u, qs }) => {
  const c = +qs.class_id; if (!c) bad('class_id kerak'); if (!(await canView(u, c))) bad("Ruxsat yo'q", 403);
  const hm = await homeroom(u, c), all = u.role !== 'teacher' || hm;
  const subs = await q(`SELECT DISTINCT sb.id,sb.name FROM assignments a JOIN subjects sb ON sb.id=a.subject_id WHERE a.class_id=?${all ? '' : ' AND a.teacher_id=' + (+u.id)} ORDER BY sb.name`, [c]);
  const out = []; let meta = null;
  for (const sb of subs) { const d = await pgData(c, sb.id); meta = meta || { year: d.year, terms: d.terms }; out.push({ subject: sb, students: d.students }); }
  const y = meta || { year: await classYear(c), terms: [] }, sts = await q("SELECT id,name FROM students WHERE class_id=? AND status='faol' ORDER BY name", [c]);
  return { year: y.year, terms: y.terms, subjects: subs, students: sts.map(st => ({ id: st.id, name: st.name, cells: Object.fromEntries(out.map(o => { const x = o.students.find(z => z.id === st.id); return [o.subject.id, { terms: Object.fromEntries(Object.entries(x.terms).map(([k, v]) => [k, v.value])), year: x.year.value }]; })) })) };
});
// ===== To'lovlar: tarif, oylik hisoblash, to'lov, qoldiq, buxgalteriya hisoboti, Click/Payme =====
// Summalar so'mda butun son. qoldiq = hisoblangan − to'langan (musbat = qarz, manfiy = oldindan to'langan).
const PMETH = ['naqd', 'bank', 'plastik', 'boshqa'], MONTH = /^\d{4}-(0[1-9]|1[0-2])$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
const finCfg = async () => Object.fromEntries((await q('SELECT key,value FROM fin_config')).map(x => [x.key, x.value]));
const finSet = (k, v) => v === null ? run('DELETE FROM fin_config WHERE key=?', [k]) : run('INSERT INTO fin_config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
const finUsers = async () => { try { return JSON.parse((await one("SELECT value FROM fin_config WHERE key='fin_users'"))?.value || '[]'); } catch { return []; } };
const isFin = async u => u.role === 'admin' || u.role === 'director' || (u.role === 'teacher' && (await finUsers()).includes(u.id));
const needFin = async u => { if (!(await isFin(u))) bad("Ruxsat yo'q", 403); };
const intAmt = (v, name = 'Summa') => { const n = Number(v); if (!Number.isInteger(n) || Math.abs(n) > 1e10) bad(name + " butun son (so'm) bo'lsin"); return n; };
const curMonth = () => tashkentToday().slice(0, 7);
const yearStart = () => { const t = tashkentToday(), y = +t.slice(0, 4); return (+t.slice(5, 7) >= 9 ? y : y - 1) + '-09'; };
const effFee = (cls, plan) => { const base = plan && plan.monthly !== null && plan.monthly !== undefined ? plan.monthly : (cls || 0), d = plan ? plan.discount_pct || 0 : 0; return Math.round(base * (100 - d) / 100); };
r('GET', '/fin/config', async ({ u }) => {
  await needFin(u); const c = await finCfg(), adm = u.role === 'admin';
  const org = Object.fromEntries(['org_name', 'org_inn', 'org_bank', 'org_account', 'org_mfo', 'org_phone', 'org_note'].map(k => [k, c[k] || '']));
  return { org, remind_day: +(c.remind_day || 0), remind_min: +(c.remind_min || 0), min_online: +(c.min_online || 1000), click_on: !!(c.click_service_id && c.click_secret), payme_on: !!(c.payme_merchant_id && c.payme_key),
    ...(adm ? { click: { service_id: c.click_service_id || '', merchant_id: c.click_merchant_id || '', user_id: c.click_user_id || '', secret_set: !!c.click_secret }, payme: { merchant_id: c.payme_merchant_id || '', key_set: !!c.payme_key, test: c.payme_test === '1' }, fin_users: await finUsers() } : {}) };
});
r('PUT', '/fin/config', async ({ u, b }) => {
  need(u, 'admin');
  for (const k of ['org_name', 'org_inn', 'org_bank', 'org_account', 'org_mfo', 'org_phone', 'org_note']) if (b[k] !== undefined) { const v = String(b[k]).trim().slice(0, 300); if (k === 'org_inn' && v && !/^\d{9}$|^\d{14}$/.test(v)) bad("INN 9 raqamdan iborat bo'lsin (jismoniy shaxs uchun 14)"); await finSet(k, v || null); }
  for (const k of ['click_service_id', 'click_merchant_id', 'click_user_id', 'payme_merchant_id']) if (b[k] !== undefined) { const v = String(b[k]).trim().slice(0, 100); if (v && !/^[A-Za-z0-9_-]+$/.test(v)) bad(k + " noto'g'ri belgilar"); await finSet(k, v || null); }
  for (const k of ['click_secret', 'payme_key']) if (b[k]) await finSet(k, String(b[k]).trim().slice(0, 200)); else if (b['clear_' + k]) await finSet(k, null); // bo'sh yuborilsa mavjud kalit saqlanadi
  if (b.payme_test !== undefined) await finSet('payme_test', b.payme_test ? '1' : '0');
  if (b.remind_day !== undefined) { const d = +b.remind_day; if (!Number.isInteger(d) || d < 0 || d > 28) bad("Eslatma kuni 0 (o'chiq) yoki 1–28 bo'lsin"); await finSet('remind_day', d); }
  if (b.remind_min !== undefined) { const m = intAmt(b.remind_min, 'Minimal qarz'); if (m < 0 || m > 1e9) bad("Minimal qarz noto'g'ri"); await finSet('remind_min', m); }
  if (b.min_online !== undefined) { const m = intAmt(b.min_online, 'Minimal summa'); if (m < 1 || m > 1e7) bad("Minimal summa 1 dan 10 000 000 gacha"); await finSet('min_online', m); }
  if (b.fin_users !== undefined) { const ids = [...new Set((Array.isArray(b.fin_users) ? b.fin_users : []).map(Number).filter(Number.isInteger))]; const ok = (await q("SELECT id FROM users WHERE role='teacher' AND is_active=1")).map(x => x.id); await finSet('fin_users', JSON.stringify(ids.filter(i => ok.includes(i)))); }
  await audit(u, 'update', 'fin_config', '-', null, { keys: Object.keys(b).filter(k => !/secret|key/.test(k)) }); return { ok: 1 };
});
// --- tariflar
r('GET', '/fin/tariffs', async ({ u, qs }) => {
  await needFin(u); const c = +qs.class_id; if (!c) bad('class_id kerak');
  const cf = await one('SELECT monthly FROM class_fee WHERE class_id=?', [c]), cm = cf ? cf.monthly : 0;
  const st = await q("SELECT s.id,s.name,p.monthly,p.discount_pct,p.note FROM students s LEFT JOIN fee_plans p ON p.student_id=s.id WHERE s.class_id=? AND s.status='faol' ORDER BY s.name", [c]);
  return { class_id: c, monthly: cm, students: st.map(x => ({ ...x, discount_pct: x.discount_pct || 0, effective: effFee(cm, x) })) };
});
r('PUT', '/fin/tariffs/class', async ({ u, b }) => {
  await needFin(u); const c = +b.class_id, m = intAmt(b.monthly, 'Oylik to\'lov'); if (m < 0) bad("Manfiy bo'lmasin"); if (!(await one('SELECT 1 x FROM classes WHERE id=?', [c]))) bad('Sinf topilmadi', 404);
  await run('INSERT INTO class_fee(class_id,monthly) VALUES(?,?) ON CONFLICT(class_id) DO UPDATE SET monthly=excluded.monthly', [c, m]); await audit(u, 'update', 'class_fee', c, null, { monthly: m }); return { ok: 1 };
});
r('PUT', '/fin/tariffs/student', async ({ u, b }) => {
  await needFin(u); const id = +b.student_id; if (!(await one('SELECT 1 x FROM students WHERE id=?', [id]))) bad('Topilmadi', 404);
  const m = b.monthly === null || b.monthly === '' || b.monthly === undefined ? null : intAmt(b.monthly, 'Oylik to\'lov'), d = Number(b.discount_pct || 0); if (m !== null && m < 0) bad("Manfiy bo'lmasin"); if (!Number.isInteger(d) || d < 0 || d > 100) bad('Chegirma 0 dan 100 foizgacha');
  if (m === null && !d && !b.note) await run('DELETE FROM fee_plans WHERE student_id=?', [id]);
  else await run('INSERT INTO fee_plans(student_id,monthly,discount_pct,note) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET monthly=excluded.monthly,discount_pct=excluded.discount_pct,note=excluded.note', [id, m, d, String(b.note || '').slice(0, 200) || null]);
  await audit(u, 'update', 'fee_plan', id, null, { monthly: m, discount_pct: d }); return { ok: 1 };
});
// --- hisoblash
r('POST', '/fin/charges/generate', async ({ u, b }) => {
  await needFin(u); const per = String(b.period || ''); if (!MONTH.test(per)) bad("Oy YYYY-MM ko'rinishida bo'lsin");
  const c = b.class_id ? +b.class_id : 0, sts = await q(`SELECT s.id,s.class_id,p.monthly,p.discount_pct,COALESCE(cf.monthly,0) cm FROM students s LEFT JOIN fee_plans p ON p.student_id=s.id LEFT JOIN class_fee cf ON cf.class_id=s.class_id WHERE s.status='faol'${c ? ' AND s.class_id=?' : ''}`, c ? [c] : []);
  const have = new Set((await q("SELECT student_id FROM charges WHERE period=? AND kind='oylik'", [per])).map(x => x.student_id)), st = []; let skipped = 0, zero = 0;
  for (const s of sts) { if (have.has(s.id)) { skipped++; continue; } const a = effFee(s.cm, s); if (a <= 0) { zero++; continue; } st.push({ sql: "INSERT INTO charges(student_id,period,amount,kind,note,created_at) VALUES(?,?,?,'oylik',NULL,?)", args: [s.id, per, a, now()] }); }
  if (st.length) await db.batch(st, 'write'); await audit(u, 'generate', 'charges', per, null, { created: st.length, class_id: c || null });
  return { created: st.length, already: skipped, no_tariff: zero };
});
r('POST', '/fin/charges', async ({ u, b }) => {
  await needFin(u); const id = +b.student_id, a = intAmt(b.amount); if (!a) bad("Summa 0 bo'lmasin (chegirma uchun manfiy yozing)"); if (!(await one('SELECT 1 x FROM students WHERE id=?', [id]))) bad('Topilmadi', 404);
  const per = b.period ? String(b.period) : curMonth(); if (!MONTH.test(per)) bad("Oy YYYY-MM ko'rinishida bo'lsin"); const note = String(b.note || '').trim().slice(0, 200); if (!note) bad('Izoh kerak (nima uchun)');
  const x = await run("INSERT INTO charges(student_id,period,amount,kind,note,created_at) VALUES(?,?,?,'boshqa',?,?)", [id, per, a, note, now()]); await audit(u, 'create', 'charge', Number(x.lastInsertRowid), null, { student_id: id, amount: a }); return { id: Number(x.lastInsertRowid) };
});
r('DELETE', '/fin/charges/(\\d+)', async ({ u, m }) => { await needFin(u); const o = await one('SELECT * FROM charges WHERE id=?', [+m[1]]); if (!o) bad('Topilmadi', 404); await run('DELETE FROM charges WHERE id=?', [o.id]); await audit(u, 'delete', 'charge', o.id, o, null); return { ok: 1 }; });
// --- to'lovlar
const payIns = async (sid, amount, method, paid_on, note, by, ext) => { const x = await payIns0(sid, amount, method, paid_on, note, by, ext); tgPay(sid, amount); return x; };
const payIns0 = (sid, amount, method, paid_on, note, by, ext) => run("INSERT INTO payments(student_id,amount,method,paid_on,note,ext_id,status,created_by,created_at) VALUES(?,?,?,?,?,?,'ok',?,?)", [sid, amount, method, paid_on, note || null, ext || null, by || null, now()]);
r('POST', '/fin/payments', async ({ u, b }) => {
  await needFin(u); const id = +b.student_id, a = intAmt(b.amount); if (a <= 0) bad("Summa 0 dan katta bo'lsin"); if (!(await one('SELECT 1 x FROM students WHERE id=?', [id]))) bad('Topilmadi', 404);
  const me = String(b.method || 'naqd'); if (!PMETH.includes(me)) bad("To'lov turi noto'g'ri"); const dt = b.paid_on ? String(b.paid_on) : tashkentToday(); if (!DATE.test(dt) || dt > tashkentToday()) bad("Sana noto'g'ri yoki kelajakda");
  const x = await payIns(id, a, me, dt, String(b.note || '').trim().slice(0, 200), u.id); await audit(u, 'create', 'payment', Number(x.lastInsertRowid), null, { student_id: id, amount: a, method: me }); return { id: Number(x.lastInsertRowid) };
});
r('DELETE', '/fin/payments/(\\d+)', async ({ u, m }) => {
  await needFin(u); const o = await one('SELECT * FROM payments WHERE id=?', [+m[1]]); if (!o) bad('Topilmadi', 404); if (o.status === 'cancelled') return { ok: 1 };
  await run("UPDATE payments SET status='cancelled' WHERE id=?", [o.id]); await audit(u, 'cancel', 'payment', o.id, { amount: o.amount, method: o.method }, null); return { ok: 1 };
});
// --- qoldiq va hisobotlar
async function finRows(cl, from, to) {
  const f1 = from + '-01', t1 = to + '-31';
  return q(`SELECT s.id,s.name,s.class_id,c.name cls,
    COALESCE((SELECT SUM(amount) FROM charges WHERE student_id=s.id AND period<?),0) ch0, COALESCE((SELECT SUM(amount) FROM payments WHERE student_id=s.id AND status='ok' AND paid_on<?),0) pa0,
    COALESCE((SELECT SUM(amount) FROM charges WHERE student_id=s.id AND period>=? AND period<=?),0) ch1, COALESCE((SELECT SUM(amount) FROM payments WHERE student_id=s.id AND status='ok' AND paid_on>=? AND paid_on<=?),0) pa1
    FROM students s JOIN classes c ON c.id=s.class_id WHERE s.status='faol'${cl ? ' AND s.class_id=?' : ''} ORDER BY c.name,s.name`, [from, f1, from, to, f1, t1, ...(cl ? [cl] : [])]);
}
const finShape = x => ({ id: x.id, name: x.name, class_id: x.class_id, class: x.cls, opening: x.ch0 - x.pa0, charged: x.ch1, paid: x.pa1, balance: x.ch0 - x.pa0 + x.ch1 - x.pa1 });
const finRange = qs => { const from = qs.from || yearStart(), to = qs.to || curMonth(); if (!MONTH.test(from) || !MONTH.test(to) || from > to) bad("Oraliq noto'g'ri (YYYY-MM)"); return [from, to]; };
r('GET', '/fin/summary', async ({ u, qs }) => {
  await needFin(u); const [from, to] = finRange(qs), cl = qs.class_id ? +qs.class_id : 0, rows = (await finRows(cl, from, to)).map(finShape);
  return { from, to, rows, totals: rows.reduce((t, x) => ({ opening: t.opening + x.opening, charged: t.charged + x.charged, paid: t.paid + x.paid, balance: t.balance + x.balance }), { opening: 0, charged: 0, paid: 0, balance: 0 }) };
});
r('GET', '/fin/report', async ({ u, qs }) => {
  await needFin(u); const [from, to] = finRange(qs), rows = (await finRows(0, from, to)).map(finShape), by = {};
  for (const x of rows) { const c = (by[x.class_id] ||= { class_id: x.class_id, class: x.class, students: 0, opening: 0, charged: 0, paid: 0, balance: 0, debtors: 0 }); c.students++; for (const k of ['opening', 'charged', 'paid', 'balance']) c[k] += x[k]; if (x.balance > 0) c.debtors++; }
  const f1 = from + '-01', t1 = to + '-31', meth = await q("SELECT method,SUM(amount) s,COUNT(*) n FROM payments WHERE status='ok' AND paid_on>=? AND paid_on<=? GROUP BY method ORDER BY s DESC", [f1, t1]);
  const mc = await q('SELECT period m,SUM(amount) s FROM charges WHERE period>=? AND period<=? GROUP BY period', [from, to]), mp = await q("SELECT substr(paid_on,1,7) m,SUM(amount) s FROM payments WHERE status='ok' AND paid_on>=? AND paid_on<=? GROUP BY 1", [f1, t1]);
  const months = [...new Set([...mc, ...mp].map(x => x.m))].sort();
  const totals = rows.reduce((t, x) => ({ opening: t.opening + x.opening, charged: t.charged + x.charged, paid: t.paid + x.paid, balance: t.balance + x.balance, debtors: t.debtors + (x.balance > 0 ? 1 : 0), prepaid: t.prepaid + (x.balance < 0 ? -x.balance : 0), debt: t.debt + (x.balance > 0 ? x.balance : 0) }), { opening: 0, charged: 0, paid: 0, balance: 0, debtors: 0, prepaid: 0, debt: 0 });
  return { from, to, totals, by_class: Object.values(by), by_method: meth, monthly: months.map(m => ({ month: m, charged: (mc.find(x => x.m === m) || {}).s || 0, paid: (mp.find(x => x.m === m) || {}).s || 0 })) };
});
async function statement(id) {
  const ch = await q('SELECT id,period,amount,kind,note,created_at FROM charges WHERE student_id=?', [id]), pa = await q("SELECT id,amount,method,paid_on,note,status,created_at FROM payments WHERE student_id=? ORDER BY paid_on,id", [id]);
  const ev = [...ch.map(x => ({ type: 'charge', id: x.id, date: x.period + '-01', amount: x.amount, label: x.kind === 'oylik' ? 'Oylik to\'lov' : x.note, period: x.period, kind: x.kind, note: x.note, ts: x.created_at })), ...pa.map(x => ({ type: 'payment', id: x.id, date: x.paid_on, amount: x.amount, label: "To'lov", method: x.method, note: x.note, status: x.status, ts: x.created_at }))].sort((a, b) => (a.date + (a.type === 'charge' ? 0 : 1) + (a.ts || '')) < (b.date + (b.type === 'charge' ? 0 : 1) + (b.ts || '')) ? -1 : 1);
  let bal = 0; for (const e of ev) { if (e.type === 'charge') bal += e.amount; else if (e.status === 'ok') bal -= e.amount; e.balance = bal; }
  const t = new Date().toISOString().slice(0, 7), due = ch.filter(x => x.period <= curMonth()).reduce((a, x) => a + x.amount, 0), paid = pa.filter(x => x.status === 'ok').reduce((a, x) => a + x.amount, 0);
  return { events: ev, charged_total: ch.reduce((a, x) => a + x.amount, 0), due, paid, balance: due - paid };
}
r('GET', '/fin/student/(\\d+)', async ({ u, m }) => { await needFin(u); const s = await one('SELECT s.id,s.name,c.name class FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?', [+m[1]]); if (!s) bad('Topilmadi', 404); return { student: s, ...(await statement(s.id)) }; });
// --- o'quvchi/ota-ona kabineti
const payUrls = async (sid, amount) => {
  const c = await finCfg(), out = {};
  if (c.payme_merchant_id && c.payme_key) out.payme = (c.payme_test === '1' ? 'https://test.paycom.uz/' : 'https://checkout.paycom.uz/') + Buffer.from(`m=${c.payme_merchant_id};ac.student_id=${sid};a=${amount * 100}`).toString('base64');
  if (c.click_service_id && c.click_merchant_id && c.click_secret) out.click = `https://my.click.uz/services/pay?service_id=${encodeURIComponent(c.click_service_id)}&merchant_id=${encodeURIComponent(c.click_merchant_id)}&amount=${amount}&transaction_param=${sid}`;
  return { urls: out, min: +(c.min_online || 1000) };
};
r('GET', '/student/billing', async ({ u }) => {
  const c = await finCfg(), st = await statement(u.id), has = !!(await one('SELECT 1 x FROM charges WHERE student_id=?', [u.id]));
  return { ...st, has_billing: has, org: Object.fromEntries(['org_name', 'org_inn', 'org_bank', 'org_account', 'org_mfo', 'org_phone', 'org_note'].map(k => [k, c[k] || ''])), online: { click: !!(c.click_service_id && c.click_merchant_id && c.click_secret), payme: !!(c.payme_merchant_id && c.payme_key), min: +(c.min_online || 1000) } };
});
r('POST', '/student/pay-link', async ({ u, b }) => {
  const a = intAmt(b.amount), p = await payUrls(u.id, a); if (a < p.min) bad(`Minimal summa ${p.min} so'm`); if (a > 1e8) bad("Summa juda katta");
  const url = p.urls[b.provider]; if (!url) bad("Bu to'lov usuli yoqilmagan"); return { url };
});
// --- Payme Merchant API (JSON-RPC)
const PE = { auth: [-32504, "Недостаточно привилегий для выполнения метода", "Usulni bajarish uchun huquq yetarli emas", 'Insufficient privileges'], amount: [-31001, 'Неверная сумма', "Noto'g'ri summa", 'Wrong amount'], nf: [-31003, 'Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found'], cant: [-31008, 'Невозможно выполнить операцию', 'Amalni bajarib bo\'lmaydi', 'Unable to complete operation'], acc: [-31050, 'Аккаунт не найден', 'Hisob topilmadi', 'Account not found'], meth: [-32601, 'Метод не найден', 'Usul topilmadi', 'Method not found'] };
const pErr = (id, k, data) => ({ jsonrpc: '2.0', id, error: { code: PE[k][0], message: { ru: PE[k][1], uz: PE[k][2], en: PE[k][3] }, ...(data ? { data } : {}) } });
const PTMO = 43200000;
r('POST', '/pay/payme', async ({ b, ev }) => {
  const c = await finCfg(), id = b && b.id !== undefined ? b.id : null;
  const hdr = String(ev.headers?.authorization || ''), want = 'Basic ' + Buffer.from('Paycom:' + (c.payme_key || '')).toString('base64');
  if (!c.payme_key || hdr.length !== want.length || !crypto.timingSafeEqual(Buffer.from(hdr), Buffer.from(want))) return pErr(id, 'auth');
  const p = b.params || {}, ok = x => ({ jsonrpc: '2.0', id, result: x }), min = +(c.min_online || 1000);
  const acct = async () => { const sid = Number(p.account && p.account.student_id); return Number.isInteger(sid) && sid > 0 ? one("SELECT id FROM students WHERE id=? AND status='faol'", [sid]) : null; };
  const amt = () => { const a = Number(p.amount); return Number.isInteger(a) && a % 100 === 0 && a / 100 >= min && a / 100 <= 1e8 ? a / 100 : null; };
  const shape = t => ({ create_time: t.create_time, perform_time: t.perform_time || 0, cancel_time: t.cancel_time || 0, transaction: String(t.id), state: t.state, reason: t.reason ?? null });
  const find = () => one("SELECT * FROM gateway_tx WHERE provider='payme' AND ext_id=?", [String(p.id || '')]);
  const expire = async t => { if (t.state === 1 && Date.now() - t.create_time > PTMO) { await run("UPDATE gateway_tx SET state=-1,reason=4,cancel_time=? WHERE id=?", [Date.now(), t.id]); return true; } return false; };
  switch (b.method) {
    case 'CheckPerformTransaction': if (!(await acct())) return pErr(id, 'acc', 'student_id'); if (amt() === null) return pErr(id, 'amount'); return ok({ allow: true });
    case 'CreateTransaction': {
      let t = await find(); if (t) { if (await expire(t)) return pErr(id, 'cant'); if (t.state !== 1) return pErr(id, 'cant'); return ok({ create_time: t.create_time, transaction: String(t.id), state: 1 }); }
      if (!(await acct())) return pErr(id, 'acc', 'student_id'); const a = amt(); if (a === null) return pErr(id, 'amount');
      const x = await run("INSERT INTO gateway_tx(provider,ext_id,student_id,amount,state,create_time) VALUES('payme',?,?,?,1,?)", [String(p.id), Number(p.account.student_id), a, Date.now()]); t = await one('SELECT * FROM gateway_tx WHERE id=?', [Number(x.lastInsertRowid)]);
      return ok({ create_time: t.create_time, transaction: String(t.id), state: 1 });
    }
    case 'PerformTransaction': {
      const t = await find(); if (!t) return pErr(id, 'nf'); if (t.state === 2) return ok({ transaction: String(t.id), perform_time: t.perform_time, state: 2 }); if (await expire(t) || t.state !== 1) return pErr(id, 'cant');
      const pm = await payIns(t.student_id, t.amount, 'payme', tashkentToday(), 'Payme (onlayn)', null, 'payme:' + t.ext_id), pt = Date.now();
      await run('UPDATE gateway_tx SET state=2,perform_time=?,payment_id=? WHERE id=?', [pt, Number(pm.lastInsertRowid), t.id]); return ok({ transaction: String(t.id), perform_time: pt, state: 2 });
    }
    case 'CancelTransaction': {
      const t = await find(); if (!t) return pErr(id, 'nf'); if (t.state < 0) return ok({ transaction: String(t.id), cancel_time: t.cancel_time, state: t.state });
      const st = t.state === 2 ? -2 : -1, ct = Date.now(); if (t.state === 2 && t.payment_id) await run("UPDATE payments SET status='cancelled' WHERE id=?", [t.payment_id]);
      await run('UPDATE gateway_tx SET state=?,reason=?,cancel_time=? WHERE id=?', [st, Number.isInteger(p.reason) ? p.reason : null, ct, t.id]); return ok({ transaction: String(t.id), cancel_time: ct, state: st });
    }
    case 'CheckTransaction': { const t = await find(); return t ? ok(shape(t)) : pErr(id, 'nf'); }
    case 'GetStatement': { const f = Number(p.from), to = Number(p.to), rows = await q("SELECT * FROM gateway_tx WHERE provider='payme' AND create_time>=? AND create_time<=? ORDER BY create_time", [f, to]);
      return ok({ transactions: rows.map(t => ({ id: t.ext_id, time: t.create_time, amount: t.amount * 100, account: { student_id: String(t.student_id) }, ...shape(t) })) }); }
    default: return pErr(id, 'meth');
  }
});
// --- Click SHOP API (prepare / complete)
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const clickReply = (p, extra, code, note) => ({ click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id, ...extra, error: code, error_note: note });
async function clickGuard(b, complete) {
  const c = await finCfg(), p = b || {}; const f = k => String(p[k] ?? '');
  if (!c.click_secret || !c.click_service_id) return { e: [-8, 'Click sozlanmagan'] };
  const base = f('click_trans_id') + f('service_id') + c.click_secret + f('merchant_trans_id') + (complete ? f('merchant_prepare_id') : '') + f('amount') + f('action') + f('sign_time');
  if (f('service_id') !== String(c.click_service_id) || md5(base) !== f('sign_string')) return { e: [-1, 'SIGN CHECK FAILED!'] };
  const sid = Number(p.merchant_trans_id), s = Number.isInteger(sid) && sid > 0 ? await one("SELECT id FROM students WHERE id=? AND status='faol'", [sid]) : null;
  if (!s) return { e: [-5, 'User does not exist'] };
  const a = Number(p.amount); if (!(a >= +(c.min_online || 1000)) || a > 1e8 || Math.round(a) !== a) return { e: [-2, 'Incorrect parameter amount'] };
  return { sid, a, p };
}
r('POST', '/pay/click/prepare', async ({ b }) => {
  const g = await clickGuard(b, false); if (g.e) return clickReply(b || {}, {}, g.e[0], g.e[1]); if (String(b.action) !== '0') return clickReply(b, {}, -3, 'Action not found');
  const ex = await one("SELECT * FROM gateway_tx WHERE provider='click' AND ext_id=?", [String(b.click_trans_id)]); if (ex) return clickReply(b, { merchant_prepare_id: ex.id }, ex.state === 2 ? -4 : ex.state < 0 ? -9 : 0, ex.state === 2 ? 'Already paid' : ex.state < 0 ? 'Transaction cancelled' : 'Success');
  const x = await run("INSERT INTO gateway_tx(provider,ext_id,student_id,amount,state,create_time) VALUES('click',?,?,?,1,?)", [String(b.click_trans_id), g.sid, g.a, Date.now()]); return clickReply(b, { merchant_prepare_id: Number(x.lastInsertRowid) }, 0, 'Success');
});
r('POST', '/pay/click/complete', async ({ b }) => {
  const g = await clickGuard(b, true); if (g.e) return clickReply(b || {}, {}, g.e[0], g.e[1]); if (String(b.action) !== '1') return clickReply(b, {}, -3, 'Action not found');
  const t = await one("SELECT * FROM gateway_tx WHERE provider='click' AND id=? AND ext_id=?", [Number(b.merchant_prepare_id) || 0, String(b.click_trans_id)]); if (!t) return clickReply(b, {}, -6, 'Transaction does not exist');
  if (t.student_id !== g.sid || t.amount !== g.a) return clickReply(b, {}, -2, 'Incorrect parameter amount');
  if (t.state === 2) return clickReply(b, { merchant_confirm_id: t.payment_id }, -4, 'Already paid'); if (t.state < 0) return clickReply(b, {}, -9, 'Transaction cancelled');
  if (Number(b.error) < 0) { await run('UPDATE gateway_tx SET state=-1,cancel_time=?,reason=? WHERE id=?', [Date.now(), Number(b.error), t.id]); return clickReply(b, {}, -9, 'Transaction cancelled'); }
  const pm = await payIns(t.student_id, t.amount, 'click', tashkentToday(), 'Click (onlayn)', null, 'click:' + t.ext_id);
  await run('UPDATE gateway_tx SET state=2,perform_time=?,payment_id=? WHERE id=?', [Date.now(), Number(pm.lastInsertRowid), t.id]); return clickReply(b, { merchant_confirm_id: Number(pm.lastInsertRowid) }, 0, 'Success');
});
// Administrator/direktor bosh sahifasi: haftalik davomat, sinflar kesimi, faol o'quvchilar
async function adminDash(today) {
  const d0 = new Date(today + 'T12:00:00Z'); d0.setUTCDate(d0.getUTCDate() - 6); const from = d0.toISOString().slice(0, 10);
  const wk = await q('SELECT date,status,COUNT(*) n FROM attendance WHERE date BETWEEN ? AND ? GROUP BY date,status ORDER BY date', [from, today]), days = {};
  for (let i = 0; i < 7; i++) { const x = new Date(d0); x.setUTCDate(d0.getUTCDate() + i); days[x.toISOString().slice(0, 10)] = { date: x.toISOString().slice(0, 10), keldi: 0, kelmadi: 0, kechikdi: 0, uzrli: 0 }; }
  for (const x of wk) if (days[x.date]) days[x.date][x.status] = x.n;
  const tc = await q('SELECT class_id,status,COUNT(*) n FROM attendance WHERE date=? GROUP BY class_id,status', [today]);
  const cls = await q("SELECT c.id,c.name,h.name homeroom,(SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status='faol') n FROM classes c LEFT JOIN users h ON h.id=c.homeroom_id WHERE c.archived=0 ORDER BY c.name");
  return { att_week: Object.values(days), class_stats: cls.map(c => { const m = { keldi: 0, kelmadi: 0, kechikdi: 0, uzrli: 0 }; for (const x of tc) if (x.class_id === c.id) m[x.status] = x.n; return { ...c, ...m }; }) };
}
r('GET', '/dashboard', async ({ u }) => {
  const today = tashkentToday(), wd = new Date(today + 'T12:00:00Z').getUTCDay() || 7, tch = u.role === 'teacher';
  const cl = tch ? await q('SELECT id FROM classes WHERE homeroom_id=? UNION SELECT class_id FROM assignments WHERE teacher_id=?', [u.id, u.id]) : await q('SELECT id FROM classes');
  const ids = cl.map(x => x.id), ph = ids.map(() => '?').join(',') || 'NULL';
  const subs = tch ? (await q('SELECT class_id,subject_id FROM assignments WHERE teacher_id=?', [u.id])) : null;
  const att = await q(`SELECT a.status,COUNT(*) n FROM attendance a WHERE a.date=?${tch ? ` AND a.subject_id IN(SELECT subject_id FROM assignments WHERE class_id=a.class_id AND teacher_id=${+u.id})` : ''} GROUP BY a.status`, [today]);
  return {
    date: today, weekday: wd, role: u.role,
    classes: ids.length, students: (await one(`SELECT COUNT(*) n FROM students WHERE status='faol' AND class_id IN(${ph})`, ids)).n,
    lessons_today: await q(`SELECT t.start,t.end,t.room,t.slot,c.name class,s.name subject,us.name teacher,t.class_id,t.subject_id,(SELECT COUNT(*) FROM attendance a WHERE a.class_id=t.class_id AND a.subject_id=t.subject_id AND a.date='${today}') marked,(SELECT COALESCE(l.topic,'') FROM lessons l WHERE l.class_id=t.class_id AND l.subject_id=t.subject_id AND l.date='${today}') topic FROM timetable t JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id JOIN users us ON us.id=t.teacher_id WHERE t.weekday=? AND ${ACT()}${tch ? ' AND t.teacher_id=?' : ''} ORDER BY t.start`, tch ? [wd, today, today, u.id] : [wd, today, today]),
    attendance_today: Object.fromEntries(['keldi', 'kelmadi', 'kechikdi', 'uzrli'].map(k => [k, (att.find(x => x.status === k) || { n: 0 }).n])),
    recent_grades: await q(`SELECT g.date,g.type,g.value,g.max,st.name student,c.name class,s.name subject FROM grades g JOIN students st ON st.id=g.student_id JOIN classes c ON c.id=g.class_id JOIN subjects s ON s.id=g.subject_id${tch ? ' WHERE g.teacher_id=?' : ''} ORDER BY g.id DESC LIMIT 8`, tch ? [u.id] : []),
    scope: tch ? 'faqat o\'zingizga tegishli' : 'butun maktab',
    ...(tch ? {} : await adminDash(today))
  };
});

// Minimal .xlsx yozuvchi (qo'shimcha kutubxonasiz): zlib + oddiy ZIP
const zlib = require('zlib');
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
function zip(files) {
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const n = Buffer.from(name), raw = Buffer.from(text), def = zlib.deflateRawSync(raw), crc = CRC(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(def.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(def.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, n, def); cen.push(c, n); off += 30 + n.length + def.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
const xe = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function xlsx(rows, sheet) {
  const sd = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => typeof v === 'number' && isFinite(v) ? `<c r="${colName(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${colName(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`).join('')}</row>`).join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xe(sheet).replace(/[\[\]*?:\/\\]/g, ' ').slice(0, 31) || 'Hisobot'}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sd}</sheetData></worksheet>`]]);
}
r('POST', '/export/xlsx', async ({ b }) => { // faqat mijoz yuborgan (allaqachon ruxsat bilan olingan) jadvalni .xlsx ga o'giradi; bazaga tegmaydi
  const rows = Array.isArray(b.rows) ? b.rows : bad('rows kerak'); if (rows.length > 5000 || rows.some(x => !Array.isArray(x) || x.length > 60)) bad('Jadval juda katta');
  return { name: String(b.name || 'hisobot').replace(/[^\w.-]+/g, '_').slice(0, 60) + '.xlsx', base64: xlsx(rows, String(b.sheet || 'Hisobot')).toString('base64') };
});

const BK = ['settings', 'users', 'subjects', 'teacher_subjects', 'classes', 'assignments', 'students', 'timetable', 'lessons', 'grades', 'attendance', 'period_grades', 'class_fee', 'fee_plans', 'charges', 'payments', 'gateway_tx', 'academic_years', 'terms', 'bell_slots', 'grade_types', 'audit_logs'];
async function backupData() { await init(); const out = { version: 2, exported_at: now() }; for (const t of BK) out[t] = await q(`SELECT * FROM ${t}`); out.users.forEach(x => delete x.pass); return out; }
exports.backupData = backupData;
// ===== Monitoring: /health (UptimeRobot) va admin uchun tizim holati =====
const T0 = Date.now(), PERSIST = () => !!(process.env.TURSO_DATABASE_URL || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_PATH);
exports.ping = async () => { const t = Date.now(); await init(); await one('SELECT 1 x'); return Date.now() - t; };
async function sysStatus() {
  let db = null, err = null; try { db = await exports.ping(); } catch (e) { err = e.message; }
  const bk = global.SCHOOL_BACKUP ? await global.SCHOOL_BACKUP.list().catch(() => null) : null, last = bk && bk.files[0] ? bk.files[0].date : null;
  const days = last ? Math.floor((Date.parse(tashkentToday()) - Date.parse(last)) / 864e5) : null;
  const warn = [];
  if (err) warn.push('Baza javob bermayapti: ' + err);
  if (!PERSIST()) warn.push("Doimiy baza yo'q: ma'lumotlar har deploydan keyin yo'qoladi (Turso yoki Railway Volume ulang)");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) warn.push("SESSION_SECRET 32 belgidan qisqa");
  if (bk && !bk.persistent) warn.push("Zaxira fayllari doimiy papkada emas (Railway Volume yoki BACKUP_DIR kerak)");
  if (bk && (days === null || days > 1)) warn.push(days === null ? "Avto-zaxira hali yaratilmagan" : `Oxirgi avto-zaxira ${days} kun oldin`);
  return { ok: !err, db_ms: db, uptime_s: Math.round((Date.now() - T0) / 1000), node: process.version, persistent: PERSIST(), backup: bk ? { last, days_ago: days, count: bk.files.length, persistent: bk.persistent } : null, warnings: warn };
}
exports.health = async () => { const x = await sysStatus(); return { ok: x.ok, body: { status: x.ok ? 'ok' : 'error', db_ms: x.db_ms, uptime_s: x.uptime_s, warnings: x.warnings.length } }; };
r('GET', '/system/status', async ({ u }) => { need(u, 'admin', 'director'); const x = await sysStatus(); x.reports = (await one("SELECT COUNT(*) n FROM chat_reports WHERE status='new'")).n; x.tg = !!(await tgCfg().catch(() => ({}))).bot_token; return x; });
r('GET', '/backup', async ({ u }) => { need(u, 'admin'); return backupData(); });
// Server avto-zaxirasi (faqat server.js ishlaganda; fayllar server diskida, Railway Volume bo'lsa doimiy)
const bkh = () => global.SCHOOL_BACKUP || bad("Avto-zaxira faqat doimiy serverda (Railway) ishlaydi", 501);
r('GET', '/backups', async ({ u }) => { need(u, 'admin'); return global.SCHOOL_BACKUP ? { supported: true, ...(await global.SCHOOL_BACKUP.list()) } : { supported: false }; });
r('POST', '/backups/run', async ({ u }) => { need(u, 'admin'); const x = await bkh().run(); await audit(u, 'backup', 'system', '-', null, x); return x; });
r('GET', '/backups/(zaxira-\\d{4}-\\d{2}-\\d{2}\\.json\\.gz)', async ({ u, m }) => { need(u, 'admin'); try { return await bkh().read(m[1]); } catch (e) { if (e instanceof HttpErr) throw e; bad('Fayl topilmadi', 404); } });
// Tiklash: yagona tranzaksiya (xato bo'lsa hech narsa o'zgarmaydi). Foydalanuvchilar o'chirilmaydi:
// zaxirada bor, lekin bazada yo'q xodimlar faolsiz va parolsiz tiklanadi (admin yangi parol beradi).
r('POST', '/restore', async ({ u, b }) => {
  need(u, 'admin'); if (b.confirm !== 'TIKLASH') bad('Tasdiqlash uchun confirm:"TIKLASH" yuboring');
  const d = b.data; if (!d || typeof d !== 'object' || !Array.isArray(d.classes) || !Array.isArray(d.students) || d.version !== 2 || !d.exported_at || !Array.isArray(d.users)) bad("Zaxira fayli noto'g'ri yoki bu tizimning zaxirasi emas");
  const cols = {}; for (const t of BK) cols[t] = (await q(`PRAGMA table_info(${t})`)).map(c => c.name);
  const ins = (t, row) => { const ks = Object.keys(row).filter(k => cols[t].includes(k)); return { sql: `INSERT INTO ${t}(${ks.join(',')}) VALUES(${ks.map(() => '?').join(',')})`, args: ks.map(k => row[k] ?? null) }; };
  const wipe = ['gateway_tx', 'payments', 'charges', 'fee_plans', 'class_fee', 'access_links', 'admission_resets', 'parent_accounts', 'student_accounts', 'period_grades', 'attendance', 'grades', 'lessons', 'timetable', 'students', 'assignments', 'teacher_subjects', 'classes', 'subjects', 'terms', 'academic_years', 'bell_slots', 'grade_types'];
  const fill = ['subjects', 'classes', 'students', 'assignments', 'teacher_subjects', 'timetable', 'lessons', 'grades', 'attendance', 'academic_years', 'terms', 'period_grades', 'class_fee', 'fee_plans', 'charges', 'payments', 'gateway_tx', 'bell_slots', 'grade_types'];
  const have = new Set((await q('SELECT id FROM users')).map(x => x.id)), st = [];
  for (const x of d.users || []) if (!have.has(x.id)) st.push({ sql: 'INSERT INTO users(id,login,name,pass,role,is_active,created_at) VALUES(?,?,?,?,?,0,?)', args: [x.id, x.login, x.name, 'x:x', x.role, x.created_at || null] });
  for (const t of wipe) st.push({ sql: `DELETE FROM ${t}`, args: [] });
  for (const t of fill) for (const row of d[t] || []) st.push(ins(t, row));
  await db.batch(st, 'write'); await mapSlots();
  await audit(u, 'restore', 'backup', '-', null, { exported_at: d.exported_at, classes: d.classes.length, students: d.students.length });
  return { ok: 1, restored: Object.fromEntries(fill.map(t => [t, (d[t] || []).length])) };
});

// ===== Chat (xodim ↔ ota-ona/o'quvchi) =====
// Ishtirokchi kodi: u<xodim id>, s<o'quvchi id>, p<ota-ona (o'quvchi) id>. Faqat xodim↔xodim va xodim↔oila: oila a'zolari bir-biriga yoza olmaydi.
const pOf = u => (u.role === 'student' ? 's' : u.role === 'parent' ? 'p' : 'u') + u.id;
const PARTY = /^[usp]\d{1,9}$/, CHATRL = new Map();
async function pNames(ps) {
  const out = {}, g = { u: [], s: [], p: [] }; for (const p of new Set(ps)) g[p[0]].push(+p.slice(1));
  const L = a => a.map(() => '?').join(',');
  if (g.u.length) for (const x of await q(`SELECT id,name,role FROM users WHERE id IN(${L(g.u)})`, g.u)) out['u' + x.id] = { name: x.name, sub: { admin: 'Administrator', director: 'Direktor', teacher: "O'qituvchi" }[x.role] || '' };
  const sid = [...new Set([...g.s, ...g.p])];
  if (sid.length) for (const x of await q(`SELECT s.id,s.name,c.name cls FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id IN(${L(sid)})`, sid)) { if (g.s.includes(x.id)) out['s' + x.id] = { name: x.name, sub: x.cls + " sinf o'quvchisi" }; if (g.p.includes(x.id)) out['p' + x.id] = { name: x.name + ' (ota-ona)', sub: x.cls + " sinf o'quvchisining ota-onasi" }; }
  for (const p of ps) out[p] ||= { name: "O'chirilgan hisob", sub: '' }; return out;
}
async function canChat(a, b) {
  if (a === b || !PARTY.test(a) || !PARTY.test(b)) return false;
  const ia = +a.slice(1), ib = +b.slice(1);
  if (a[0] === 'u' && b[0] === 'u') return (await one('SELECT COUNT(*) n FROM users WHERE is_active=1 AND id IN(?,?)', [ia, ib])).n === 2;
  let st, fam, fk; if (a[0] === 'u' && b[0] !== 'u') { st = ia; fam = ib; fk = b[0]; } else if (b[0] === 'u' && a[0] !== 'u') { st = ib; fam = ia; fk = a[0]; } else return false;
  const U = await one('SELECT id,role FROM users WHERE id=? AND is_active=1', [st]), S = await one("SELECT class_id FROM students WHERE id=? AND status='faol'", [fam]); if (!U || !S) return false;
  if (!(await one(`SELECT 1 x FROM ${fk === 'p' ? 'parent_accounts' : 'student_accounts'} WHERE student_id=? AND is_active=1`, [fam]))) return false;
  if (U.role !== 'teacher') return true;
  return !!(await one('SELECT 1 x FROM classes WHERE id=? AND homeroom_id=? UNION SELECT 1 FROM assignments WHERE class_id=? AND teacher_id=?', [S.class_id, U.id, S.class_id, U.id]));
}
async function chatContacts(u, qs) {
  const term = String(qs.q || '').trim().toLowerCase().slice(0, 40), out = [];
  if (u.role === 'student' || u.role === 'parent') {
    const t = await q(`SELECT us.id,us.name,us.role,GROUP_CONCAT(DISTINCT sb.name) subs,MAX(CASE WHEN c.homeroom_id=us.id THEN 1 ELSE 0 END) hr FROM users us LEFT JOIN assignments a ON a.teacher_id=us.id AND a.class_id=? LEFT JOIN subjects sb ON sb.id=a.subject_id LEFT JOIN classes c ON c.id=? WHERE us.is_active=1 AND (us.role IN('admin','director') OR a.id IS NOT NULL OR c.homeroom_id=us.id) GROUP BY us.id ORDER BY us.name`, [u.class_id, u.class_id]);
    for (const x of t) out.push({ party: 'u' + x.id, name: x.name, sub: x.role === 'admin' ? 'Administrator' : x.role === 'director' ? 'Direktor' : [x.hr ? 'Sinf rahbari' : '', x.subs || ''].filter(Boolean).join(' · ') });
    return out.filter(x => !term || x.name.toLowerCase().includes(term));
  }
  for (const x of await q('SELECT id,name,role FROM users WHERE is_active=1 AND id!=? ORDER BY name', [u.id])) if (!term || x.name.toLowerCase().includes(term)) out.push({ party: 'u' + x.id, name: x.name, sub: { admin: 'Administrator', director: 'Direktor', teacher: "O'qituvchi" }[x.role], kind: 'staff' });
  const cid = +qs.class_id || 0; if (!term && !cid) return out;
  const tch = u.role === 'teacher', args = [];
  let w = "s.status='faol'"; if (tch) { w += ' AND (c.homeroom_id=? OR EXISTS(SELECT 1 FROM assignments a WHERE a.class_id=s.class_id AND a.teacher_id=?))'; args.push(u.id, u.id); }
  if (cid) { w += ' AND s.class_id=?'; args.push(cid); } if (term) { w += ' AND s.name LIKE ?'; args.push('%' + term + '%'); }
  for (const s of await q(`SELECT s.id,s.name,c.name cls,sa.is_active sa,pa.is_active pa FROM students s JOIN classes c ON c.id=s.class_id LEFT JOIN student_accounts sa ON sa.student_id=s.id LEFT JOIN parent_accounts pa ON pa.student_id=s.id WHERE ${w} ORDER BY c.name,s.name LIMIT 60`, args)) {
    if (s.pa) out.push({ party: 'p' + s.id, name: s.name + ' (ota-ona)', sub: s.cls + ' sinf', kind: 'parent' });
    if (s.sa) out.push({ party: 's' + s.id, name: s.name, sub: s.cls + " sinf o'quvchisi", kind: 'student' });
  }
  return out;
}
async function chatThreads(u) {
  const me = pOf(u), rows = await q(`SELECT t.id,t.a,t.b,t.last_at,t.last_text,(SELECT COUNT(*) FROM chat_msgs m WHERE m.thread_id=t.id AND m.sender!=? AND m.id>COALESCE((SELECT last_id FROM chat_reads r WHERE r.thread_id=t.id AND r.party=?),0)) unread FROM chat_threads t WHERE t.a=? OR t.b=? ORDER BY t.last_at DESC LIMIT 100`, [me, me, me, me]);
  const nm = await pNames(rows.map(t => t.a === me ? t.b : t.a));
  return rows.map(t => { const o = t.a === me ? t.b : t.a; return { id: t.id, party: o, name: nm[o].name, sub: nm[o].sub, last_at: t.last_at, last_text: t.last_text, unread: t.unread }; });
}
const muteOf = async p => { const m = await one('SELECT until,reason FROM chat_mutes WHERE party=?', [p]); return m && m.until > now() ? m : null; };
const isMod = u => u.role === 'admin' || u.role === 'director';
async function chatOpen(u, id, after) {
  const me = pOf(u), t = await one('SELECT * FROM chat_threads WHERE id=? AND (a=? OR b=?)', [id, me, me]); if (!t) bad('Topilmadi', 404);
  const o = t.a === me ? t.b : t.a, nm = (await pNames([o]))[o];
  const ms = (await q('SELECT id,sender,body,created_at,del_at FROM chat_msgs WHERE thread_id=? AND id>? ORDER BY id DESC LIMIT 100', [id, after || 0])).reverse();
  const top = (await one('SELECT MAX(id) m FROM chat_msgs WHERE thread_id=? AND sender!=?', [id, me])).m;
  if (top) await run('INSERT INTO chat_reads(thread_id,party,last_id) VALUES(?,?,?) ON CONFLICT(thread_id,party) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)', [id, me, top]);
  const mu = await muteOf(me);
  return { id, party: o, name: nm.name, sub: nm.sub, can: !mu && await canChat(me, o), muted: mu ? mu.until : null, msgs: ms.map(x => ({ id: x.id, mine: x.sender === me, body: x.del_at ? '' : x.body, del: x.del_at ? 1 : 0, at: x.created_at })) };
}
async function chatSend(u, b) {
  const me = pOf(u), to = String(b.to || ''), body = String(b.body || '').trim();
  if (!body) bad('Xabar bo\'sh'); if (body.length > 2000) bad('Xabar 2000 belgidan oshmasin');
  const mu = await muteOf(me); if (mu) bad("Sizga " + mu.until.slice(0, 10) + " gacha chatda yozish cheklangan" + (mu.reason ? ': ' + mu.reason : ''), 403);
  if (!(await canChat(me, to))) bad('Bu foydalanuvchiga yozish mumkin emas', 403);
  const rl = CHATRL.get(me) || []; const nowT = Date.now(), fresh = rl.filter(x => nowT - x < 60e3); if (fresh.length >= 20) bad("Juda tez yuboryapsiz: bir daqiqa kuting", 429); fresh.push(nowT); CHATRL.set(me, fresh);
  const [a, bb] = me < to ? [me, to] : [to, me], at = now();
  await run('INSERT INTO chat_threads(a,b,last_at,last_text) VALUES(?,?,?,?) ON CONFLICT(a,b) DO UPDATE SET last_at=excluded.last_at,last_text=excluded.last_text', [a, bb, at, body.slice(0, 80)]);
  const t = await one('SELECT id FROM chat_threads WHERE a=? AND b=?', [a, bb]);
  const seen = (await one('SELECT COALESCE(MAX(last_id),0) m FROM chat_reads WHERE thread_id=? AND party=?', [t.id, to])).m, hadUnread = !!(await one('SELECT 1 x FROM chat_msgs WHERE thread_id=? AND sender=? AND id>?', [t.id, me, seen]));
  const x = await run('INSERT INTO chat_msgs(thread_id,sender,body,created_at) VALUES(?,?,?,?)', [t.id, me, body, at]);
  if (to[0] === 'p' && !hadUnread) tgParents(+to.slice(1), 'ev_chat', `💬 <b>${esc(u.name)}</b> sizga xabar yubordi. Javob berish uchun maktab saytiga kiring.`).catch(() => {});
  return { thread_id: t.id, id: Number(x.lastInsertRowid) };
}
const chatUnread = async u => { const me = pOf(u), rep = isMod(u) ? (await one("SELECT COUNT(*) n FROM chat_reports WHERE status='new'")).n : 0; return { rep, n: (await one(`SELECT COUNT(*) n FROM chat_msgs m JOIN chat_threads t ON t.id=m.thread_id WHERE (t.a=? OR t.b=?) AND m.sender!=? AND m.id>COALESCE((SELECT last_id FROM chat_reads r WHERE r.thread_id=t.id AND r.party=?),0)`, [me, me, me, me])).n }; };
for (const [pre, guard] of [['', () => {}], ['/student', needS]]) {
  r('GET', pre + '/chat/contacts', async ({ u, qs }) => { guard(u); return chatContacts(u, qs); });
  r('GET', pre + '/chat/threads', async ({ u }) => { guard(u); return chatThreads(u); });
  r('GET', pre + '/chat/unread', async ({ u }) => { guard(u); return chatUnread(u); });
  r('GET', pre + '/chat/(\\d+)', async ({ u, qs, m }) => { guard(u); return chatOpen(u, +m[1], +qs.after || 0); });
  r('POST', pre + '/chat/send', async ({ u, b }) => { guard(u); return chatSend(u, b); });
}

// ===== Chat moderatsiyasi: xabarni o'chirish, shikoyat, yozishni cheklash (admin/direktor) =====
// O'chirish "yumshoq": xabar foydalanuvchilarga ko'rinmaydi, lekin yozuv shikoyatni ko'rib chiqish uchun saqlanadi.
// Admin faqat shikoyat qilingan xabar va uning atrofidagi yozishmani ko'radi (boshqa suhbatlarni o'qimaydi).
async function chatMsgOf(u, id) {
  const me = pOf(u), m = await one('SELECT m.*,t.a,t.b FROM chat_msgs m JOIN chat_threads t ON t.id=m.thread_id WHERE m.id=?', [id]);
  if (!m || (m.a !== me && m.b !== me && !isMod(u))) bad('Topilmadi', 404); return { m, me };
}
async function chatDel(u, id) {
  const { m, me } = await chatMsgOf(u, id);
  if (m.sender !== me && !isMod(u)) bad("Faqat o'z xabaringizni o'chira olasiz", 403);
  if (m.del_at) return { ok: 1 };
  await run('UPDATE chat_msgs SET del_at=?,del_by=? WHERE id=?', [now(), me, id]);
  const last = await one('SELECT id,body FROM chat_msgs WHERE thread_id=? AND del_at IS NULL ORDER BY id DESC LIMIT 1', [m.thread_id]);
  await run('UPDATE chat_threads SET last_text=? WHERE id=?', [last ? last.body.slice(0, 80) : "Xabar o'chirildi", m.thread_id]);
  if (m.sender !== me) await audit(u, 'chat_delete', 'chat_msg', id, { sender: m.sender }, null);
  return { ok: 1 };
}
async function chatReport(u, id, b) {
  const { m, me } = await chatMsgOf(u, id); if (m.a !== me && m.b !== me) bad('Topilmadi', 404);
  if (m.sender === me) bad("O'z xabaringizga shikoyat qilib bo'lmaydi");
  const reason = String(b.reason || '').trim().slice(0, 300), rl = CHATRL.get('R' + me) || [], t = Date.now(), fresh = rl.filter(x => t - x < 3600e3);
  if (fresh.length >= 10) bad("Juda ko'p shikoyat: keyinroq urinib ko'ring", 429); fresh.push(t); CHATRL.set('R' + me, fresh);
  await run('INSERT INTO chat_reports(msg_id,thread_id,reporter,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(msg_id,reporter) DO NOTHING', [id, m.thread_id, me, reason, now()]);
  return { ok: 1 };
}
for (const [pre, guard] of [['', () => {}], ['/student', needS]]) {
  r('POST', pre + '/chat/msg/(\\d+)/delete', async ({ u, m }) => { guard(u); return chatDel(u, +m[1]); });
  r('POST', pre + '/chat/msg/(\\d+)/report', async ({ u, m, b }) => { guard(u); return chatReport(u, +m[1], b || {}); });
}
r('GET', '/chat/mod/reports', async ({ u, qs }) => {
  need(u, 'admin', 'director'); const st = qs.status === 'closed' ? 'closed' : 'new';
  const rows = await q(`SELECT r.id,r.msg_id,r.thread_id,r.reporter,r.reason,r.created_at,r.status,r.note,m.sender,m.body,m.del_at FROM chat_reports r JOIN chat_msgs m ON m.id=r.msg_id WHERE r.status=? ORDER BY r.id DESC LIMIT 100`, [st]);
  const nm = await pNames(rows.flatMap(x => [x.reporter, x.sender]));
  return rows.map(x => ({ id: x.id, msg_id: x.msg_id, reason: x.reason, at: x.created_at, status: x.status, note: x.note, body: x.body, deleted: x.del_at ? 1 : 0, reporter: { party: x.reporter, name: nm[x.reporter].name, sub: nm[x.reporter].sub }, sender: { party: x.sender, name: nm[x.sender].name, sub: nm[x.sender].sub } }));
});
r('GET', '/chat/mod/reports/(\\d+)/context', async ({ u, m }) => {
  need(u, 'admin', 'director'); const rp = await one('SELECT * FROM chat_reports WHERE id=?', [+m[1]]); if (!rp) bad('Topilmadi', 404);
  const before = await q('SELECT id,sender,body,created_at,del_at FROM chat_msgs WHERE thread_id=? AND id<=? ORDER BY id DESC LIMIT 7', [rp.thread_id, rp.msg_id]), after = await q('SELECT id,sender,body,created_at,del_at FROM chat_msgs WHERE thread_id=? AND id>? ORDER BY id LIMIT 3', [rp.thread_id, rp.msg_id]);
  const ms = [...before.reverse(), ...after], nm = await pNames(ms.map(x => x.sender));
  return { msgs: ms.map(x => ({ id: x.id, name: nm[x.sender].name, party: x.sender, body: x.body, deleted: x.del_at ? 1 : 0, at: x.created_at, hit: x.id === rp.msg_id ? 1 : 0 })) };
});
r('POST', '/chat/mod/reports/(\\d+)/close', async ({ u, m, b }) => {
  need(u, 'admin', 'director'); const x = await run("UPDATE chat_reports SET status='closed',handled_by=?,handled_at=?,note=? WHERE id=?", [u.id, now(), String((b || {}).note || '').slice(0, 300), +m[1]]); if (!x.rowsAffected) bad('Topilmadi', 404);
  await audit(u, 'chat_report_close', 'chat_report', m[1], null, null); return { ok: 1 };
});
r('POST', '/chat/mod/mute', async ({ u, b }) => {
  need(u, 'admin', 'director'); const p = String(b.party || ''), days = Math.round(+b.days);
  if (!/^[sp]\d{1,9}$/.test(p)) bad("Faqat o'quvchi yoki ota-onani cheklash mumkin"); if (!(days >= 1 && days <= 365)) bad('Muddat 1–365 kun');
  const until = new Date(Date.now() + days * 864e5).toISOString().replace('T', ' ').slice(0, 19), reason = String(b.reason || '').trim().slice(0, 200);
  await run('INSERT INTO chat_mutes(party,until,reason,by_user,created_at) VALUES(?,?,?,?,?) ON CONFLICT(party) DO UPDATE SET until=excluded.until,reason=excluded.reason,by_user=excluded.by_user,created_at=excluded.created_at', [p, until, reason, u.id, now()]);
  await audit(u, 'chat_mute', 'chat_party', p, null, { until, reason }); return { ok: 1, until };
});
r('POST', '/chat/mod/unmute', async ({ u, b }) => { need(u, 'admin', 'director'); const p = String(b.party || ''); await run('DELETE FROM chat_mutes WHERE party=?', [p]); await audit(u, 'chat_unmute', 'chat_party', p, null, null); return { ok: 1 }; });
r('GET', '/chat/mod/mutes', async ({ u }) => {
  need(u, 'admin', 'director'); const rows = await q('SELECT party,until,reason,created_at FROM chat_mutes WHERE until>? ORDER BY until', [now()]), nm = await pNames(rows.map(x => x.party));
  return rows.map(x => ({ party: x.party, name: nm[x.party].name, sub: nm[x.party].sub, until: x.until, reason: x.reason }));
});
async function chatPurge(sid) {
  const ps = ['s' + sid, 'p' + sid], ids = (await q('SELECT id FROM chat_threads WHERE a IN(?,?) OR b IN(?,?)', [...ps, ...ps])).map(x => x.id);
  const st = [{ sql: 'DELETE FROM tg_links WHERE student_id=?', args: [sid] }, { sql: 'DELETE FROM tg_codes WHERE student_id=?', args: [sid] }];
  st.push({ sql: 'DELETE FROM chat_mutes WHERE party IN(?,?)', args: ps });
  for (const i of ids) st.push({ sql: 'DELETE FROM chat_reports WHERE thread_id=?', args: [i] }, { sql: 'DELETE FROM chat_msgs WHERE thread_id=?', args: [i] }, { sql: 'DELETE FROM chat_reads WHERE thread_id=?', args: [i] }, { sql: 'DELETE FROM chat_threads WHERE id=?', args: [i] });
  await db.batch(st, 'write');
}

// ===== Telegram: ota-onalarga xabarlar (bot tokeni bazada, zaxira nusxaga kirmaydi) =====
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const TGEV = { ev_remind: "Qarz bo'yicha to'lov eslatmasi", ev_absent: 'Darsga kelmadi / kech qoldi', ev_grade: 'Yangi baho', ev_pay: "To'lov qabul qilindi", ev_ann: "E'lonlar (ota-onalarga)", ev_chat: 'Yangi chat xabari' };
const tgCfg = async () => Object.fromEntries((await q('SELECT key,value FROM tg_config')).map(x => [x.key, x.value]));
const tgSet = (k, v) => run('INSERT INTO tg_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
async function tgApi(token, method, body) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
  try { const x = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: ac.signal }); return await x.json(); }
  catch (e) { return { ok: false, description: String(e.message || e) }; } finally { clearTimeout(t); }
}
const TGQ = []; let tgBusy = false;
function tgPush(chat, text) { TGQ.push([chat, text]); if (!tgBusy) tgPump(); }
async function tgPump() {
  tgBusy = true;
  try {
    const c = await tgCfg();
    while (TGQ.length) {
      const [chat, text] = TGQ.shift(); if (!c.bot_token) continue;
      const x = await tgApi(c.bot_token, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (x.ok === false && x.error_code === 403) await run('DELETE FROM tg_links WHERE chat_id=?', [chat]); // ota-ona botni bloklagan
      await new Promise(r => setTimeout(r, 60));
    }
  } catch (e) { console.error('tg', e); } finally { tgBusy = false; }
}
async function tgParents(sid, ev, text) {
  const c = await tgCfg(); if (!c.bot_token || c[ev] === '0') return;
  for (const l of await q('SELECT chat_id FROM tg_links WHERE student_id=?', [sid])) tgPush(l.chat_id, text);
}
const tgBal = async sid => (await one('SELECT (SELECT COALESCE(SUM(amount),0) FROM charges WHERE student_id=?)-(SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id=? AND status=\'ok\') b', [sid, sid])).b;
const tgSafe = p => p.catch(e => console.error('tg', e && e.message));
// o'quvchi/ota-ona bildirishnomalari (xato bo'lsa asosiy amalga halal bermaydi)
const tgAbs = (sid, sj, date, st) => tgSafe((async () => { const x = await one('SELECT s.name,(SELECT name FROM subjects WHERE id=?) sb FROM students s WHERE s.id=?', [sj, sid]); if (x) await tgParents(sid, 'ev_absent', `${st === 'kelmadi' ? '⚠️' : '⏰'} <b>${esc(x.name)}</b> ${esc(date)} kuni ${esc(x.sb)} darsida ${st === 'kelmadi' ? 'qatnashmadi' : 'kech qoldi'}.`); })());
const tgGrade = (sid, sj, date, v, max, type) => tgSafe((async () => { const x = await one('SELECT s.name,(SELECT name FROM subjects WHERE id=?) sb FROM students s WHERE s.id=?', [sj, sid]); if (x) await tgParents(sid, 'ev_grade', `📝 <b>${esc(x.name)}</b>: ${esc(x.sb)} — <b>${v}/${max}</b> (${esc(type)}, ${esc(date)})`); })());
const tgPay = (sid, amt) => tgSafe((async () => { const x = await one('SELECT name FROM students WHERE id=?', [sid]); if (!x) return; const b = await tgBal(sid); await tgParents(sid, 'ev_pay', `💳 <b>${esc(x.name)}</b> uchun ${Math.round(amt).toLocaleString('ru-RU')} so'm to'lov qabul qilindi. ${b > 0 ? `Qoldiq: ${Math.round(b).toLocaleString('ru-RU')} so'm.` : b < 0 ? "Oldindan to'langan." : "Qarz yo'q."}`); })());
const tgAnn = (title, body, aud) => tgSafe((async () => { if (aud !== 'all' && aud !== 'parents') return; const c = await tgCfg(); if (!c.bot_token || c.ev_ann === '0') return; const seen = new Set(); for (const l of await q("SELECT l.chat_id FROM tg_links l JOIN students s ON s.id=l.student_id WHERE s.status='faol'")) if (!seen.has(l.chat_id)) { seen.add(l.chat_id); tgPush(l.chat_id, `📢 <b>${esc(title)}</b>\n${esc(String(body).slice(0, 600))}`); } })());
const CODE_AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
r('POST', '/student/tg/code', async ({ u }) => {
  if (u.role !== 'parent') bad("Faqat ota-ona kabinetida", 403); const c = await tgCfg(); if (!c.bot_token || !c.bot_username) bad('Telegram bot hali sozlanmagan. Maktab ma\'muriyatiga murojaat qiling', 400);
  await run('DELETE FROM tg_codes WHERE exp<?', [Date.now()]); await run('DELETE FROM tg_codes WHERE student_id=?', [u.id]);
  const code = Array.from(crypto.randomBytes(8), x => CODE_AL[x % 32]).join(''); await run('INSERT INTO tg_codes(code,student_id,exp) VALUES(?,?,?)', [code, u.id, Date.now() + 30 * 60e3]);
  return { code, bot: c.bot_username, url: `https://t.me/${c.bot_username}?start=${code}` };
});
r('GET', '/student/tg', async ({ u }) => { needS(u); const c = await tgCfg(); return { available: u.role === 'parent' && !!c.bot_token && !!c.bot_username, bot: c.bot_username || null, linked: u.role === 'parent' ? (await one('SELECT COUNT(*) n FROM tg_links WHERE student_id=?', [u.id])).n : 0 }; });
r('DELETE', '/student/tg', async ({ u }) => { if (u.role !== 'parent') bad('Ruxsat yo\'q', 403); await run('DELETE FROM tg_links WHERE student_id=?', [u.id]); return { ok: 1 }; });
r('POST', '/tg/webhook/([A-Za-z0-9_-]+)', async ({ m, b, ip }) => {
  const c = await tgCfg(), sec = String(c.webhook_secret || ''), got = m[1];
  if (!sec || got.length !== sec.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sec))) bad('Ruxsat yo\'q', 403);
  const msg = b && b.message; if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return { ok: 1 };
  const chat = String(msg.chat.id), text = msg.text.trim(), say = t => tgApi(c.bot_token, 'sendMessage', { chat_id: chat, text: t, parse_mode: 'HTML' });
  const mm = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9]{6,12}))?$/i.exec(text);
  if (mm && mm[1]) {
    if (locked('T|' + chat, 6)) { await say("Juda ko'p urinish. Keyinroq qayta urinib ko'ring."); return { ok: 1 }; }
    const k = await one('SELECT c.student_id,s.name FROM tg_codes c JOIN students s ON s.id=c.student_id WHERE c.code=? AND c.exp>?', [mm[1].toUpperCase(), Date.now()]);
    if (!k) { failed('T|' + chat); await say("Kod noto'g'ri yoki muddati tugagan. Saytdagi «To'lovlar/Telegram» bo'limidan yangi kod oling."); return { ok: 1 }; }
    await run('INSERT OR IGNORE INTO tg_links(chat_id,student_id,created_at) VALUES(?,?,?)', [chat, k.student_id, now()]); await run('DELETE FROM tg_codes WHERE code=?', [mm[1].toUpperCase()]);
    await say(`✅ Ulandi: <b>${esc(k.name)}</b>. Endi baho, davomat, to'lov va e'lonlar shu yerga keladi.\nTo'xtatish: /stop`);
  } else if (/^\/stop/i.test(text)) { await run('DELETE FROM tg_links WHERE chat_id=?', [chat]); await say("Xabarlar o'chirildi. Qayta ulash uchun saytdan yangi kod oling."); }
  else await say("Assalomu alaykum! Farzandingiz xabarlarini olish uchun maktab saytidagi ota-ona kabinetida «Telegramni ulash» tugmasini bosing.");
  return { ok: 1 };
});
r('GET', '/tg/config', async ({ u, ev }) => {
  need(u, 'admin'); const c = await tgCfg(), host = ev.headers?.['x-forwarded-host'] || ev.headers?.host || '';
  return { token_set: !!c.bot_token, bot_username: c.bot_username || '', events: Object.fromEntries(Object.keys(TGEV).map(k => [k, c[k] !== '0'])), labels: TGEV, parents_linked: (await one('SELECT COUNT(DISTINCT student_id) n FROM tg_links')).n, chats: (await one('SELECT COUNT(DISTINCT chat_id) n FROM tg_links')).n, webhook_url: c.webhook_secret && host ? `https://${host}/api/tg/webhook/${c.webhook_secret}` : null, webhook_on: c.webhook_on === '1' };
});
r('PUT', '/tg/config', async ({ u, b }) => {
  need(u, 'admin'); const tok = String(b.bot_token || '').trim();
  if (tok) { if (!/^\d{5,12}:[A-Za-z0-9_-]{30,60}$/.test(tok)) bad("Bot tokeni formati noto'g'ri"); const me = await tgApi(tok, 'getMe'); if (!me.ok) bad("Token qabul qilinmadi: " + (me.description || 'Telegramga ulanib bo\'lmadi'));
    await tgSet('bot_token', tok); await tgSet('bot_username', me.result.username || ''); await tgSet('webhook_on', '0'); }
  if (b.events && typeof b.events === 'object') for (const k of Object.keys(TGEV)) if (k in b.events) await tgSet(k, b.events[k] ? '1' : '0');
  if (!(await tgCfg()).webhook_secret) await tgSet('webhook_secret', crypto.randomBytes(24).toString('base64url'));
  await audit(u, 'update', 'tg_config', '-', null, { token: tok ? 'yangilandi' : undefined }); return { ok: 1 };
});
r('DELETE', '/tg/config', async ({ u }) => { need(u, 'admin'); const c = await tgCfg(); if (c.bot_token) await tgApi(c.bot_token, 'deleteWebhook'); await run("DELETE FROM tg_config WHERE key IN('bot_token','bot_username','webhook_on','webhook_secret')"); await run('DELETE FROM tg_links'); await run('DELETE FROM tg_codes'); await audit(u, 'delete', 'tg_config', '-', null, null); return { ok: 1 }; });
r('POST', '/tg/webhook-set', async ({ u, ev }) => {
  need(u, 'admin'); const c = await tgCfg(), host = ev.headers?.['x-forwarded-host'] || ev.headers?.host; if (!c.bot_token) bad('Avval bot tokenini saqlang');
  if (!c.webhook_secret) { await tgSet('webhook_secret', crypto.randomBytes(24).toString('base64url')); c.webhook_secret = (await tgCfg()).webhook_secret; }
  const x = await tgApi(c.bot_token, 'setWebhook', { url: `https://${host}/api/tg/webhook/${c.webhook_secret}`, allowed_updates: ['message'], drop_pending_updates: true });
  if (!x.ok) bad('Webhook o\'rnatilmadi: ' + (x.description || 'xato')); await tgSet('webhook_on', '1'); return { ok: 1 };
});
r('POST', '/tg/test', async ({ u, b }) => { // administrator o'ziga emas, tanlangan ota-ona ulanishiga sinov xabari
  need(u, 'admin'); const c = await tgCfg(); if (!c.bot_token) bad('Bot sozlanmagan'); const n = (await q('SELECT chat_id FROM tg_links WHERE student_id=?', [+b.student_id || 0])); for (const l of n) tgPush(l.chat_id, "🔔 Sinov xabari: Telegram ulanishi ishlayapti."); return { sent: n.length };
});

// ===== Parolni tiklash (o'quvchi/ota-ona): bir martalik kod ota-onaning ulangan Telegramiga yuboriladi =====
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const famAcc = async lg => { let a = await one("SELECT a.*,s.status,'s' kind FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE lower(a.login)=?", [lg]); return a || await one("SELECT a.*,s.status,'p' kind FROM parent_accounts a JOIN students s ON s.id=a.student_id WHERE lower(a.login)=?", [lg]); };
r('POST', '/forgot', async ({ b, ip }) => {
  const lg = String(b.login || '').trim().toLowerCase().slice(0, 60); if (!lg) bad('Loginni kiriting');
  if (locked('F|' + ip, 8) || locked('FL|' + lg, 4)) bad("Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring", 429);
  failed('F|' + ip); failed('FL|' + lg);
  const a = await famAcc(lg);
  if (a && a.is_active && a.status === 'faol') {
    const links = await q('SELECT chat_id FROM tg_links WHERE student_id=?', [a.student_id]), cfg = await tgCfg(), ex = await one('SELECT exp FROM reset_codes WHERE login=?', [lg]);
    if (links.length && cfg.bot_token && !(ex && ex.exp - 9 * 60e3 > Date.now())) { // 60 soniyada bir martadan ko'p yuborilmaydi
      const code = String(crypto.randomInt(100000, 1000000));
      await run('INSERT INTO reset_codes(login,code,exp,tries) VALUES(?,?,?,0) ON CONFLICT(login) DO UPDATE SET code=excluded.code,exp=excluded.exp,tries=0', [lg, sha(code), Date.now() + 10 * 60e3]);
      for (const l of links) tgPush(l.chat_id, `🔐 Parolni tiklash kodi: <b>${code}</b>\nLogin: ${esc(a.login)}. 10 daqiqa amal qiladi. Siz so'ramagan bo'lsangiz, e'tibor bermang.`);
    }
  }
  return { ok: 1, message: "Agar login to'g'ri va ota-onaning Telegrami ulangan bo'lsa, tasdiqlash kodi yuborildi (10 daqiqa amal qiladi). Telegram ulanmagan bo'lsa, sinf rahbaringizga murojaat qiling." }; // login bor-yo'qligi oshkor qilinmaydi
});
r('POST', '/forgot-confirm', async ({ b, ip }) => {
  const lg = String(b.login || '').trim().toLowerCase().slice(0, 60), code = String(b.code || '').trim(), np = String(b.password || '');
  if (locked('C|' + ip, 15) || locked('CL|' + lg, 8)) bad("Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring", 429);
  if (np.length < 8) bad("Yangi parol kamida 8 belgi bo'lsin");
  const rc = await one('SELECT * FROM reset_codes WHERE login=?', [lg]), a = await famAcc(lg);
  const same = rc && /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(rc.code));
  if (!rc || !a || !a.is_active || rc.exp < Date.now() || rc.tries >= 5 || !same) { failed('C|' + ip); failed('CL|' + lg); if (rc) await run('UPDATE reset_codes SET tries=tries+1 WHERE login=?', [lg]); bad("Kod noto'g'ri yoki muddati tugagan", 400); }
  await run(`UPDATE ${a.kind === 'p' ? 'parent_accounts' : 'student_accounts'} SET pass=? WHERE student_id=?`, [hash(np), a.student_id]); await run('DELETE FROM reset_codes WHERE login=?', [lg]);
  await audit({ id: 0, name: 'Parolni tiklash', role: a.kind === 'p' ? 'parent' : 'student' }, 'password', 'account', a.student_id, null, { via: 'telegram' }); return { ok: 1 };
});
// ===== Qarzdorlarga Telegram eslatmasi (qo'lda yoki har oyning belgilangan kunida avtomatik) =====
// Bir o'quvchiga 6 kundan tez-tez yuborilmaydi; Telegram ulanmagan oilalar sanaladi, lekin xabar bormaydi.
async function finRemind({ class_id = 0, min_debt = 0 } = {}) {
  const cfg = await tgCfg(); if (!cfg.bot_token || cfg.ev_remind === '0') return { debtors: 0, sent: 0, no_telegram: 0, recent: 0, disabled: true };
  const org = (await finCfg()).org_name || 'Maktab', since = dAdd(tashkentToday(), -5);
  const rows = await q(`SELECT s.id,s.name,(SELECT COALESCE(SUM(amount),0) FROM charges WHERE student_id=s.id)-(SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id=s.id AND status='ok') bal FROM students s WHERE s.status='faol'${class_id ? ' AND s.class_id=?' : ''}`, class_id ? [class_id] : []);
  const out = { debtors: 0, sent: 0, no_telegram: 0, recent: 0 }; const on = (await finCfg()).click_service_id || (await finCfg()).payme_merchant_id;
  for (const x of rows) {
    if (!(x.bal > min_debt)) continue; out.debtors++;
    if (await one('SELECT 1 x FROM remind_log WHERE student_id=? AND sent_on>=?', [x.id, since])) { out.recent++; continue; }
    const links = await q('SELECT chat_id FROM tg_links WHERE student_id=?', [x.id]); if (!links.length) { out.no_telegram++; continue; }
    for (const l of links) tgPush(l.chat_id, `💰 <b>${esc(x.name)}</b>: to'lov eslatmasi\nJoriy qarz: <b>${Math.round(x.bal).toLocaleString('ru-RU')} so'm</b> (${esc(org)}).\nTo'lash: maktab saytida «To'lovlar» bo'limi${on ? ' (Click/Payme orqali ham mumkin)' : ''}. To'lov qilgan bo'lsangiz, e'tibor bermang.`);
    await run('INSERT INTO remind_log(student_id,sent_on) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET sent_on=excluded.sent_on', [x.id, tashkentToday()]); out.sent++;
  }
  return out;
}
exports.autoRemind = async () => { // server.js har 30 daqiqada chaqiradi: belgilangan kuni 10:00 dan keyin bir marta
  await init(); const c = await finCfg(), day = +(c.remind_day || 0), t = tashkentToday(), h = (new Date().getUTCHours() + 5) % 24;
  if (!day || +t.slice(8) !== day || h < 10 || c.remind_last === t) return null;
  await finSet('remind_last', t); const r = await finRemind({ min_debt: +(c.remind_min || 0) }); console.log('Avto-eslatma:', JSON.stringify(r)); return r;
};
r('POST', '/fin/remind', async ({ u, b }) => { await needFin(u); const r = await finRemind({ class_id: +b.class_id || 0, min_debt: Math.max(0, +b.min_debt || 0) }); await audit(u, 'remind', 'fin', '-', null, r); return r; });
// ===== Yangi o'quv yiliga o'tkazish =====
// Tarix saqlanadi: baho va davomat eski sinf yozuvida qoladi, sinf arxivga o'tadi (arxivdan jurnalni ko'rish mumkin). O'quvchilar yangi sinfga ko'chadi, bitiruvchilar 'arxiv' holatiga o'tadi.
const nextYear = y => { const m = /^(\d{4})\D+(\d{4})$/.exec(String(y || '')); return m ? `${+m[1] + 1}-${+m[2] + 1}` : ''; };
const nextClass = (name, fin) => { const m = /^(\d{1,2})(.*)$/.exec(String(name).trim()); if (!m) return { to: String(name), grad: false }; const n = +m[1]; return n >= fin ? { to: null, grad: true } : { to: `${n + 1}${m[2]}`, grad: false }; };
r('GET', '/year/preview', async ({ u, qs }) => {
  need(u, 'admin'); const fin = Math.min(12, Math.max(1, +qs.final_grade || 11));
  const cls = await q("SELECT c.id,c.name,c.year,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom,(SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status='faol') n,(SELECT COALESCE(SUM(ch.amount),0) FROM charges ch JOIN students s ON s.id=ch.student_id WHERE s.class_id=c.id AND s.status='faol')-(SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN students s ON s.id=p.student_id WHERE s.class_id=c.id AND s.status='faol' AND p.status='ok') debt FROM classes c WHERE c.archived=0 ORDER BY c.name");
  const ys = cls.map(c => c.year).sort(); const cur = ys[ys.length - 1] || '';
  return { current_year: cur, new_year: nextYear(cur), final_grade: fin, today: tashkentToday(), classes: cls.map(c => ({ ...c, ...nextClass(c.name, fin), debt: Math.max(0, c.debt || 0) })) };
});
r('POST', '/year/promote', async ({ u, b }) => {
  need(u, 'admin'); if (b.confirm !== 'OTKAZISH') bad('Tasdiqlash uchun confirm:"OTKAZISH" yuboring');
  const ny = String(b.new_year || '').trim(); if (!/^\d{4}-\d{4}$/.test(ny)) bad("Yangi o'quv yili YYYY-YYYY ko'rinishida bo'lsin (masalan, 2027-2028)");
  const last = b.last_day ? String(b.last_day) : tashkentToday(); dateOk(last);
  const plan = Array.isArray(b.plan) ? b.plan : []; if (!plan.length) bad("O'tkazish rejasi bo'sh");
  const seen = new Set(), steps = [], sum = [];
  for (const it of plan) {
    const id = +it.class_id; if (seen.has(id)) bad('Sinf ikki marta kiritilgan'); seen.add(id);
    const c = await one('SELECT * FROM classes WHERE id=? AND archived=0', [id]); if (!c) bad(`Sinf topilmadi yoki allaqachon arxivda (id ${id})`);
    const n = (await one("SELECT COUNT(*) n FROM students WHERE class_id=? AND status='faol'", [id])).n, to = it.to == null || it.to === '' ? null : String(it.to).trim().slice(0, 20);
    if (to !== null) {
      if (!to) bad("Yangi sinf nomi bo'sh"); if (to === c.name && ny === c.year) bad(`${c.name}: yangi sinf eskisi bilan bir xil bo'lib qoldi`);
      steps.push({ sql: 'INSERT OR IGNORE INTO classes(name,year,archived) VALUES(?,?,0)', args: [to, ny] });
      if (b.keep_homeroom) steps.push({ sql: 'UPDATE classes SET homeroom_id=? WHERE name=? AND year=? AND homeroom_id IS NULL', args: [c.homeroom_id, to, ny] });
      if (b.copy_fee) steps.push({ sql: 'INSERT OR IGNORE INTO class_fee(class_id,monthly) SELECT c2.id,f.monthly FROM class_fee f JOIN classes c2 ON c2.name=? AND c2.year=? WHERE f.class_id=?', args: [to, ny, id] });
      steps.push({ sql: "UPDATE students SET class_id=(SELECT id FROM classes WHERE name=? AND year=?) WHERE class_id=? AND status='faol'", args: [to, ny, id] });
    } else steps.push({ sql: "UPDATE students SET status='arxiv' WHERE class_id=? AND status='faol'", args: [id] });
    steps.push({ sql: 'UPDATE classes SET archived=1 WHERE id=?', args: [id] }, { sql: 'UPDATE timetable SET valid_to=? WHERE class_id=? AND (valid_to IS NULL OR valid_to>?)', args: [last, id, last] });
    sum.push({ from: c.name, to, students: n });
  }
  let backup = null; try { if (global.SCHOOL_BACKUP) backup = (await global.SCHOOL_BACKUP.run()).name; } catch { /* zaxira ixtiyoriy */ }
  await db.batch(steps, 'write'); await audit(u, 'promote', 'year', ny, null, { plan: sum, last_day: last, backup });
  return { ok: 1, new_year: ny, moved: sum.filter(x => x.to).reduce((a, x) => a + x.students, 0), graduated: sum.filter(x => !x.to).reduce((a, x) => a + x.students, 0), backup, classes: sum };
});
// ===== Login urinishlarini cheklash (jarayon xotirasida; bir nechta nusxa bo'lsa har biri alohida hisoblaydi) =====
const FAILS = new Map(), MAXF = 8, WIN = 10 * 60e3;
const failKey = (ip, login) => ip + '|' + String(login || '').toLowerCase().slice(0, 40);
const loginKey = login => 'L|' + String(login || '').toLowerCase().slice(0, 40); // IP soxtalashtirilsa ham bitta loginga hujumni cheklaydi
setInterval(() => { const t = Date.now(); for (const [k, f] of FAILS) if (t - f.t > WIN) FAILS.delete(k); }, 5 * 60e3).unref();
const locked = (k, max = MAXF) => { const f = FAILS.get(k); if (!f) return false; if (Date.now() - f.t > WIN) { FAILS.delete(k); return false; } return f.n >= max; };
const failed = k => { const f = FAILS.get(k); FAILS.set(k, f && Date.now() - f.t <= WIN ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); };

// ===== Hafta va oy o'quvchisi: faqat baholangan ishlarning o'rtacha foizi (baholanmagan ish hisobga olinmaydi) =====
const TZ_TODAY = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
function period(unit, off) {
  const t = new Date(TZ_TODAY() + 'T12:00:00Z'), iso = d => d.toISOString().slice(0, 10);
  if (unit === 'week') { const st = new Date(t); st.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) - 7 * off); const en = new Date(st); en.setUTCDate(st.getUTCDate() + 6); return [iso(st), iso(en)]; }
  const st = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - off, 1, 12)), en = new Date(Date.UTC(st.getUTCFullYear(), st.getUTCMonth() + 1, 0, 12)); return [iso(st), iso(en)];
}
const abbr = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || ''; };
async function board(unit, classIds, short) {
  const min = unit === 'week' ? 2 : 4;
  for (const off of [0, 1]) {
    const [from, to] = period(unit, off), inC = classIds ? ` AND s.class_id IN (${classIds.map(Number).join(',') || 0})` : '';
    const rows = await q(`SELECT s.name,c.name cls,ROUND(AVG(100.0*g.value/g.max),1) pct,COUNT(*) n FROM grades g JOIN students s ON s.id=g.student_id JOIN classes c ON c.id=s.class_id
      WHERE s.status='faol' AND g.max>0 AND g.date BETWEEN ? AND ?${inC} GROUP BY s.id HAVING COUNT(*)>=? ORDER BY pct DESC,n DESC,s.name LIMIT 5`, [from, to, min]);
    if (rows.length || off) return { label: (unit === 'week' ? (off ? "O'tgan hafta" : 'Shu hafta') : (off ? "O'tgan oy" : 'Shu oy')), from, to, min_grades: min, items: rows.map(x => ({ name: short ? abbr(x.name) : x.name, class: x.cls, percent: x.pct, grades: x.n })) };
  }
}
let HOME = null;
r('GET', '/public/home', async () => {
  if (HOME && Date.now() - HOME.t < 60e3) return HOME.d;
  const s = Object.fromEntries((await q('SELECT key,value FROM settings')).map(x => [x.key, x.value])), on = s.public_leaders === '1';
  const d = {
    school_name: s.school_name, logo: s.logo || null, brand: s.brand || null,
    stats: { classes: (await one('SELECT COUNT(*) n FROM classes WHERE archived=0')).n, students: (await one("SELECT COUNT(*) n FROM students WHERE status='faol'")).n, teachers: (await one("SELECT COUNT(*) n FROM users WHERE role='teacher' AND is_active=1")).n },
    leaders: on ? { week: await board('week', null, true), month: await board('month', null, true) } : null
  };
  HOME = { t: Date.now(), d }; return d;
});
// Xodimlar uchun (to'liq ism): administrator/direktor — butun maktab; o'qituvchi — faqat o'z sinflari
r('GET', '/leaders', async ({ u }) => {
  let ids = null;
  if (u.role === 'teacher') ids = (await q('SELECT DISTINCT c.id FROM classes c LEFT JOIN assignments a ON a.class_id=c.id WHERE c.homeroom_id=? OR a.teacher_id=?', [u.id, u.id])).map(x => x.id);
  return { week: await board('week', ids, false), month: await board('month', ids, false), scope: ids ? "faqat o'z sinflaringiz" : 'butun maktab' };
});

exports.handler = async ev => {
  const H = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  try {
    await init();
    const path = (ev.path || '').replace(/^\/(\.netlify\/functions\/api|api)/, '') || '/';
    const method = ev.httpMethod, hit = routes.find(x => x[0] === method && x[1].test(path));
    if (!hit) bad('Topilmadi', 404);
    let u = null; const open = path.startsWith('/pay/') || path.startsWith('/tg/webhook/') || path === '/forgot' || path === '/forgot-confirm' || path === '/login' || path === '/link-login' || path === '/public' || path === '/public/home' || path === '/logout';
    if (!open) {
      const ck = /(?:^|;\s*)sid=([^;]+)/.exec(ev.headers?.cookie || ''); const d = unsign(ck && ck[1]);
      if (d && (d.k === 's' || d.k === 'p')) { // o'quvchi/ota-ona sessiyasi: parol almashtirilsa yoki hisob o'chirilsa/bloklansa darhol bekor bo'ladi
        const par = d.k === 'p', a = await one(`SELECT s.id,s.name,s.class_id,a.pass FROM students s JOIN ${par ? 'parent_accounts' : 'student_accounts'} a ON a.student_id=s.id WHERE s.id=? AND a.is_active=1 AND s.status='faol'`, [d.id]);
        u = a && a.pass.slice(-12) === d.pv ? { id: a.id, name: a.name, role: par ? 'parent' : 'student', class_id: a.class_id } : null;
      } else { const w = d && await one('SELECT id,name,role,pass FROM users WHERE id=? AND is_active=1', [d.id]); u = w && w.pass.slice(-12) === d.pv ? { id: w.id, name: w.name, role: w.role } : null; } // parol almashsa eski sessiyalar bekor
      if (!u) bad('Kirish talab qilinadi', 401);
      // o'quvchi faqat o'z kabinetiga kira oladi (qolgan barcha yo'llar taqiqlanadi)
      if ((u.role === 'student' || u.role === 'parent') && !(path === '/me' || path.startsWith('/student/'))) bad('Ruxsat yo\'q', 403);
    }
    let b; try { const raw = ev.body && ev.isBase64Encoded ? Buffer.from(ev.body, 'base64').toString() : ev.body, ct = String(ev.headers?.['content-type'] || ''); b = !raw ? {} : /x-www-form-urlencoded/.test(ct) ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw); } catch { bad("So'rov noto'g'ri", 400); } if (!b || typeof b !== 'object') b = {};
    const ip = String(ev.headers?.['x-forwarded-for'] || ev.headers?.['x-nf-client-connection-ip'] || '-').split(',')[0].trim();
    const res = await hit[2]({ u, b, ip, ev, qs: ev.queryStringParameters || {}, m: hit[1].exec(path) });
    if (res && 'cookie' in res) {
      const val = res.cookie ? `sid=${res.cookie}; Max-Age=43200` : 'sid=; Max-Age=0';
      return { statusCode: 200, headers: { ...H, 'set-cookie': `${val}; Path=/; HttpOnly; Secure; SameSite=Strict` }, body: JSON.stringify(res.body || { ok: 1 }) };
    }
    return { statusCode: 200, headers: H, body: JSON.stringify(res) };
  } catch (e) {
    if (e instanceof HttpErr) return { statusCode: e.c, headers: H, body: JSON.stringify({ error: e.message }) };
    console.error(e); return { statusCode: 500, headers: H, body: JSON.stringify({ error: 'Server xatosi' }) };
  }
};
