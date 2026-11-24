#!/usr/bin/env node
// Zaxira nusxa: pg_dump -> sana bilan fayl + sha256, natija `backups` jadvaliga yoziladi (admin panelda ko'rinadi).
//   DATABASE_URL=... node scripts/backup.mjs [papka=./backups] [saqlash_soni=14]
// Talab: pg_dump va psql (postgresql-client) o'rnatilgan bo'lishi kerak. Fayl serverda QOLMASLIGI uchun uni alohida joyga ko'chiring (docs/BACKUP.md).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL kerak'); process.exit(1); }
const dir = process.argv[2] ?? './backups';
const keep = Math.max(1, Number(process.argv[3] ?? 14));
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sql = (q) => spawnSync('psql', [url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' });

mkdirSync(dir, { recursive: true });
const name = `pep-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
const file = join(dir, name);
const start = sql(`INSERT INTO backups (status, file_name) VALUES ('running', ${lit(name)}) RETURNING id`);
const id = start.status === 0 ? start.stdout.trim().split('\n')[0] : null;
if (!id) console.warn('Ogohlantirish: backups jadvaliga yozib bo\'lmadi:', (start.stderr || '').trim().slice(0, 200));

const fail = (msg) => {
  console.error('Zaxira xatosi:', msg);
  if (id) sql(`UPDATE backups SET status = 'failed', finished_at = now(), error = ${lit(String(msg).slice(0, 500))} WHERE id = ${lit(id)}`);
  process.exit(1);
};

const r = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', file, url], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
if (r.error) fail(`pg_dump ishlamadi: ${r.error.message} (postgresql-client o'rnatilganmi?)`);
if (r.status !== 0) fail(`pg_dump kod ${r.status}: ${(r.stderr || '').trim().slice(0, 300)}`);
const size = statSync(file).size;
if (size < 1024) fail(`Fayl shubhali darajada kichik (${size} bayt)`);
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
writeFileSync(`${file}.sha256`, `${sha}  ${name}\n`);
if (id) sql(`UPDATE backups SET status = 'ok', finished_at = now(), size_bytes = ${size}, sha256 = ${lit(sha)} WHERE id = ${lit(id)}`);
console.log(`OK ${name} (${size} bayt) sha256=${sha.slice(0, 16)}…`);

const old = readdirSync(dir).filter((f) => f.endsWith('.dump')).sort().slice(0, -keep);
for (const f of old) { unlinkSync(join(dir, f)); try { unlinkSync(join(dir, `${f}.sha256`)); } catch { /* yo'q bo'lsa e'tibor bermaymiz */ } }
if (old.length) console.log(`${old.length} ta eski nusxa o'chirildi`);
