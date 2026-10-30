/* Розбір вікна скупника без OCR і без Electron: які ціни й коли надсилати, таймер «зміна цін через …».
   Окремо від vision.cjs, щоб тести не тягнули tesseract і зібраний lib/shotparse.cjs (його немає до збірки). */
const PRICES_EVERY = 10 * 60e3; // ту саму ціну того самого товару — не частіше

/* відбір цін зі зчитаних кадрів вікна скупника. Раніше вікно читалося один раз на першому кадрі — і товари,
   яких на ньому не розпізнало (вікно ще домальовувалось, рядок зчитався криво), не доходили до сайту.
   Тепер кожен кадр, поки вікно відкрите: ціна йде на сайт, коли два кадри поспіль показали те саме число
   (захист від помилок розпізнавання), і не повторюється, поки не зміниться або не мине PRICES_EVERY */
/* Виняток для прокручуваних списків (шкури — 32 товари, на екрані ~8): товар видно секунду-дві, другого кадру може не бути.
   Тоді вистачає одного кадру, якщо назву впізнано впевнено (score ≥ SURE) і ціна в межах скупника (min…max з бази).
   Криве число в межах меж виправить наступний кадр з іншою ціною — вона теж піде на сайт */
const SURE = 0.9;
/* та сама ціна поза межами, впевнено прочитана стільки разів за відкриття, — межі на сайті хибні: адміну «перевір межі» (T031) */
const ODD_SURE = 0.95, ODD_TIMES = 3;
const inLimits = r => r.min > 0 && r.max > r.min && r.price >= r.min && r.price <= r.max;
/* товар без меж: ціна, що більш ніж удвічі відрізняється від останньої на сайті, — зайва чи пропущена цифра (specs/004 FR-002) */
const jump = r => r.last > 0 && (r.price > r.last * 2 || r.price * 2 < r.last);
/* одне відкриття вікна скупника: кадри з ним ідуть без паузи довшої за OPEN_GAP (specs/024, research R2).
   Кадр вікна скупника читається довго: на живій грі 2026-10-29 — медіана 10 с, p90 22 с між кадрами; 10 с рвали відкриття */
const OPEN_GAP = 30e3;
/* «бачене» живе лише в межах відкриття вікна: друга зчитка з тим самим числом має бути зараз, а не вчора (R4).
   pick.confirmed — товари, ціну яких підтверджено в останньому виклику, навіть якщо на сайт вона не пішла (для покриття) */
