// Світлі плитки мапи сайту (specs/019): ті самі трикутники, що й темні (public/map/v — мапа, public/map/game/names.bin — назви),
// пофарбовані за таблицею src/data/mapLight.json. Пише public/map/light/{z}/{x}/{y}.webp (z0–6, той самий набір, що й темні
// public/map/{z}) і public/map/n-light/ (назви z3–6, той самий набір, що й public/map/n — список спільний, public/map/n/index.json). Python не потрібен — малює Chromium з Electron програми.
// Запуск (після кожної перебудови мапи з Hydra): desktop/node_modules/.bin/electron scripts/map-light-tiles.cjs public/map
// Перевірка генератора на темній палітрі (має збігатися з public/map/6): ... public/map --dark <тека> [--only 6/30/40,...]
const fs = require('fs'), path = require('path');
const TS = 256, ZMAX = 6, PXM = 1.28, X0 = -5996, YT = 8470;

if (process.type === 'browser') {
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true } });
    await win.loadURL('data:text/html,<canvas></canvas>');
    try { console.log(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run(${JSON.stringify(process.argv.slice(2))})`)); }
    catch (e) { console.error(e); process.exitCode = 1; }
    app.quit();
  });
} else module.exports.run = run;

async function run(argv) {
  const map = path.resolve(argv[0] || 'public/map'), di = argv.indexOf('--dark'), oi = argv.indexOf('--only');
  const dark = di >= 0, only = oi >= 0 ? new Set(argv[oi + 1].split(',')) : null;
  const LIGHT = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/mapLight.json'), 'utf8'));
  const tone = c => dark ? c : LIGHT[c.toLowerCase()] ?? c;
  const outBase = dark ? path.resolve(argv[di + 1], 'base') : path.join(map, 'light');
  const outNames = dark ? path.resolve(argv[di + 1], 'names') : path.join(map, 'n-light');

  /* набір плиток — як у темних: z -> "x/y" */
  const have = {};
  for (let z = 0; z <= ZMAX; z++) {
    have[z] = new Set();
    const dz = path.join(map, String(z)); if (!fs.existsSync(dz)) continue;
    for (const x of fs.readdirSync(dz)) for (const f of fs.readdirSync(path.join(dz, x))) have[z].add(`${x}/${f.replace('.webp', '')}`);
  }
  const want = (z, k) => have[z].has(k) && (!only || [...only].some(o => { const [oz, ox, oy] = o.split('/').map(Number); return z <= oz ? (ox >> (oz - z)) + '/' + (oy >> (oz - z)) === k : false; }));

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  /* зменшення вдвічі кроками — як LANCZOS у scripts/map-names-tiles.py, без «драбинок» */
  const shrink = (src, to) => {
    let c = src;
    while (c.width > to) {
      const w = c.width >= to * 2 ? c.width / 2 : to, n = canvas(w, w), x = n.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, w); c = n;
    }
    return c;
  };
  const save = (dir, z, k, c) => {
    const [x, y] = k.split('/'); fs.mkdirSync(path.join(dir, String(z), x), { recursive: true });
    fs.writeFileSync(path.join(dir, String(z), x, `${y}.webp`), Buffer.from(c.toDataURL('image/webp', 0.8).split(',')[1], 'base64'));
  };
  const tri = (ctx, xy, o) => {   // той самий обхід, що triPath у src/lib/mapChunk.ts
    const ax = xy[o], ay = xy[o + 1], bx = xy[o + 2], by = xy[o + 3], cx = xy[o + 4], cy = xy[o + 5];
    ctx.moveTo(ax, ay);
    if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) >= 0) { ctx.lineTo(bx, by); ctx.lineTo(cx, cy); } else { ctx.lineTo(cx, cy); ctx.lineTo(bx, by); }
    ctx.closePath();
  };
  /* z6 малюється з трикутників, z5..zmin — з чотирьох дочірніх плиток */
  const pyramid = (dir, zmin, draw, bg) => {
    let level = new Map(), n = 0;
    for (const k of new Set([...have[ZMAX]].filter(k => want(ZMAX, k)))) { const c = draw(k); level.set(k, c); save(dir, ZMAX, k, c); n++; }
    for (let z = ZMAX - 1; z >= zmin; z--) {
      const next = new Map();
      for (const k of have[z]) {
        if (!want(z, k)) continue;
        const [x, y] = k.split('/').map(Number), big = canvas(TS * 2, TS * 2), ctx = big.getContext('2d');
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, TS * 2, TS * 2); }
        for (const dx of [0, 1]) for (const dy of [0, 1]) { const c = level.get(`${2 * x + dx}/${2 * y + dy}`); if (c) ctx.drawImage(c, dx * TS, dy * TS); }
        const c = shrink(big, TS); next.set(k, c); save(dir, z, k, c); n++;
      }
      level = next;
    }
    return n;
  };

  /* мапа: шматки 800 м (scripts/map-chunks.py); тайл z6 (200 м) завжди в одному шматку */
  const ix = JSON.parse(fs.readFileSync(path.join(map, 'v/index.json'), 'utf8')), pal = ix.palette.map(tone);
  const ocean = tone('#0a0e11'), SS = 4, s = PXM / ix.q;   // пікселів z6 на одиницю (чверть метра)
  const chunk = (cx, cy) => {
    const f = path.join(map, `v/${cx}_${cy}.bin`); if (!fs.existsSync(f)) return null;
    const b = fs.readFileSync(f), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.length), n = new DataView(buf).getUint32(0, true);
    return { n, xy: new Uint16Array(buf, 4, n * 6), c: new Uint8Array(buf, 4 + n * 12, n) };
  };
  const chunks = new Map();
  const nBase = pyramid(outBase, 0, k => {
    const [x, y] = k.split('/').map(Number), cv = canvas(TS * SS, TS * SS), ctx = cv.getContext('2d');
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, cv.width, cv.height);
    const ck = `${x >> 2}_${y >> 2}`; if (!chunks.has(ck)) chunks.set(ck, chunk(x >> 2, y >> 2));
    const ch = chunks.get(ck);
    if (ch) {
      ctx.setTransform(s * SS, 0, 0, s * SS, -x * TS * SS, -y * TS * SS);
      ctx.lineWidth = 0.9 / s; ctx.lineJoin = 'round';   // як у vectorLayer: обводка тим самим кольором закриває шви
      for (let i = 0; i < ch.n;) {
        const col = ch.c[i]; ctx.beginPath();
        for (; i < ch.n && ch.c[i] === col; i++) tri(ctx, ch.xy, i * 6);
        ctx.fillStyle = ctx.strokeStyle = pal[col]; ctx.fill(); ctx.stroke();
      }
    }
    return shrink(cv, TS);
  }, ocean);

  /* назви: прозорі плитки z3–6 (як scripts/map-names-tiles.py), той самий набір, що в public/map/n/index.json */
  const nix = JSON.parse(fs.readFileSync(path.join(map, 'n/index.json'), 'utf8'));
  for (let z = 0; z <= ZMAX; z++) have[z] = new Set((nix.have[z] || []).map(i => `${Math.floor(i / nix.n)}/${i % nix.n}`));
  const meta = JSON.parse(fs.readFileSync(path.join(map, 'game/export.json'), 'utf8')), npal = meta.namesPalette.map(tone);
  const nb = fs.readFileSync(path.join(map, 'game/names.bin')), nbuf = nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.length);
  const nn = new DataView(nbuf).getUint32(0, true), U = new Uint16Array(nbuf, 4, nn * 6), C = new Uint8Array(nbuf, 4 + nn * 12, nn);
  const P = new Float32Array(nn * 6);
  for (let i = 0; i < nn * 6; i += 2) { P[i] = (U[i] / meta.q + meta.x0 - X0) * PXM; P[i + 1] = (YT - (meta.yt - U[i + 1] / meta.q)) * PXM; }
  const buckets = new Map();
  for (let i = 0; i < nn; i++) {
    const o = i * 6, x0 = Math.min(P[o], P[o + 2], P[o + 4]), x1 = Math.max(P[o], P[o + 2], P[o + 4]), y0 = Math.min(P[o + 1], P[o + 3], P[o + 5]), y1 = Math.max(P[o + 1], P[o + 3], P[o + 5]);
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor(y1 / TS); ty++) {
      const k = `${tx}/${ty}`; let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i);
    }
  }
  const NS = 3;
  const nNames = pyramid(outNames, 3, k => {
    const [x, y] = k.split('/').map(Number), cv = canvas(TS * NS, TS * NS), ctx = cv.getContext('2d');
    ctx.setTransform(NS, 0, 0, NS, -x * TS * NS, -y * TS * NS);
    for (const i of buckets.get(k) || []) { ctx.beginPath(); tri(ctx, P, i * 6); ctx.fillStyle = npal[C[i]]; ctx.fill(); }   // по одному, у порядку файлу — тінь під літерами
    return shrink(cv, TS);
  });
  return `плиток мапи: ${nBase}, назв: ${nNames} -> ${outBase}, ${outNames}`;
}
