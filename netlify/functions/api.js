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
`CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL REFERENCES classes(id),subject_id INTEGER NOT NULL REFERENCES subjects(id),teacher_id INTEGER NOT NULL REFERENCES users(id),weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),start TEXT NOT NULL,end TEXT NOT NULL,room TEXT)`,
`CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,teacher_id INTEGER NOT NULL,date TEXT NOT NULL,topic TEXT,homework TEXT,note TEXT,UNIQUE(class_id,subject_id,date))`,
`CREATE TABLE IF NOT EXISTS grades(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,teacher_id INTEGER NOT NULL,date TEXT NOT NULL,type TEXT NOT NULL,value REAL NOT NULL,max REAL NOT NULL DEFAULT 5,comment TEXT,UNIQUE(student_id,subject_id,date,type))`,
`CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('keldi','kelmadi','kechikdi','uzrli')),note TEXT,UNIQUE(student_id,subject_id,date))`,
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

async function conflict(b, skip = 0) {
  const base = 'SELECT t.*,c.name cn,u.name un FROM timetable t JOIN classes c ON c.id=t.class_id JOIN users u ON u.id=t.teacher_id WHERE t.weekday=? AND t.start<? AND t.end>? AND t.id!=?';
  for (const r of await q(base, [b.weekday, b.end, b.start, skip])) {
    if (r.teacher_id == b.teacher_id) bad(`To'qnashuv: ${r.un} ${r.start}–${r.end} da ${r.cn} sinfida darsi bor`, 409);
    if (r.class_id == b.class_id) bad(`To'qnashuv: ${r.cn} sinfida ${r.start}–${r.end} da boshqa dars bor`, 409);
    if (b.room && r.room && r.room === b.room) bad(`To'qnashuv: ${b.room}-xona ${r.start}–${r.end} da band`, 409);
  }
}
const needStudent = async (id, c) => { const s = await one('SELECT * FROM students WHERE id=?', [id]); if (!s || s.class_id != c) bad('O\'quvchi bu sinfga tegishli emas'); if (s.status !== 'faol') bad('O\'quvchi arxivlangan'); return s; };

const routes = [];
const r = (m, p, f) => routes.push([m, new RegExp('^' + p + '$'), f]);

