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
const inLimits = r => r.min > 0 && r.max > r.min && r.price >= r.min && r.price <= r.max;
function pricePicker(every = PRICES_EVERY) {
  const seen = new Map(), sent = new Map();
  return (buyer, rows, now) => {
    const out = [];
    for (const r of rows) {
      const k = buyer + ':' + r.item_id, s = seen.get(k), done = sent.get(k);
      const confirmed = (s && s.price === r.price) || ((r.score ?? 0) >= SURE && inLimits(r));
      seen.set(k, { price: r.price });
      if (!confirmed) continue;
      if (done && done.price === r.price && now - done.at < every) continue;
      sent.set(k, { price: r.price, at: now });
      out.push({ buyer_id: r.buyer_id, item_id: r.item_id, price: r.price });
    }
    return out;
  };
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

module.exports = { SURE, pricePicker, parseChange, changePicker, changeRegion, PRICES_EVERY };
