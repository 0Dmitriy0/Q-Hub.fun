/* «Зір» програми: раз на 2 с під час гри знімає екран і
   — читає готівку й банк з HUD (hud.cjs): стабільна зміна → записи обліку з місцем і текстом гри (scene.cjs);
   — поки висить значок зміни, читає підтвердження гри внизу й сповіщення зліва («299$ сплачено готівкою!»);
   — поки HUD закритий меню, визначає місце (магазин, скупник, банкомат…), а вікно скупника ще й розбирає на ціни
     тим самим кодом, що сайт (lib/shotparse.cjs ← src/lib/shotParse.ts).
   OCR — tesseract.js у робочих потоках головного процесу; мовні дані — у src/ocr (scripts/ocr.mjs). */
const path = require('node:path');
const fs = require('node:fs');
const { createWorker } = require('tesseract.js');
const hud = require('./hud.cjs');
const scenes = require('./scene.cjs');
const shot = require('./lib/shotparse.cjs');
const { pricePicker, parseChange, changePicker, changeRegion, headerBuyer } = require('./pricescan.cjs');

/* в інсталяторі мовні дані лежать поруч з архівом (asarUnpack у package.json): робочі потоки OCR читають з диска */
const OCR = path.join(__dirname, 'ocr').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const SCENE_EVERY = 4e3;        // як часто читати меню, поки HUD закритий
const SCENE_TTL = 120e3;        // скільки після меню зміна грошей ще належить йому
const TOAST_TTL = 20e3;         // скільки після значка зміни пам'ятати текст підтвердження

