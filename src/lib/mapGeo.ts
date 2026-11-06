/* Координати карти. Тайли намальовані з векторної мінікарти гри (власні кольори): квадрат 12800 м з лівим верхнім кутом
   (X0, YT) у метрах гри; на рівні ZMAX це 16384 px, тобто 1.28 px на метр. */
export const X0 = -5996, YT = 8470, SIZE = 12800, ZMAX = 6, TILE = 256;
export const PX_PER_M = (TILE * 2 ** ZMAX) / SIZE;
export const OCEAN = '#0a0e11';

/* метри гри -> пікселі рівня ZMAX і назад */
export const toPx = (x: number, y: number): [number, number] => [(x - X0) * PX_PER_M, (YT - y) * PX_PER_M];
export const toGame = (px: number, py: number): [number, number] => [px / PX_PER_M + X0, YT - py / PX_PER_M];

/* посилання на точку: #x,y,z (координати гри, ціле наближення) */
export function parseHash(h: string): { x: number; y: number; z: number } | null {
  const m = /^#?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d))?$/.exec(h.trim());
  return m ? { x: +m[1], y: +m[2], z: m[3] ? +m[3] : 6 } : null;
}
export const makeHash = (x: number, y: number, z: number) => `#${Math.round(x)},${Math.round(y)},${z}`;

/* пікселі мапи QuantFun -> метри гри. Звірено по 23 заправках, похибка ~3 м */
export const QF_SCALE = 1.81992, QF_X0 = -4141.618, QF_YT = 8403.567;
export const fromQuantFun = (px: number, py: number): [number, number] =>
  [Math.round((px / QF_SCALE + QF_X0) * 10) / 10, Math.round((QF_YT - py / QF_SCALE) * 10) / 10];

/* координати редактора Open Hydra Map (gtav.fanwiki.top, specs/017) -> метри гри. Підібрано по 716 стікерах експорту
   проти тих самих точок на тайлах мінікарти Hydra: медіана 0,7 м, 90% — до 2,7 м */
export const fromOpenHydra = (x: number, y: number): [number, number] =>
  [Math.round((1.00117 * x - 219.3) * 10) / 10, Math.round((1.00115 * y + 1694.6) * 10) / 10];

/* версія даних мапи (тайли, шматки, назви, файли гри): міняти при кожній перебудові public/map — інакше браузер
   показує старі тайли зі свого кешу (адреси ті самі), і нових локацій не видно навіть після Ctrl+F5 */
export const MAP_V = '2026-10-22c';
/* у вікні мапи програми (specs/014) сторінка відкрита з file://, а сайт не віддає CORS — файли мапи дає протокол програми qmap:// */
const MAP_BASE = typeof location !== 'undefined' && location.protocol === 'file:' ? 'qmap://site' : '';
export const mapUrl = (path: string) => `${MAP_BASE}${path}?v=${MAP_V}`;

/* кадр мапи там, де немає адреси з #x,y,z (вікно програми): { x, y, z } у localStorage */
const VIEW_KEY = 'qhub:map:view';
export function readView(): { x: number; y: number; z: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    return v && [v.x, v.y, v.z].every(Number.isFinite) ? { x: v.x, y: v.y, z: v.z } : null;
  } catch { return null; }
}
export function saveView(x: number, y: number, z: number) { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y), z })); } catch { /* приватний режим */ } }