r('GET', '/public', async () => { const s = Object.fromEntries((await q('SELECT key,value FROM settings')).map(x => [x.key, x.value])); return { school_name: s.school_name, logo: s.logo || null, brand: s.brand || null, leaders_public: s.public_leaders === '1' }; });
r('POST', '/login', async ({ b, ip }) => {
  if (!SECRET) bad('Server sozlanmagan', 500);
  const fk = failKey(ip, b.login); if (locked(fk)) bad("Juda ko'p noto'g'ri urinish. 10 daqiqadan keyin qayta urinib ko'ring", 429);
  const u = await one('SELECT * FROM users WHERE login=?', [String(b.login || '')]);
  if (!u || !u.is_active || !verify(String(b.password || ''), u.pass)) { failed(fk); bad('Login yoki parol noto\'g\'ri', 401); }
  FAILS.delete(fk);
  return { body: { id: u.id, name: u.name, role: u.role }, cookie: sign({ id: u.id, exp: Date.now() + 12 * 3600e3 }) };
});
r('POST', '/logout', async () => ({ cookie: '' }));
r('GET', '/me', async ({ u }) => u);
r('PUT', '/settings', async ({ u, b }) => {
  need(u, 'admin'); const set = (k, v) => run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
  if (b.school_name !== undefined) { const n = String(b.school_name).trim().slice(0, 100); if (n.length < 2) bad('Maktab nomi juda qisqa'); await set('school_name', n); }
  if (b.brand !== undefined && b.brand && !/^#[0-9a-fA-F]{6}$/.test(b.brand)) bad("Rang #RRGGBB formatida bo'lsin");
  if (b.logo && (String(b.logo).length > 300000 || !/^data:image\/(png|jpeg|webp);base64,/.test(b.logo))) bad("Logo PNG/JPG/WEBP va 300 KB dan kichik bo'lsin");
  if (b.public_leaders !== undefined) await set('public_leaders', b.public_leaders ? '1' : '0');
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
  if (await one('SELECT 1 x FROM users WHERE login=?', [b.login])) bad('Bu login band', 409);
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
r('GET', '/classes', async ({ u }) => q(u.role === 'teacher'
  ? 'SELECT DISTINCT c.*,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom FROM classes c LEFT JOIN assignments a ON a.class_id=c.id WHERE c.homeroom_id=? OR a.teacher_id=? ORDER BY c.name'
  : 'SELECT c.*,(SELECT name FROM users WHERE id=c.homeroom_id) homeroom FROM classes c ORDER BY c.name', u.role === 'teacher' ? [u.id, u.id] : []));
r('POST', '/classes', async ({ u, b }) => {
  need(u, 'admin'); if (!b.name || !b.year) bad('Sinf nomi va o\'quv yili kerak');
  try { const x = await run('INSERT INTO classes(name,year,homeroom_id) VALUES(?,?,?)', [b.name.trim(), b.year.trim(), b.homeroom_id || null]); await audit(u, 'create', 'class', x.lastInsertRowid, null, b); return { id: Number(x.lastInsertRowid) }; }
  catch { bad('Bu sinf shu yilda mavjud', 409); }
});
r('GET', '/assignments', async ({ u }) => { const rows = await q('SELECT a.*,s.name subject,u.name teacher,c.name class FROM assignments a JOIN subjects s ON s.id=subject_id JOIN users u ON u.id=teacher_id JOIN classes c ON c.id=class_id'); return u.role === 'teacher' ? rows.filter(x => x.teacher_id === u.id) : rows; });
r('POST', '/assignments', async ({ u, b }) => { need(u, 'admin'); await run('INSERT INTO assignments(class_id,subject_id,teacher_id) VALUES(?,?,?) ON CONFLICT(class_id,subject_id) DO UPDATE SET teacher_id=excluded.teacher_id', [b.class_id, b.subject_id, b.teacher_id]); await audit(u, 'assign', 'assignment', `${b.class_id}-${b.subject_id}`, null, b); return { ok: 1 }; });

r('GET', '/students', async ({ u, qs }) => { const c = +qs.class_id; if (!c) bad('class_id kerak'); if (!(await canView(u, c))) bad('Ruxsat yo\'q', 403); return q('SELECT * FROM students WHERE class_id=? ORDER BY status,name', [c]); });
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
  return q(`SELECT t.*,c.name class,s.name subject,u.name teacher FROM timetable t JOIN classes c ON c.id=class_id JOIN subjects s ON s.id=subject_id JOIN users u ON u.id=teacher_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY weekday,start`, a);
});
const ttSave = async (u, b, id) => {
  need(u, 'admin'); hhmm(b.start); hhmm(b.end); if (b.start >= b.end) bad('Tugash vaqti boshlanishdan keyin bo\'lishi kerak');
  await conflict(b, id || 0);
  if (id) { await run('UPDATE timetable SET class_id=?,subject_id=?,teacher_id=?,weekday=?,start=?,end=?,room=? WHERE id=?', [b.class_id, b.subject_id, b.teacher_id, b.weekday, b.start, b.end, b.room || null, id]); return { id }; }
  const x = await run('INSERT INTO timetable(class_id,subject_id,teacher_id,weekday,start,end,room) VALUES(?,?,?,?,?,?,?)', [b.class_id, b.subject_id, b.teacher_id, b.weekday, b.start, b.end, b.room || null]); return { id: Number(x.lastInsertRowid) };
};
r('POST', '/timetable', async ({ u, b }) => ttSave(u, b));
r('PUT', '/timetable/(\\d+)', async ({ u, b, m }) => ttSave(u, b, +m[1]));
r('DELETE', '/timetable/(\\d+)', async ({ u, m }) => { need(u, 'admin'); await run('DELETE FROM timetable WHERE id=?', [+m[1]]); return { ok: 1 }; });

r('GET', '/journal', async ({ u, qs }) => {
  const c = +qs.class_id, s = +qs.subject_id; if (!c || !s) bad('class_id va subject_id kerak');
  if (!(await canView(u, c, s))) bad('Ruxsat yo\'q', 403);
  const p = [c, s];
  return {
    can_edit: await teaches(u, c, s),
    students: await q("SELECT id,name,code FROM students WHERE class_id=? AND status='faol' ORDER BY name", [c]),
    grades: await q('SELECT student_id,date,type,value,max,comment FROM grades WHERE class_id=? AND subject_id=?', p),
    attendance: await q('SELECT student_id,date,slot,status,note FROM attendance WHERE class_id=? AND subject_id=?', p),
    lessons: await q('SELECT date,topic,homework,note FROM lessons WHERE class_id=? AND subject_id=? ORDER BY date DESC LIMIT 30', p)
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
  await audit(u, old ? 'update' : 'create', 'grade', `${sid}-${s}-${date}-${type}`, old && { value: old.value, max: old.max }, { value: v, max }); return { ok: 1 };
});
r('PUT', '/attendance', async ({ u, b }) => {
  const { student_id: sid, class_id: c, subject_id: sj, date } = b; dateOk(date);
  const slot = b.slot === undefined || b.slot === null || b.slot === '' ? 0 : +b.slot; if (!Number.isInteger(slot) || slot < 0 || slot > 15) bad("Dars raqami 0–15 bo'lsin");
  if (!(await teaches(u, c, sj))) bad('Ruxsatingiz yo\'q', 403); await needStudent(sid, c);
  const old = await one('SELECT * FROM attendance WHERE student_id=? AND subject_id=? AND date=? AND slot=?', [sid, sj, date, slot]);
  if (!b.status) { if (old) { await run('DELETE FROM attendance WHERE id=?', [old.id]); await audit(u, 'delete', 'attendance', old.id, old, null); } return { ok: 1 }; }
  if (!ST.includes(b.status)) bad('Noto\'g\'ri holat');
  await run('INSERT INTO attendance(student_id,class_id,subject_id,date,slot,status,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,date,slot) DO UPDATE SET status=excluded.status,note=excluded.note', [sid, c, sj, date, slot, b.status, b.note || null]);
  await audit(u, old ? 'update' : 'create', 'attendance', `${sid}-${sj}-${date}-${slot}`, old && { status: old.status, note: old.note }, { status: b.status, note: b.note || null }); return { ok: 1 };
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
  const tt = await q(`SELECT t.class_id,t.subject_id,t.teacher_id,t.weekday,c.name class,s.name subject,us.name teacher FROM timetable t JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id JOIN users us ON us.id=t.teacher_id${tid ? ' WHERE t.teacher_id=?' : ''}`, tid ? [tid] : []);
  const done = new Set((await q("SELECT class_id,subject_id,date FROM lessons WHERE date BETWEEN ? AND ? AND trim(coalesce(topic,''))!=''", [qs.from, qs.to])).map(x => `${x.class_id}|${x.subject_id}|${x.date}`));
  const planned = new Set(), by = {}; const end = Date.parse(qs.to + 'T12:00:00Z');
  for (let t = Date.parse(qs.from + 'T12:00:00Z'); t <= end; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10), w = new Date(t).getUTCDay() || 7;
    for (const x of tt) if (x.weekday === w) {
      const k = `${x.class_id}|${x.subject_id}|${d}|${x.teacher_id}`; if (planned.has(k)) continue; planned.add(k);
      const g = by[x.teacher_id] ??= { teacher_id: x.teacher_id, teacher: x.teacher, planned: 0, filled: 0 };
      g.planned++; if (done.has(`${x.class_id}|${x.subject_id}|${d}`)) g.filled++;
    }
  }
  return { from: qs.from, to: qs.to, rows: Object.values(by).map(g => ({ ...g, percent: g.planned ? Math.round(g.filled * 100 / g.planned) : null })).sort((a, b) => a.teacher.localeCompare(b.teacher)) };
});
r('GET', '/dashboard', async ({ u }) => {
  const today = tashkentToday(), wd = new Date(today + 'T12:00:00Z').getUTCDay() || 7, tch = u.role === 'teacher';
  const cl = tch ? await q('SELECT id FROM classes WHERE homeroom_id=? UNION SELECT class_id FROM assignments WHERE teacher_id=?', [u.id, u.id]) : await q('SELECT id FROM classes');
  const ids = cl.map(x => x.id), ph = ids.map(() => '?').join(',') || 'NULL';
  const subs = tch ? (await q('SELECT class_id,subject_id FROM assignments WHERE teacher_id=?', [u.id])) : null;
  const att = await q(`SELECT a.status,COUNT(*) n FROM attendance a WHERE a.date=?${tch ? ` AND a.subject_id IN(SELECT subject_id FROM assignments WHERE class_id=a.class_id AND teacher_id=${+u.id})` : ''} GROUP BY a.status`, [today]);
  return {
    date: today, weekday: wd, role: u.role,
    classes: ids.length, students: (await one(`SELECT COUNT(*) n FROM students WHERE status='faol' AND class_id IN(${ph})`, ids)).n,
    lessons_today: await q(`SELECT t.start,t.end,t.room,c.name class,s.name subject,us.name teacher,t.class_id,t.subject_id FROM timetable t JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id JOIN users us ON us.id=t.teacher_id WHERE t.weekday=?${tch ? ' AND t.teacher_id=?' : ''} ORDER BY t.start`, tch ? [wd, u.id] : [wd]),
    attendance_today: Object.fromEntries(['keldi', 'kelmadi', 'kechikdi', 'uzrli'].map(k => [k, (att.find(x => x.status === k) || { n: 0 }).n])),
    recent_grades: await q(`SELECT g.date,g.type,g.value,g.max,st.name student,c.name class,s.name subject FROM grades g JOIN students st ON st.id=g.student_id JOIN classes c ON c.id=g.class_id JOIN subjects s ON s.id=g.subject_id${tch ? ' WHERE g.teacher_id=?' : ''} ORDER BY g.id DESC LIMIT 8`, tch ? [u.id] : []),
    scope: tch ? 'faqat o\'zingizga tegishli' : 'butun maktab'
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

const BK = ['settings', 'users', 'subjects', 'teacher_subjects', 'classes', 'assignments', 'students', 'timetable', 'lessons', 'grades', 'attendance', 'academic_years', 'terms', 'bell_slots', 'grade_types', 'audit_logs'];
r('GET', '/backup', async ({ u }) => {
  need(u, 'admin'); const out = { version: 2, exported_at: now() };
  for (const t of BK) out[t] = await q(`SELECT * FROM ${t}`);
  out.users.forEach(x => delete x.pass); return out;
});
// Tiklash: yagona tranzaksiya (xato bo'lsa hech narsa o'zgarmaydi). Foydalanuvchilar o'chirilmaydi:
// zaxirada bor, lekin bazada yo'q xodimlar faolsiz va parolsiz tiklanadi (admin yangi parol beradi).
r('POST', '/restore', async ({ u, b }) => {
  need(u, 'admin'); if (b.confirm !== 'TIKLASH') bad('Tasdiqlash uchun confirm:"TIKLASH" yuboring');
  const d = b.data; if (!d || typeof d !== 'object' || !Array.isArray(d.classes) || !Array.isArray(d.students) || d.version !== 2 || !d.exported_at || !Array.isArray(d.users)) bad("Zaxira fayli noto'g'ri yoki bu tizimning zaxirasi emas");
  const cols = {}; for (const t of BK) cols[t] = (await q(`PRAGMA table_info(${t})`)).map(c => c.name);
  const ins = (t, row) => { const ks = Object.keys(row).filter(k => cols[t].includes(k)); return { sql: `INSERT INTO ${t}(${ks.join(',')}) VALUES(${ks.map(() => '?').join(',')})`, args: ks.map(k => row[k] ?? null) }; };
  const wipe = ['attendance', 'grades', 'lessons', 'timetable', 'students', 'assignments', 'teacher_subjects', 'classes', 'subjects', 'terms', 'academic_years', 'bell_slots', 'grade_types'];
  const fill = ['subjects', 'classes', 'students', 'assignments', 'teacher_subjects', 'timetable', 'lessons', 'grades', 'attendance', 'academic_years', 'terms', 'bell_slots', 'grade_types'];
  const have = new Set((await q('SELECT id FROM users')).map(x => x.id)), st = [];
  for (const x of d.users || []) if (!have.has(x.id)) st.push({ sql: 'INSERT INTO users(id,login,name,pass,role,is_active,created_at) VALUES(?,?,?,?,?,0,?)', args: [x.id, x.login, x.name, 'x:x', x.role, x.created_at || null] });
  for (const t of wipe) st.push({ sql: `DELETE FROM ${t}`, args: [] });
  for (const t of fill) for (const row of d[t] || []) st.push(ins(t, row));
  await db.batch(st, 'write');
  await audit(u, 'restore', 'backup', '-', null, { exported_at: d.exported_at, classes: d.classes.length, students: d.students.length });
  return { ok: 1, restored: Object.fromEntries(fill.map(t => [t, (d[t] || []).length])) };
});

// ===== Login urinishlarini cheklash (jarayon xotirasida; bir nechta nusxa bo'lsa har biri alohida hisoblaydi) =====
const FAILS = new Map(), MAXF = 8, WIN = 10 * 60e3;
const failKey = (ip, login) => ip + '|' + String(login || '').toLowerCase().slice(0, 40);
const locked = k => { const f = FAILS.get(k); if (!f) return false; if (Date.now() - f.t > WIN) { FAILS.delete(k); return false; } return f.n >= MAXF; };
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
    stats: { classes: (await one('SELECT COUNT(*) n FROM classes')).n, students: (await one("SELECT COUNT(*) n FROM students WHERE status='faol'")).n, teachers: (await one("SELECT COUNT(*) n FROM users WHERE role='teacher' AND is_active=1")).n },
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
    let u = null; const open = path === '/login' || path === '/public' || path === '/public/home' || path === '/logout';
    if (!open) {
      const ck = /(?:^|;\s*)sid=([^;]+)/.exec(ev.headers?.cookie || ''); const d = unsign(ck && ck[1]);
      u = d && await one('SELECT id,name,role FROM users WHERE id=? AND is_active=1', [d.id]); if (!u) bad('Kirish talab qilinadi', 401);
    }
    const b = ev.body ? JSON.parse(ev.body) : {};
    const ip = String(ev.headers?.['x-forwarded-for'] || ev.headers?.['x-nf-client-connection-ip'] || '-').split(',')[0].trim();
    const res = await hit[2]({ u, b, ip, qs: ev.queryStringParameters || {}, m: hit[1].exec(path) });
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
