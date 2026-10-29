/* де стоїть вікно мапи (specs/014 FR-001): під плашкою Alt+Q, праворуч від «Історії», до правого й нижнього краю робочої
   області. Плашки не видно (відкрили клавішею) — ≈80 % робочої області по центру. Чиста функція — тести без Electron.
   work, bar, hist — { x, y, width, height }; bar / hist — null, якщо не видно */
const GAP = 12, MIN_W = 640, MIN_H = 420;

function place({ work, bar = null, hist = null }) {
  if (!bar) {
    const width = Math.max(MIN_W, Math.round(work.width * 0.8)), height = Math.max(MIN_H, Math.round(work.height * 0.8));
    return { x: work.x + Math.round((work.width - width) / 2), y: work.y + Math.round((work.height - height) / 2), width: Math.min(width, work.width), height: Math.min(height, work.height) };
  }
  const right = work.x + work.width - GAP, bottom = work.y + work.height - GAP;
  let x = hist ? hist.x + hist.width + GAP : work.x + GAP, y = bar.y + bar.height + GAP;
  /* тісний екран (1366×768): мапа не менша за MIN_W × MIN_H — тоді краще перекрити край історії чи плашки, ніж стиснути мапу */
  if (right - x < MIN_W) x = Math.max(work.x + GAP, right - MIN_W);
  if (bottom - y < MIN_H) y = Math.max(work.y + GAP, bottom - MIN_H);
  return { x, y, width: right - x, height: bottom - y };
}

/* клавіша мапи не має збігатися з іншими клавішами програми (FR-002): текст помилки або null */
function mapKeyConflict(key, { hotkey, pinKey, shotKey }) {
  const k = s => String(s || '').toLowerCase();
  if (!key) return 'Оберіть клавішу.';
  if (k(key) === k(hotkey)) return `${key} уже відкриває плашку — оберіть іншу клавішу.`;
  if (k(key) === k(pinKey)) return `${key} уже ставить мітку — оберіть іншу клавішу.`;
  if (k(key) === k(shotKey)) return `${key} уже робить навчальний знімок — оберіть іншу клавішу.`;
  return null;
}

module.exports = { place, mapKeyConflict };
