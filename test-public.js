// Ochiq bosh sahifa, hafta/oy o'quvchisi va login cheklovi testlari
process.env.SESSION_SECRET = 'test-secret-test-secret'; process.env.ADMIN_PASSWORD = 'Admin12345';
const { handler } = require('./netlify/functions/api'); const assert = require('assert');
const call = async (ck, m, p, b, qs, ip) => { const r = await handler({ httpMethod: m, path: '/api' + p, headers: { cookie: ck || '', 'x-forwarded-for': ip || '1.1.1.1' }, body: b ? JSON.stringify(b) : null, queryStringParameters: qs });
  return { s: r.statusCode, j: JSON.parse(r.body), ck: (r.headers['set-cookie'] || '').split(';')[0] }; };
const ok = (n, c) => { assert(c, n); console.log('OK  ', n); };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
(async () => {
  const A = (await call('', 'POST', '/login', { login: 'admin', password: 'Admin12345' })).ck;
  const mk = async (login, role) => (await call(A, 'POST', '/users', { login, first_name: login, last_name: 'Ustoz', password: 'Teacher123', role })).j.id;
  const t1 = await mk('tchone', 'teacher'), t2 = await mk('tchtwo', 'teacher');
  const T1 = (await call('', 'POST', '/login', { login: 'tchone', password: 'Teacher123' })).ck;
  await call(A, 'POST', '/subjects', { name: 'Fizika' }); const sub = (await call(A, 'GET', '/subjects')).j[0].id;
  const c7 = (await call(A, 'POST', '/classes', { name: '7-A', year: '2026-2027', homeroom_id: t1 })).j.id;
  const c8 = (await call(A, 'POST', '/classes', { name: '8-A', year: '2026-2027', homeroom_id: t2 })).j.id;
  await call(A, 'POST', '/students', { class_id: c7, rows: [{ name: 'Valiyev Ali Karimovich', code: 'P1' }, { name: 'Aliyev Vali Sodiqovich', code: 'P2' }] });
  await call(A, 'POST', '/students', { class_id: c8, rows: [{ name: 'Qosimov Hasan Akramovich', code: 'P3' }] });
  const s7 = (await call(A, 'GET', '/students', null, { class_id: c7 })).j, s8 = (await call(A, 'GET', '/students', null, { class_id: c8 })).j;
  const id = n => s7.concat(s8).find(x => x.name.startsWith(n)).id;
  const grade = (st, cl, v, type) => call(A, 'PUT', '/grades', { student_id: st, class_id: cl, subject_id: sub, date: today, type: type || 'joriy', value: v, max: 5 });
  await grade(id('Valiyev'), c7, 5); await grade(id('Valiyev'), c7, 5, 'nazorat');
  await grade(id('Aliyev'), c7, 4); await grade(id('Aliyev'), c7, 4, 'nazorat');
  await grade(id('Qosimov'), c8, 3); await grade(id('Qosimov'), c8, 3, 'nazorat');

  // ochiq sahifa: login kerak emas
  let h = await call('', 'GET', '/public/home');
  ok('ochiq sahifa loginsiz ishlaydi', h.s === 200 && h.j.stats.students === 3 && h.j.stats.classes === 2 && h.j.stats.teachers === 2);
  ok('standart: reyting o\'chiq, o\'quvchi ismi chiqmaydi', h.j.leaders === null && !JSON.stringify(h.j).includes('Valiyev'));
  ok('boshqa API loginsiz yopiq', (await call('', 'GET', '/students', null, { class_id: c7 })).s === 401 && (await call('', 'GET', '/leaders')).s === 401);

  // admin yoqadi
  ok('o\'qituvchi sozlamani o\'zgartira olmaydi', (await call(T1, 'PUT', '/settings', { public_leaders: true })).s === 403);
  ok('admin yoqdi', (await call(A, 'PUT', '/settings', { public_leaders: true })).s === 200);
  h = await call('', 'GET', '/public/home');
  const w = h.j.leaders.week;
  ok('hafta o\'quvchisi: eng yuqori o\'rtacha foiz', w.items[0].percent === 100 && w.items[0].name === 'Valiyev A.' && w.items[0].class === '7-A');
  ok('tartib: 100%, 80%, 60%', w.items.map(x => x.percent).join() === '100,80,60');
  ok('ochiq sahifada to\'liq ism va kod yo\'q', !/Karimovich|Sodiqovich|Akramovich|P1/.test(JSON.stringify(h.j)));
  ok('oy o\'quvchisi: kamida 4 baho shart — 2 ta bahosi borlar kirmaydi (oldingi oyga o\'tadi, u ham bo\'sh)', h.j.leaders.month.items.length === 0 && h.j.leaders.month.label === "O'tgan oy");
  ok('/public yangi bayroqni qaytaradi', (await call('', 'GET', '/public')).j.leaders_public === true);

  // xodimlar uchun /leaders: o'qituvchi faqat o'z sinfi
  const l1 = (await call(T1, 'GET', '/leaders')).j;
  ok('o\'qituvchi faqat o\'z sinfini ko\'radi', l1.week.items.every(x => x.class === '7-A') && l1.week.items.length === 2 && l1.scope.includes('o\'z sinflaringiz'));
  ok('xodim uchun to\'liq ism', l1.week.items[0].name === 'Valiyev Ali Karimovich');
  const la = (await call(A, 'GET', '/leaders')).j;
  ok('admin butun maktabni ko\'radi', la.week.items.length === 3 && la.scope === 'butun maktab');

  // arxivlangan o'quvchi reytingga kirmaydi
  await call(A, 'PATCH', '/students/' + id('Valiyev'), { status: 'arxiv' });
  ok('arxivlangan o\'quvchi reytingda yo\'q', !(await call(A, 'GET', '/leaders')).j.week.items.some(x => x.name.startsWith('Valiyev')));

  // login cheklovi
  let last; for (let i = 0; i < 8; i++) last = await call('', 'POST', '/login', { login: 'admin', password: 'noto\'g\'ri' }, null, '9.9.9.9');
  ok('8 ta xatodan keyin 429', (await call('', 'POST', '/login', { login: 'admin', password: 'Admin12345' }, null, '9.9.9.9')).s === 429);
  ok('boshqa IP ta\'sirlanmaydi', (await call('', 'POST', '/login', { login: 'admin', password: 'Admin12345' }, null, '8.8.8.8')).s === 200);
  console.log('\nOCHIQ SAHIFA TESTLARI O\'TDI');
})().catch(e => { console.error('XATO:', e.message); process.exit(1); });
