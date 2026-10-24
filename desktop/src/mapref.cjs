/* Еталон мапи для F9 (mapmatch.cjs): ті самі export.bin / export.json, що віддає сайт для «Карти для гри».
   Завантажується один раз і лежить у %APPDATA%\Q-Hub\map; при наступних запусках сайт відповідає «не змінилось» (ETag),
   без інтернету — береться збережений. */
const fs = require('node:fs');
const path = require('node:path');

async function get(url, file, etagFile) {
  let etag = ''; try { etag = fs.readFileSync(etagFile, 'utf8'); } catch { /* ще немає */ }
  const have = fs.existsSync(file);
  try {
    const r = await fetch(url, { headers: have && etag ? { 'If-None-Match': etag } : {} });
    if (r.status === 304 && have) return fs.readFileSync(file);
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(file, buf);
    const e = r.headers.get('etag'); if (e) fs.writeFileSync(etagFile, e);
    return buf;
  } catch (e) {
    if (have) return fs.readFileSync(file);
    throw e;
  }
}

/* site — https://q-hub.fun; dir — тека кешу. → { bin: Buffer, meta: object } або виняток (немає ні мережі, ні кешу) */
async function loadMapRef(site, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const [bin, json] = await Promise.all([
    get(site + '/map/game/export.bin', path.join(dir, 'export.bin'), path.join(dir, 'export.bin.etag')),
    get(site + '/map/game/export.json', path.join(dir, 'export.json'), path.join(dir, 'export.json.etag')),
  ]);
  return { bin, meta: JSON.parse(json.toString('utf8')) };
}

module.exports = { loadMapRef };