/* лишити лише білий текст (назви й ціни в меню білі) — як prepare() у src/components/ShotImport.tsx */
function whiteOnly(img, nativeImage) {
  const { width, height } = img.getSize(), d = Buffer.from(img.toBitmap());
  for (let i = 0; i + 3 < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const v = mn > 185 && mx - mn < 40 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(d, { width, height });
}
/* ділянки тексту гри для екрана w×h (виміряно на 1920×1080): підтвердження внизу посередині, сповіщення над мінікартою */
function toastRegions(w, h) {
  const s = h / 1080;
  return [{ x: Math.round(w / 2 - 160 * s), y: Math.round(950 * s), width: Math.round(480 * s), height: Math.round(110 * s) },
    { x: Math.round(20 * s), y: Math.round(720 * s), width: Math.round(290 * s), height: Math.round(135 * s) }];
}

/* deps: nativeImage, capture() → NativeImage|null, active() → чи гра йде й зір увімкнено, catalog() → [{id,name,buyer_id}],
   onRecords(recs), onBaseline({cash,bank}), onPrices([{buyer_id,item_id,price}]), logFile */
function vision(deps) {
  let digits = null, text = null, busy = false;
  const feed = hud.watcher();
  let baselineSent = false, place = null, toast = null, lastScene = 0;
  const pickPrices = pricePicker();
  const pickChange = changePicker();
  const quietAt = new Map();
  const log = m => { try { fs.appendFileSync(deps.logFile, `${new Date().toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } };

  async function workers() {
    if (!digits) {
      digits = await createWorker('eng', 1, { langPath: OCR, gzip: false, cacheMethod: 'none' });
      await digits.setParameters({ tessedit_char_whitelist: '$0123456789 ', tessedit_pageseg_mode: '6' });
    }
    if (!text) text = await createWorker(['ukr', 'eng'], 1, { langPath: OCR, gzip: false, cacheMethod: 'none' });
  }
  const read = async (w, img) => (await w.recognize(img.toPNG())).data.text;
  /* рядки з висотою й колонкою для розбору скупника (як readLines() на сайті): дві половини екрана, збільшені вдвічі */
  async function lines(img) {
    const { width, height } = img.getSize(), out = [], half = Math.floor(width / 2);
    for (let c = 0; c < 2; c++) {
      const part = whiteOnly(img.crop({ x: c * half, y: 0, width: half, height }), deps.nativeImage).resize({ width: half * 2, quality: 'best' });
      const { data } = await text.recognize(part.toPNG(), {}, { blocks: true });
      for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) out.push({ text: l.text, y: l.bbox.y0, x: l.bbox.x0, col: c });
    }
    return out;
  }

  async function tick() {
    if (busy || !deps.active()) return;
    busy = true;
    try {
      const img = await deps.capture();
      if (!img || img.isEmpty()) return;
      await workers();
      const { width, height } = img.getSize(), now = Date.now();
      const badge = hud.hasBadge(img.crop(hud.badgeRegion(width, height)).toBitmap());
      if (badge) {
        /* гроші щойно змінились — запам'ятати, що гра про це написала */
        const t = (await Promise.all(toastRegions(width, height).map(r => read(text, img.crop(r))))).join(' ').replace(/\s+/g, ' ').trim();
        if (t) { toast = { text: t, at: now }; log('toast ' + t); }
      }
      let money = null;
      if (!badge) {
        const crop = img.crop(hud.region(width, height));
        money = hud.parse(await read(digits, crop.resize({ width: crop.getSize().width * 2, quality: 'best' })));
      }
      /* автооблік вимкнено — HUD однаково читаємо (щоб знати, коли відкрите меню скупника), але записів не робимо */
      const ledger = !deps.ledger || deps.ledger();
      const acts = ledger ? feed(money) : [];
      if (ledger && money && !baselineSent && feed.stable) { baselineSent = true; log('baseline ' + JSON.stringify(feed.stable)); await deps.onBaseline(feed.stable); }
      if (acts.length) {
        const sc = place && now - place.at < SCENE_TTL ? place : null, ts = toast && now - toast.at < TOAST_TTL ? toast.text : '';
        const recs = scenes.records(acts, sc, ts);
        log('records ' + JSON.stringify(recs));
        toast = null;
        await deps.onRecords(recs);
      }
      /* відкрите вікно скупника читаємо щокадру (~2 с), а не раз на SCENE_EVERY: ціна йде на сайт після двох однакових кадрів,
         і за коротку зупинку біля скупника їх треба встигнути зробити */
      const atBuyer = place?.kind === 'buyer' && now - place.at < 10e3;
      if (!money && !badge && now - lastScene > (atBuyer ? 0 : SCENE_EVERY)) {
        /* HUD закритий — гравець у меню: де саме */
        lastScene = now;
        const small = img.resize({ width: Math.min(width, 1280), quality: 'good' });
        const sc = scenes.scene(await read(text, small));
        if (sc) {
          if (place?.title !== sc.title) log('scene ' + sc.title);
          place = { ...sc, at: now };
          if (sc.kind === 'buyer' && deps.prices()) await scanPrices(img, now);
        }
      }
    } catch (e) { log('error ' + (e?.stack || e)); }
    finally { busy = false; }
  }

  /* вікно скупника → ціни на сайт від імені гравця (сервер сам перевіряє межі, ліміт і цикл цін) */
  async function scanPrices(img, now) {
    const items = await deps.catalog();
    if (!items.length) return;
    const ls = await lines(img);
    /* спершу заголовок «Купує …», якщо не видно — за впізнаними назвами товарів (як на сайті) */
    /* заголовок — ліворуч угорі: до 400×330 px на 1080p; рядки — з половини екрана, збільшеної вдвічі (lines()) */
    const k = img.getSize().height / 1080 * 2;
    const buyer = headerBuyer(ls, { maxX: 400 * k, maxY: 330 * k }) || shot.detectBuyer(ls, items);
    if (!buyer) {
      if (now - (quietAt.get('?') || 0) > 60e3) { quietAt.set('?', now); log('prices ?: вікно скупника, але не впізнав, який — ' + JSON.stringify(ls.filter(l => !l.col).slice(0, 8).map(l => l.text.trim()))); }
      return;
    }
    const all = items.filter(i => i.buyer_id === buyer);
    const rows = shot.parseShot(ls, all)
      .filter(r => r.item && r.price && r.score >= shot.MIN_SCORE)
      .map(r => ({ buyer_id: buyer, item_id: r.item.id, price: r.price, score: r.score, min: r.item.min || 0, max: r.item.max || 0 }));
    await scanChange(img, buyer, now);
    const fresh = pickPrices(buyer, rows, now);
    /* для діагностики: вікно бачимо, але нового немає — раз на хвилину на скупника, щоб не засмічувати журнал */
    if (!fresh.length) { if (now - (quietAt.get(buyer) || 0) > 60e3) { quietAt.set(buyer, now); log(`prices ${buyer}: кадр ${rows.length}/${all.length}, нового немає`); } return; }
    log(`prices ${buyer}: кадр ${rows.length}/${all.length}, на сайт ${JSON.stringify(fresh)}`);
    await deps.onPrices(fresh);
  }

  /* таймер «зміна цін через …» того самого вікна → «Наступна зміна цін» на сайті (set_next_change) */
  async function scanChange(img, buyer, now) {
    if (!deps.onNextChange) return;
    const { width, height } = img.getSize(), r = changeRegion(width, height);
    const crop = whiteOnly(img.crop(r), deps.nativeImage).resize({ width: r.width * 3, quality: 'best' });
    const mins = parseChange(await read(text, crop));
    if (mins === null) return;
    const at = Math.round((now + mins * 60e3) / 60e3) * 60e3;
    if (!pickChange(buyer, at)) return;
    log(`next ${buyer}: через ${mins} хв (${new Date(at).toISOString()})`);
    await deps.onNextChange(buyer, at);
  }

  return { tick, stop: async () => { await digits?.terminate(); await text?.terminate(); digits = text = null; } };
}

module.exports = { vision, toastRegions, whiteOnly };