function pricePicker(every = PRICES_EVERY) {
  const seen = new Map(), sent = new Map(), last = { at: -Infinity, opened: -Infinity };   // останній кадр будь-якого скупника: вікно те саме, навіть якщо кадр упізнано хибно
  const pick = (buyer, rows, now) => {
    if (now - last.at >= OPEN_GAP) { seen.clear(); last.opened = now; }
    last.at = now;
    const out = [], ok = new Set(), odd = [], rejected = [];   // rejected — відкинуті ціни для журналу програми (FR-004)
    for (let r of rows) {
      const k = buyer + ':' + r.item_id, s = seen.get(k), done = sent.get(k), lim = r.min > 0 && r.max > r.min;
      let repaired = false;
      if (!lim && jump(r)) { rejected.push({ item_id: r.item_id, price: r.price, last: r.last, why: 'стрибок від останньої ціни' }); seen.delete(k); continue; }
      /* межі є, а ціна поза ними (жива гра 2026-10-29): */
      if (lim && !inLimits(r)) {
        const fixed = /^5\d{2,}$/.test(String(r.price)) ? Number(String(r.price).slice(1)) : 0;
        if (fixed && inLimits({ ...r, price: fixed })) {
          /* «$» прочитано як «5» («Продати $1 050» → 51050). Але «5495» — це 549 із зайвою цифрою, а не $495: виправлене число
             саме нічого не підтверджує, лише разом зі звичайною зчиткою того самого числа */
          r = { ...r, price: fixed }; repaired = true;
        } else if (r.price >= r.min * 0.5 && r.price <= r.max * 1.5) {
          /* близько до меж — або крива зчитка, або межі на сайті застарілі («Молоток» 64 при 76–498, «Дубова колода» 260 при
             295–449). На сайт не йде ніколи (сервер однаково відхиляє ціну за межами ±10 %), але та сама впевнена зчитка
             ODD_TIMES разів за відкриття — адміну «перевір межі», один раз */
          const sure = (r.score ?? 0) >= ODD_SURE, odds = sure ? (s?.odd === r.price ? (s.odds || 0) + 1 : 1) : 0;
          seen.set(k, { ...(s || { plain: [] }), odd: sure ? r.price : s?.odd, odds: sure ? odds : s?.odds });
          if (odds === ODD_TIMES) odd.push({ item_id: r.item_id, price: r.price, min: r.min, max: r.max });
          rejected.push({ item_id: r.item_id, price: r.price, min: r.min, max: r.max, why: 'поза межами' });
          continue;
        } else { rejected.push({ item_id: r.item_id, price: r.price, min: r.min, max: r.max, why: 'далеко поза межами' }); seen.delete(k); continue; }   // «51050» без виправлення — не ціна
      }
      /* уже надіслану в цьому відкритті ціну міняє лише друга однакова зчитка, а не один кадр */
      const changing = done && done.at >= last.opened && done.price !== r.price;
      /* звичайні (не виправлені) зчитки товару за відкриття: виправлене число, якому вони суперечать, — хибне («5495» поруч із 549) */
      const plain = new Set(s?.plain || []); if (!repaired) plain.add(r.price);
      const reps = repaired && s?.price === r.price ? (s.reps || 0) + 1 : repaired ? 1 : 0;
      const twice = s && s.price === r.price && (!(s.repaired && repaired)
        /* лише виправлені, зате однакові ≥ 3 рази й без суперечних звичайних: «$» завжди читається як «5» («51 281» → $1 281) */
        || (reps >= 3 && ![...plain].some(p => p !== r.price)));
      const once = !repaired && !changing && (r.score ?? 0) >= SURE && inLimits(r);
      const confirmed = twice || once;
      seen.set(k, { price: r.price, repaired, reps, plain: [...plain], odd: s?.odd, odds: s?.odds });
      if (!confirmed) continue;
      ok.add(r.item_id);
      if (done && done.price === r.price && now - done.at < every) continue;
      sent.set(k, { price: r.price, at: now });
      out.push({ buyer_id: r.buyer_id, item_id: r.item_id, price: r.price });
    }
    pick.confirmed = ok;
    pick.outside = odd;   // ціни поза межами, впевнено прочитані ODD_TIMES разів — адміну «перевір межі» (T031)
    pick.rejected = rejected;
    return out;
  };
  pick.confirmed = new Set(); pick.outside = []; pick.rejected = [];
  return pick;
}

/* «прочитано N з M» за поточне відкриття вікна скупника (specs/024, data-model «Покриття вікна»).
   frame() — кадр із цим скупником: total — товарів у Q-Hub, seen — розпізнані з ціною, confirmed — з підтвердженою ціною.
   view() — стан останнього скупника або null, якщо вікно закрите (довше OPEN_GAP без кадрів); shown — відкрите довше showAfter.
   Стан — окремо на кожного скупника: один кадр, хибно впізнаний як інший скупник («М'ясо» посеред «Шкур» на живій грі),
   не обнуляє лік. showAfter за замовчуванням 0: перший кадр і так читається кілька секунд після відкриття вікна */
function coverage(gap = OPEN_GAP, showAfter = 0) {
  const states = new Map();
  let st = null, lastAny = -Infinity;
  const view = now => {
    if (!st || now - lastAny >= gap) return null;
    const pending = [...st.seen].filter(id => !st.read.has(id)).length;
    return { buyer: st.buyer, read: Math.min(st.read.size, st.total), total: st.total, pending, shown: now - st.openedAt >= showAfter };
  };
  return {
    frame(buyer, total, seen, confirmed, now) {
      if (now - lastAny >= gap) states.clear();   // нове відкриття вікна — старі ліки не воскресають
      st = states.get(buyer);
      if (!st) { st = { buyer, openedAt: now, total, read: new Set(), seen: new Set(), lastAt: now }; states.set(buyer, st); }
      st.total = total; st.lastAt = now; lastAny = now;
      for (const id of seen) st.seen.add(id);
      for (const id of confirmed) st.read.add(id);
      return view(now);
    },
    view,
  };
}

/* де в вирізці картки починається текст: ліворуч від назви — картинка товару, і OCR тоді читає сміття («Фугу» з рибою зліва →
   «Be vr», без неї — «Фугу» 1.00; жива гра 2026-10-29). Картинка — суцільно світлі стовпці від лівого краю, текст — світлий
   лише частково. px — 4 байти на піксель (BGRA чи RGBA — для яскравості байдуже); повертає x, з якого брати, або 0 */
