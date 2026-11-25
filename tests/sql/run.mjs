// DB migratsiyalari va cheklovlarini tekshiradi.
// Barcha migratsiyalar + constraints.sql BIR tranzaksiyada bajariladi va ROLLBACK qilinadi (baza toza qoladi).
// Ulanish: TEST_DATABASE_URL yoki DATABASE_URL (psql kerak). psql topilmasa: `docker compose exec db psql` ishlatiladi.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migDir = join(root, 'db', 'migrations');
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

let sql = 'BEGIN;\n';
for (const f of files) sql += `\n-- >>> ${f}\n${readFileSync(join(migDir, f), 'utf8')}\n`;
sql += `\n-- >>> constraints.sql\n${readFileSync(join(root, 'tests', 'sql', 'constraints.sql'), 'utf8')}\nROLLBACK;\n`;

const url = (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '').replace(/\?schema=\w+$/, '');
const args = ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'];

let res = url
  ? spawnSync(process.env.PSQL_BIN || 'psql', [url, ...args], { input: sql, encoding: 'utf8' })
  : { error: new Error('TEST_DATABASE_URL/DATABASE_URL belgilanmagan') };

if (res.error && !url) {
  console.error(res.error.message);
  process.exit(2);
}
if (res.error && res.error.code === 'ENOENT') {
  console.error('psql topilmadi — docker compose orqali urinib ko\'ramiz…');
  const u = process.env.POSTGRES_USER || 'pep';
  const d = process.env.POSTGRES_DB || 'physics_exam';
  res = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', u, '-d', d, ...args], { input: sql, encoding: 'utf8', cwd: root });
}
if (res.error) {
  console.error(res.error.message);
  process.exit(2);
}
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');
process.exit(res.status ?? 1);
