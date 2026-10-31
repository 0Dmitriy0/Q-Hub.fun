/* Картинки фірмового інсталятора (specs/008): малює їх Electron з логотипа сайту й тих самих шрифтів,
   зберігає у формати, які розуміє NSIS: 24-бітні BMP без прозорості й ICO.
   Запуск (з desktop/): npx.cmd electron scripts/installer-art.cjs → build/installer-*.bmp, build/icon.ico.
   Перемальовувати лише коли змінився логотип чи кольори — результат лежить у git. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const MARK = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'brand', 'q-hub-mark.svg'), 'utf8');
const BG = '#10141a';
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=Manrope:wght@600;700&display=swap">';
const page = (w, h, body, bg = BG) => `<!doctype html><meta charset="utf-8">${FONTS}<style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};}
  .brand{font-family:Archivo,'Arial Black',sans-serif;font-weight:800;font-stretch:125%;color:#f4f7fb;letter-spacing:-.01em}
  .sub{font-family:Manrope,system-ui,sans-serif;font-weight:600;color:#8b9bb0}
  svg{display:block}
</style><body>${body}</body>`;

const ART = {
  /* бічна смуга вітання й «Готово» (MUI: 164×314) */
  'installer-sidebar.bmp': [164, 314, page(164, 314, `
    <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 100% 0%,rgba(255,107,0,.28),transparent 60%),radial-gradient(90% 50% at 0% 100%,rgba(14,165,233,.10),transparent 60%)"></div>
    <div style="position:absolute;left:22px;top:40px;width:64px;height:64px">${MARK.replace('<svg ', '<svg width="64" height="64" ')}</div>
    <div class="brand" style="position:absolute;left:22px;top:118px;font-size:30px">Q-Hub</div>
    <div class="sub" style="position:absolute;left:22px;top:160px;width:124px;font-size:12px;line-height:1.45">Програма для гравців QuantRP</div>
    <div style="position:absolute;left:22px;bottom:26px;width:32px;height:3px;border-radius:2px;background:#ff6b00"></div>`)],
  /* права частина шапки на інших сторінках (MUI: 150×57) */
  'installer-header.bmp': [150, 57, page(150, 57, `
    <div style="position:absolute;right:14px;top:12px;display:flex;align-items:center;gap:8px">
      ${MARK.replace('<svg ', '<svg width="30" height="30" ')}<span class="brand" style="font-size:19px">Q-Hub</span></div>`)],
  /* знак на екрані «Старт» (nsDialogs) */
  'installer-logo.bmp': [72, 72, page(72, 72, `<div style="padding:4px">${MARK.replace('<svg ', '<svg width="64" height="64" ')}</div>`)],
};
/* іконка: знак на прозорому тлі; до 128 px — класичний DIB (його читають і NSIS, і старі частини Windows), 256 — PNG */
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const iconPage = s => page(s, s, MARK.replace('<svg ', `<svg width="${s}" height="${s}" `), 'transparent');

async function shot(w, h, html, transparent = false) {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, transparent, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => 1)');
  await new Promise(r => setTimeout(r, 400));
  const img = (await win.webContents.capturePage()).resize({ width: w, height: h, quality: 'best' });
  win.destroy();
  return img;
}

/* 24-бітний BMP знизу вгору; toBitmap() дає BGRA */
function bmp(img) {
  const { width: w, height: h } = img.getSize(), src = img.toBitmap(), row = Math.ceil(w * 3 / 4) * 4;
  const out = Buffer.alloc(54 + row * h);
  out.write('BM'); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14); out.writeInt32LE(w, 18); out.writeInt32LE(h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * h, 34); out.writeInt32LE(2835, 38); out.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3;
    out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
  }
  return out;
}

/* 32-бітний DIB для ICO: BITMAPINFOHEADER з подвоєною висотою, BGRA знизу вгору, порожня маска AND */
function dib(img) {
  const { width: w, height: h } = img.getSize(), src = img.toBitmap(), mask = Math.ceil(w / 32) * 4 * h;
  const out = Buffer.alloc(40 + w * h * 4 + mask);
  out.writeUInt32LE(40, 0); out.writeInt32LE(w, 4); out.writeInt32LE(h * 2, 8); out.writeUInt16LE(1, 12); out.writeUInt16LE(32, 14);
  out.writeUInt32LE(w * h * 4 + mask, 20);
  for (let y = 0; y < h; y++) src.copy(out, 40 + (h - 1 - y) * w * 4, y * w * 4, (y + 1) * w * 4);
  return out;
}
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let off = head.length;
  entries.forEach(([s, data], i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(off, e + 12); off += data.length;
  });
  return Buffer.concat([head, ...entries.map(p => p[1])]);
}

/* вікна малюються по черзі: закрите останнє вікно не має завершувати Electron */
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const [name, [w, h, html]] of Object.entries(ART)) fs.writeFileSync(path.join(BUILD, name), bmp(await shot(w, h, html)));
  const pngs = [];
  for (const s of ICON_SIZES) { const im = await shot(s, s, iconPage(s), true); pngs.push([s, s >= 256 ? im.toPNG() : dib(im)]); }
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico(pngs));
  console.log('готово:', Object.keys(ART).join(', '), '+ icon.ico');
  app.quit();
});
