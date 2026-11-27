// Railway uchun doimiy server: statik fayllar + /api (Netlify funksiyasi bilan bir xil kod)
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { handler } = require('./netlify/functions/api');
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const SEC = {
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=15552000',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) console.warn("OGOHLANTIRISH: SESSION_SECRET kamida 32 belgi bo'lishi shart. Aks holda kirish ishlamaydi.");
if (!process.env.ADMIN_PASSWORD) console.warn('OGOHLANTIRISH: ADMIN_PASSWORD o\'rnatilmagan.');
if (!process.env.TURSO_DATABASE_URL && !process.env.RAILWAY_VOLUME_MOUNT_PATH) console.warn("OGOHLANTIRISH: TURSO_DATABASE_URL yoki Railway Volume yo'q: ma'lumotlar vaqtinchalik papkada saqlanadi va har deploydan keyin YO'QOLADI.");

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; let size = 0, dead = false; const LIM = url.pathname === '/api/restore' ? 5e7 : 2e6; // zaxirani tiklash katta bo'lishi mumkin
    req.on('error', () => { dead = true; });
    req.on('data', c => { size += c.length; if (size > LIM) { dead = true; res.writeHead(413, { 'content-type': 'application/json' }); res.end('{"error":"So\'rov juda katta"}'); req.destroy(); } else chunks.push(c); });
    req.on('end', async () => {
      if (dead) return;
      try {
        const r = await handler({ httpMethod: req.method, path: url.pathname, headers: req.headers,
          body: chunks.length ? Buffer.concat(chunks).toString() : null, queryStringParameters: Object.fromEntries(url.searchParams) });
        res.writeHead(r.statusCode, { ...r.headers, ...SEC }); res.end(r.body);
      } catch (e) { console.error(e); if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"Server xatosi"}'); }
    });
    return;
  }
  let p; try { p = decodeURIComponent(url.pathname); } catch { p = '/'; }
  let f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
  if (!f.startsWith(PUB + path.sep) && f !== PUB) f = path.join(PUB, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  const ext = path.extname(f), h = { 'content-type': MIME[ext] || 'application/octet-stream', ...SEC, 'cache-control': ext === '.html' || path.basename(f) === 'sw.js' ? 'no-cache' : 'public, max-age=86400' };
  if ((ext === '.html' || ext === '.js' || ext === '.css') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { ...h, 'content-encoding': 'gzip', vary: 'accept-encoding' }); fs.createReadStream(f).pipe(zlib.createGzip()).pipe(res);
  } else { res.writeHead(200, h); fs.createReadStream(f).pipe(res); }
});
process.on('unhandledRejection', e => console.error('unhandledRejection', e));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Server ishga tushdi: ' + (process.env.PORT || 3000)));
