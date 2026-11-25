// Eski (1.0) bazadan yangilash: mavjud davomat/baholar yo'qolmasligini tekshiradi
const fs = require('fs'); const f = '/tmp/mig-test.db'; for (const x of [f, f + '-wal', f + '-shm']) fs.rmSync(x, { force: true });
process.env.TURSO_DATABASE_URL = 'file:' + f; process.env.SESSION_SECRET = 'test-secret-test-secret'; process.env.ADMIN_PASSWORD = 'Admin12345';
const crypto = require('crypto'); const salt = 'ab'.repeat(16), H = salt + ':' + crypto.scryptSync('Admin12345', salt, 32).toString('hex');
const { createClient } = require('@libsql/client'); const assert = require('assert');
(async () => {
  const old = createClient({ url: 'file:' + f });
  await old.batch([
    `CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT UNIQUE NOT NULL,name TEXT NOT NULL,pass TEXT NOT NULL,role TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT)`,
    `CREATE TABLE subjects(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL)`,
    `CREATE TABLE classes(id INTEGER PRIMARY KEY,name TEXT NOT NULL,year TEXT NOT NULL,homeroom_id INTEGER,UNIQUE(name,year))`,
    `CREATE TABLE students(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT NOT NULL,class_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'faol',parent_contact TEXT)`,
    `CREATE TABLE attendance(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),class_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('keldi','kelmadi','kechikdi','uzrli')),note TEXT,UNIQUE(student_id,subject_id,date))`,
    { sql: `INSERT INTO users(id,login,name,pass,role) VALUES(1,'admin','Eski admin',?,'admin')`, args: [H] },
    `INSERT INTO subjects VALUES(1,'Fizika')`, `INSERT INTO classes VALUES(1,'7-A','2025-2026',1)`, `INSERT INTO students(id,name,class_id) VALUES(1,'Eski Oquvchi',1)`,
    `INSERT INTO attendance(student_id,class_id,subject_id,date,status,note) VALUES(1,1,1,'2025-10-01','kelmadi','kasal'),(1,1,1,'2025-10-02','keldi',NULL)`], 'write');
  const { handler } = require('./netlify/functions/api');
  const call = async (m, p, ck) => { const r = await handler({ httpMethod: m, path: '/api' + p, headers: { cookie: ck || '' } }); return r; };
  const L = await handler({ httpMethod: 'POST', path: '/api/login', headers: {}, body: JSON.stringify({ login: 'admin', password: 'Admin12345' }) });
  assert.equal(L.statusCode, 200, 'admin yaratilmadi'); const ck = L.headers['set-cookie'].split(';')[0];
  const c = createClient({ url: 'file:' + f });
  const rows = (await c.execute('SELECT * FROM attendance ORDER BY id')).rows;
  assert.equal(rows.length, 2); assert(rows.every(r => r.slot === 0)); assert.equal(rows[0].note, 'kasal'); console.log("OK   eski davomat yozuvlari saqlandi (slot=0)");
  const B = JSON.parse((await call('GET', '/backup', ck)).body); assert.equal(B.attendance.length, 2); console.log('OK   zaxira ishlaydi');
  await handler({ httpMethod: 'GET', path: '/api/public', headers: {} }); // qayta init — migratsiya takrorlanmaydi
  assert.equal((await c.execute('SELECT COUNT(*) n FROM attendance')).rows[0].n, 2); console.log('OK   migratsiya takrorlanganda ma\'lumot o\'zgarmaydi');
  for (const t of ['academic_years', 'terms', 'bell_slots', 'grade_types']) await c.execute('SELECT 1 FROM ' + t);
  console.log("OK   yangi jadvallar yaratildi\nMIGRATSIYA O'TDI");
})().catch(e => { console.error('XATO:', e.message); process.exit(1); });
