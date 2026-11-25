import { loadConfig } from '../config';
import { createPool } from './pool';
import { createClass, listClasses } from '../services/classes';
import { bulkCreateStudents } from '../services/students';

/**
 * LOKAL ISHLAB CHIQISH uchun namuna ma'lumotlar. Productionda ishlamaydi.
 * Chiqarilgan ID lar faqat shu bazada amal qiladi.
 */
async function main() {
  const cfg = loadConfig();
  if (cfg.isProd) throw new Error('Seed productionda ishlamaydi');
  const pool = createPool(cfg.databaseUrl, 2);
  try {
    const existing = await listClasses(pool, true);
    let cls = existing.find((c) => c.codeLabel === '8A');
    if (!cls) cls = await createClass(pool, { type: 'system' }, '8-A');
    const res = await bulkCreateStudents(pool, cfg, { type: 'system' }, {
      classId: cls.id,
      dryRun: false,
      students: [
        { lastName: 'Karimov', firstName: 'Aziz' },
        { lastName: 'Ergasheva', firstName: 'Nilufar' },
        { lastName: 'Toshmatov', firstName: 'Sardor' },
      ],
    });
    if (!res.dryRun) {
      console.log(`Sinf: ${cls.name}`);
      for (const s of res.created) console.log(`  ${s.lastName} ${s.firstName}  ->  ${s.code}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
