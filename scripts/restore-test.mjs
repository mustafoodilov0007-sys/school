#!/usr/bin/env node
// Tiklash SINOVI: eng so'nggi zaxirani vaqtinchalik bazaga tiklaydi, jadvallar/qatorlarni tekshiradi va bazani o'chiradi.
//   DATABASE_URL=... node scripts/restore-test.mjs [papka=./backups]
// Talab: DATABASE_URL egasi CREATE DATABASE huquqiga ega bo'lishi kerak (Railway'ning umumiy Postgres'ida ko'pincha yo'q —
// u holda docs/BACKUP.md dagi qo'lda sinov usulidan foydalaning). Haqiqiy bazaga TEGMAYDI.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL kerak'); process.exit(1); }
const dir = process.argv[2] ?? './backups';
const dumps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.dump')).sort() : [];
if (dumps.length === 0) { console.error('Zaxira fayli topilmadi:', dir); process.exit(1); }
const name = dumps[dumps.length - 1];
const file = join(dir, name);

const expected = existsSync(`${file}.sha256`) ? readFileSync(`${file}.sha256`, 'utf8').split(/\s+/)[0] : null;
const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
if (expected && expected !== actual) { console.error('SHA-256 mos kelmadi — fayl buzilgan!'); process.exit(1); }

const u = new URL(url);
const tmp = `pep_restore_test_${Date.now()}`;
const admin = new URL(url); admin.pathname = '/postgres';
const target = new URL(url); target.pathname = `/${tmp}`;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const psql = (conn, q) => run('psql', [conn, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q]);

let ok = false;
try {
  const c = psql(admin.toString(), `CREATE DATABASE ${tmp}`);
  if (c.status !== 0) throw new Error(`Vaqtinchalik baza yaratib bo'lmadi (CREATE DATABASE huquqi kerak): ${c.stderr.trim().slice(0, 200)}`);
  const r = run('pg_restore', ['--no-owner', '--exit-on-error', '-d', target.toString(), file]);
  if (r.status !== 0) throw new Error(`pg_restore xatosi: ${r.stderr.trim().slice(0, 300)}`);
  const t = psql(target.toString(), `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public')::int, (SELECT count(*) FROM schema_migrations)::int`);
  if (t.status !== 0) throw new Error(`Tekshiruv so'rovi xato: ${t.stderr.trim().slice(0, 200)}`);
  const [tables, migs] = t.stdout.trim().split('|').map(Number);
  if (!(tables >= 20 && migs >= 1)) throw new Error(`Tiklangan baza to'liq emas (jadvallar: ${tables}, migratsiyalar: ${migs})`);
  console.log(`OK: ${name} tiklandi — ${tables} jadval, ${migs} migratsiya.`);
  ok = true;
} catch (e) {
  console.error('Tiklash sinovi MUVAFFAQIYATSIZ:', e.message);
} finally {
  psql(admin.toString(), `DROP DATABASE IF EXISTS ${tmp}`);
}
if (ok) {
  const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
  psql(url, `UPDATE backups SET restore_tested_at = now() WHERE file_name = ${lit(name)}`);
}
process.exit(ok ? 0 : 1);
