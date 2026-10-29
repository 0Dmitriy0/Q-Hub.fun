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
const { OPEN_GAP, pricePicker, coverage, textLeft, parseChange, changePicker, changeRegion, headerBuyer } = require('./pricescan.cjs');

/* в інсталяторі мовні дані лежать поруч з архівом (asarUnpack у package.json): робочі потоки OCR читають з диска */
const OCR = path.join(__dirname, 'ocr').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const SCENE_EVERY = 4e3;        // як часто читати меню, поки HUD закритий
const SCENE_TTL = 120e3;        // скільки після меню зміна грошей ще належить йому
const TOAST_TTL = 20e3;         // скільки після значка зміни пам'ятати текст підтвердження
const REREAD_AFTER = 3;         // ціна без назви в стількох кадрах — перечитати назву окремо (T030)

/* схоже на назву товару гри: кирилиця, без цифр і службових написів вікна. Відсіює шум з живої гри 2026-10-29:
   «ЛІМІТ ПРОДАЖУ // З», «2 год. 8 xe.», «J100 WUT a», «Журнал оновлень» (вікно самої програми) */
/* заголовок вікна «Купує шкури», «харчі»… — слово скупника, а не товар (жива гра: «шкури Щі») */
const NOT_NAME = /ліміт|продаж|продати|купує|зміна цін|журнал|оновлен|q-hub|(^|\s)(шкури|харчі|мотлох|метали|колоди|пальне|рибу|врожай|гриби|м.?ясо)(\s\S{0,3})?$/i;
function looksLikeName(t) {
  if (t.length < 4 || t.length > 40 || /\d/.test(t) || NOT_NAME.test(t)) return false;
  const chars = t.replace(/\s/g, ''), cyr = (t.match(/[а-яіїєґ'’-]/gi) || []).length;
  return cyr / chars.length >= 0.85 && t.split(/\s+/).some(w => w.length >= 4);
}

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
  const covered = coverage();   // «прочитано N з M» → смужка (specs/024)
  const unknownAt = new Map();  // невідомі назви — не частіше разу на годину на пару
  const unknownSeen = new Set();
  const reread = { at: -Infinity, seen: new Map(), named: new Set(), prices: new Set() };   // ціни без назви за відкриття: скільки кадрів і що дало перечитування (T030)
  let lastPricesAt = -Infinity;  // останній кадр, де впізнано скупника
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
      /* h — висота рядка: обрізаний краєм списку рядок нижчий за решту, parseShot його відкидає (specs/024, R5) */
      for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) out.push({ text: l.text, y: l.bbox.y0, x: l.bbox.x0, h: l.bbox.y1 - l.bbox.y0, col: c });
    }
    /* QHUB_PRICE_TRACE=1 — розпізнаний текст кадру в журнал, щоб записати фікстуру (fixtures/prices/README.md); знімок не пишеться */
    if (process.env.QHUB_PRICE_TRACE === '1') log('trace ' + JSON.stringify(out));
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
      /* вікно скупника вже читається (останній кадр — до OPEN_GAP тому): меню не розпізнаємо щоразу, одразу ціни —
         на живій грі кадр займав 20–25 с, з них кілька — розпізнавання меню (specs/024) */
      if (!money && !badge && deps.prices() && now - lastPricesAt < OPEN_GAP) {
        lastScene = now;
        if (await scanPrices(img, now)) { place = { ...(place || { kind: 'buyer', title: 'Скупник' }), at: now }; return; }
      }
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
    if (!items.length) return null;
    const t0 = Date.now();
    const ls = await lines(img);
    /* спершу заголовок «Купує …», якщо не видно — за впізнаними назвами товарів (як на сайті) */
    /* заголовок — ліворуч угорі: до 400×330 px на 1080p; рядки — з половини екрана, збільшеної вдвічі (lines()) */
    const k = img.getSize().height / 1080 * 2;
    const buyer = headerBuyer(ls, { maxX: 400 * k, maxY: 330 * k }) || shot.detectBuyer(ls, items);
    if (!buyer) {
      if (now - (quietAt.get('?') || 0) > 60e3) { quietAt.set('?', now); log('prices ?: вікно скупника, але не впізнав, який — ' + JSON.stringify(ls.filter(l => !l.col).slice(0, 8).map(l => l.text.trim()))); }
      return null;
    }
    lastPricesAt = now;
    const all = items.filter(i => i.buyer_id === buyer);
    const rows = shot.parseShot(ls, all)
      .filter(r => r.item && r.price && r.score >= shot.MIN_SCORE)
      .map(r => ({ buyer_id: buyer, item_id: r.item.id, price: r.price, score: r.score, min: r.item.min || 0, max: r.item.max || 0 }));
    rows.push(...await rereadNames(img, ls, all, buyer, rows, now));
    await scanChange(img, buyer, now);
    const fresh = pickPrices(buyer, rows, now);
    /* та сама ціна поза межами, впевнено прочитана тричі: межі на сайті, мабуть, хибні — адміну «перевір межі» (T031) */
    if (pickPrices.outside.length) log(`limits ${buyer}: ${JSON.stringify(pickPrices.outside)}`);
    for (const o of pickPrices.outside) await deps.onLimits?.(buyer, o.item_id, o.price);
    const cov = covered.frame(buyer, all.length, rows.map(r => r.item_id), pickPrices.confirmed, now);
    deps.onCoverage?.(cov);
    log(`cover ${buyer}: ${cov.read}/${cov.total}, чекають ${cov.pending}, кадр за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    reportUnknown(buyer, ls, all, now);
    /* для діагностики: вікно бачимо, але нового немає — раз на хвилину на скупника, щоб не засмічувати журнал */
    if (!fresh.length) { if (now - (quietAt.get(buyer) || 0) > 60e3) { quietAt.set(buyer, now); log(`prices ${buyer}: кадр ${rows.length}/${all.length}, нового немає`); } return buyer; }
    log(`prices ${buyer}: кадр ${rows.length}/${all.length}, на сайт ${JSON.stringify(fresh)}`);
    await deps.onPrices(fresh);
    return buyer;
  }

  /* короткі назви, які OCR усього кадру не впізнає («Фугу» → «Eom», «ау», жива гра 2026-10-29; specs/024, T030):
     ціна без назви, що повторюється в REREAD_AFTER кадрах одного відкриття, — назву над нею (найвищий рядок картки)
     вирізати, збільшити втричі й прочитати окремо. Один раз на ціну за відкриття; не впізнано — нічого (принцип IV).
     Далі рядок іде в pricePicker як звичайний: межі й упевненість перевіряються там */
  async function rereadNames(img, ls, all, buyer, rows, now) {
    if (now - reread.at >= OPEN_GAP) { reread.seen.clear(); reread.named.clear(); reread.prices.clear(); }
    reread.at = now;
    for (const r of rows) { reread.named.add(r.item_id); reread.prices.add(r.price); }
    const { width, height } = img.getSize(), half = Math.floor(width / 2), s = height / 1080, out = [];
    for (const c of [0, 1]) {
      let card = [];
      for (const l of ls.filter(l => l.col === c).sort((a, b) => a.y - b.y)) {
        const price = shot.readPrice(l.text);
        if (price == null) { card.push(l); continue; }
        const name = card.reduce((m, x) => (!m || (x.h || 0) > (m.h || 0) ? x : m), null);
        card = [];
        /* назву впізнано й так, або цю ціну parseShot за відкриття вже віддавав якомусь товару (картка, назву якої цей кадр
           просто не дочитав) — сирота лише ціна, що ніколи не мала назви */
        if (!name || (shot.bestItem(name.text, all)?.score ?? 0) >= shot.MIN_SCORE || reread.prices.has(price)) continue;
        const k = buyer + ':' + price, e = reread.seen.get(k) || { n: 0 };
        reread.seen.set(k, e);
        if (++e.n < REREAD_AFTER) continue;
        if (e.item === undefined) {
          /* рядки — з половини екрана, збільшеної вдвічі (lines()): назад у координати знімка */
          const x = Math.max(0, Math.round(c * half + name.x / 2 - 8 * s)), y = Math.max(0, Math.round(name.y / 2 - 6 * s));
          const r = { x, y, width: Math.min(Math.round(320 * s), width - x), height: Math.min(Math.round(name.h / 2 + 12 * s), height - y) };
          /* «назвою» OCR часто вважає картинку товару ліворуч від справжньої назви — її відрізати */
          const dx = textLeft(img.crop(r).toBitmap(), r.width, r.height);
          if (dx) { r.x += dx; r.width -= dx; }
          /* спершу вирізка як є: «лише білий» на одному рядку губить «Фугу» зовсім (жива гра 2026-10-29), а без нього — 1.00 */
          let t = '';
          for (const prep of [c => c, c => whiteOnly(c, deps.nativeImage)]) {
            t = (await read(text, prep(img.crop(r)).resize({ width: r.width * 3, quality: 'best' }))).replace(/\s+/g, ' ').trim();
            const b = shot.bestItem(t, all);
            e.item = b && b.score >= shot.MIN_SCORE && b.score - b.second >= shot.AMBIGUOUS ? { item: b.item, score: b.score } : null;
            if (e.item) break;
          }
          log(`reread ${buyer}: ${price} → ${e.item ? `«${e.item.item.name}» (${e.item.score.toFixed(2)})` : 'не впізнано'} з «${t}»`);
        }
        /* лише товар, якого за це відкриття жодного разу не впізнано звичайно (інакше вирізка могла зачепити назву сусідньої
           картки), і лише одна ціна на товар: дві різні ціни, перечитані в той самий товар, — нічого (принцип IV) */
        const id = e.item?.item.id;
        if (!e.item || reread.named.has(id) || [...reread.seen].some(([kk, o]) => kk !== k && o.item?.item.id === id)) continue;
        if (!rows.some(r => r.item_id === id) && !out.some(r => r.item_id === id))
          out.push({ buyer_id: buyer, item_id: e.item.item.id, price, score: e.item.score, min: e.item.item.min || 0, max: e.item.item.max || 0 });
      }
    }
    return out;
  }

  /* назви товарів, яких немає в Q-Hub (specs/024, FR-010): у картці над ціною назва — найвищий рядок (вона крупніша за опис);
     якщо вона не схожа на жоден товар скупника — пропозиція адміну. Сам товар програма не додає (принцип II) */
  function reportUnknown(buyer, ls, all, now) {
    if (!deps.onUnknown) return;
    for (const c of [0, 1]) {
      const col = ls.filter(l => l.col === c).sort((a, b) => a.y - b.y);
      const hs = col.map(l => l.h).filter(h => h > 0).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 0;
      let card = [];
      for (const l of col) {
        if (shot.readPrice(l.text) == null) { card.push(l); continue; }
        const name = card.reduce((m, x) => (!m || (x.h || 0) > (m.h || 0) ? x : m), null);
        card = [];
        if (!name || !med || (name.h || 0) < med * 1.2) continue;
        const t = name.text.trim(), b = shot.bestItem(t, all);
        if ((b && b.score >= shot.MIN_SCORE) || !looksLikeName(t)) continue;
        /* шум розпізнавання рідко повторюється дослівно: пропозиція — лише якщо та сама назва вже була в іншому кадрі */
        const k = buyer + ':' + t.toLowerCase();
        if (!unknownSeen.has(k)) { unknownSeen.add(k); continue; }
        if (now - (unknownAt.get(k) || -Infinity) < 36e5) continue;
        unknownAt.set(k, now);
        log(`unknown ${buyer}: ${t}`);
        deps.onUnknown(buyer, t);
      }
    }
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
