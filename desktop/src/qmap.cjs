/* Протокол qmap:// для вікна мапи (specs/014, contracts/qmap-protocol.md). Вікно відкрите з file://, а сайт не віддає CORS —
   тож шматки мапи (/map/v/*.bin), назви (names.bin) і export.json вікно само не завантажило б. Головний процес бере файли
   /map/… з сайту й кладе на диск: той самий ?v= (версія мапи, MAP_V) — з диска без мережі; без мережі — що є на диску */
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.webp': 'image/webp', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const SAFE = /^[A-Za-z0-9_./-]+$/;

/* site — https://q-hub.fun; dir — тека кешу; fetch — підміняється в тестах */
function createQmap({ site, dir, fetch: get = fetch }) {
  const indexFile = path.join(dir, 'index.json');
  let index = null;
  const idx = () => { if (!index) { try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { index = {}; } } return index; };
  const saveIdx = () => { try { fs.writeFileSync(indexFile, JSON.stringify(idx())); } catch { /* кеш не обов'язковий */ } };
  const reply = (body, rel, status = 200) => new Response(body, { status, headers: { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });

  /* qmap://site/map/5/15/20.webp?v=2026-10-22c → Response */
  async function handle(request) {
    const u = new URL(request.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''), v = u.searchParams.get('v') || '';
    if (!rel.startsWith('map/') || !SAFE.test(rel) || rel.split('/').includes('..')) return new Response(null, { status: 400 });
    const file = path.join(dir, ...rel.split('/'));
    const have = fs.existsSync(file), rec = idx()[rel];
    if (have && rec && rec.v === v) return reply(fs.readFileSync(file), rel);
    try {
      const r = await get(`${site}/${rel}${v ? '?v=' + encodeURIComponent(v) : ''}`);
      if (r.status === 404) return new Response(null, { status: 404 });
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      /* SPA сайту на невідомий шлях віддає index.html з кодом 200 — це не файл мапи */
      if ((r.headers.get('content-type') || '').startsWith('text/html')) return new Response(null, { status: 404 });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      idx()[rel] = { v, lm: r.headers.get('last-modified') || '' }; saveIdx();
      return reply(buf, rel);
    } catch {
      return have ? reply(fs.readFileSync(file), rel) : new Response(null, { status: 404 });
    }
  }
  return { handle };
}

module.exports = { createQmap };
