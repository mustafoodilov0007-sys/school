// Server avto-zaxirasi: har kuni Toshkent vaqti bilan 03:00 dan keyin bitta siqilgan JSON fayl, oxirgi BACKUP_KEEP (14) tasi saqlanadi.
// Papka: BACKUP_DIR yoki Railway Volume ichida /backups. Volume bo'lmasa fayllar deploydan keyin yo'qoladi (panelda ogohlantiriladi).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
module.exports = backupData => {
  const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH, dir = process.env.BACKUP_DIR || (vol ? path.join(vol, 'backups') : path.join(__dirname, 'backups')), persistent = !!(process.env.BACKUP_DIR || vol), KEEP = +process.env.BACKUP_KEEP || 14;
  const RE = /^zaxira-\d{4}-\d{2}-\d{2}\.json\.gz$/, today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
  const files = () => { try { return fs.readdirSync(dir).filter(f => RE.test(f)).sort().reverse(); } catch { return []; } };
  async function run() {
    fs.mkdirSync(dir, { recursive: true }); const name = `zaxira-${today()}.json.gz`, gz = zlib.gzipSync(JSON.stringify(await backupData())), tmp = path.join(dir, name + '.tmp');
    fs.writeFileSync(tmp, gz); fs.renameSync(tmp, path.join(dir, name)); files().slice(KEEP).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} }); return { name, size: gz.length };
  }
  const list = async () => ({ persistent, keep: KEEP, files: files().map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size, date: f.slice(7, 17) })) });
  const read = async name => { if (!RE.test(name)) throw new Error('nom'); return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name)))); };
  const tick = () => { const h = (new Date().getUTCHours() + 5) % 24, last = files()[0]; if (h >= 3 && (!last || last.slice(7, 17) < today())) run().then(x => console.log('Avto-zaxira:', x.name), e => console.error('Avto-zaxira xatosi:', e.message)); };
  setInterval(tick, 30 * 60e3).unref(); setTimeout(tick, 60e3).unref();
  global.SCHOOL_BACKUP = { list, read, run };
};
