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