function textLeft(px, width, height) {
  const lit = x => { let n = 0; for (let y = 0; y < height; y++) { const i = (y * width + x) * 4; if (px[i] + px[i + 1] + px[i + 2] > 210) n++; } return n / height; };
  let x = 0;
  while (x < width && lit(x) < 0.6 && x < width * 0.2) x++;   // темний відступ перед картинкою
  if (x >= width * 0.2 || lit(x) < 0.6) return 0;            // картинки біля лівого краю немає
  while (x < width && lit(x) >= 0.3) x++;                     // сама картинка (світлі стовпці)
  return x < width * 0.8 ? x : 0;
}

/* блок «Зміна цін на товари через 2 год. 55 хв.» ліворуч унизу вікна скупника (виміряно на 1920×1080) */
function changeRegion(w, h) {
  const s = h / 1080;
  return { x: Math.round(100 * s), y: Math.round(870 * s), width: Math.round(200 * s), height: Math.round(100 * s) };
}
/* «2 год. 55 хв.» → 175 хв; «55 хв.» → 55; «1 год.» → 60; не схоже на таймер → null. OCR іноді зливає число з «год» */
function parseChange(t) {
  /* OCR плутає схожі літери: «3rop. 12xe.», «xB.», «З год.» (кирилична З замість трійки) — зводимо до «3 год. 12 хв.» */
  const s = String(t || '').toLowerCase().replace(/\s+/g, ' ')
    .replace(/x/g, 'х').replace(/b/g, 'в').replace(/o/g, 'о').replace(/r(?=о)/g, 'г');
  const h = s.match(/(\d{1,2}|з)\s*го[дnp]/), m = s.match(/(\d{1,2})\s*х/);
  if (!h && !m) return null;
  const hh = h ? (h[1] === 'з' ? 3 : Number(h[1])) : 0, mm = m ? Number(m[1]) : 0;
  if (mm > 59) return null;
  const mins = hh * 60 + mm;
  return mins >= 1 && mins <= 24 * 60 ? mins : null;
}
/* коли надсилати час зміни: два кадри поспіль показали той самий момент (±1 хв), і він відрізняється від уже надісланого
   більш ніж на 2 хв — тобто почався новий цикл цін (поки відлік іде, момент зміни той самий і повторно не шлеться) */
function changePicker() {
  const seen = new Map(), sent = new Map();
  return (buyer, at) => {
    const prev = seen.get(buyer); seen.set(buyer, at);
    if (prev === undefined || Math.abs(prev - at) > 60e3) return false;
    const done = sent.get(buyer);
    if (done !== undefined && Math.abs(done - at) <= 2 * 60e3) return false;
    sent.set(buyer, at); return true;
  };
}

/* хто це — за білим словом під «Купує» ліворуч угорі вікна (харчі, шкури, врожай…): воно велике й читається надійніше
   за назви товарів. Саме «Купує» сіре — його OCR часто губить, тож не потрібне. Слова — як пише гра: «колоди», «пальне».
   box — ділянка заголовка в координатах рядків (лише вона, щоб «Металобрухт» з картки товару не прийняти за «метали») */
const HEAD = [[/врож/, 'harvest'], [/гриб/, 'mush'], [/колод|дерев/, 'wood'], [/метал/, 'metal'], [/мотл/, 'junk'], [/пальн|палив/, 'fuel'],
  [/ри[бв6]/, 'fish'], [/харч/, 'food'], [/шкур/, 'hide'], [/м.?яс|мяс/, 'hide']];   // м'ясо купують «Шкури» (specs/003)
/* латиниця, схожа на кирилицю: «puby» → «риву», «xapчi» → «харчі» */
const LAT = { a: 'а', c: 'с', e: 'е', i: 'і', o: 'о', p: 'р', x: 'х', y: 'у', u: 'и', k: 'к', m: 'м', h: 'н', t: 'т', b: 'в' };
const cyr = t => t.toLowerCase().replace(/[acdeiopxyukmhtb]/g, ch => LAT[ch] || ch);
function headerBuyer(lines, box = {}) {
  const { maxX = Infinity, maxY = Infinity } = box;
  for (const l of lines.filter(l => !l.col && (l.x ?? 0) < maxX && l.y < maxY).sort((a, b) => a.y - b.y)) {
    const t = cyr(l.text).replace(/[^а-яіїєґ'’ ]/g, ' ').trim();
    if (!t || t.length > 24) continue;   // ім'я скупника й заголовок — короткі рядки
    for (const [re, id] of HEAD) if (re.test(t)) return id;
  }
  return null;
}

module.exports = { headerBuyer, textLeft, SURE, OPEN_GAP, pricePicker, coverage, parseChange, changePicker, changeRegion, PRICES_EVERY };
