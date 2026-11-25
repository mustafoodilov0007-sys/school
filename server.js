// Railway uchun doimiy server: statik fayllar + /api (Netlify funksiyasi bilan bir xil kod)
const http = require('http'), fs = require('fs'), path = require('path');
const { handler } = require('./netlify/functions/api');
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; let size = 0; const LIM = url.pathname === '/api/restore' ? 5e7 : 2e6; // zaxirani tiklash katta bo'lishi mumkin
    req.on('data', c => { size += c.length; if (size > LIM) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      const r = await handler({ httpMethod: req.method, path: url.pathname, headers: req.headers,
        body: chunks.length ? Buffer.concat(chunks).toString() : null, queryStringParameters: Object.fromEntries(url.searchParams) });
      res.writeHead(r.statusCode, r.headers); res.end(r.body);
    });
    return;
  }
  let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Server ishga tushdi: ' + (process.env.PORT || 3000)));
