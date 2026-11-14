import { TILE, ZMAX, toPx } from '../lib/mapGeo';

/* Шматок мапи Q-Hub у формі мітки Alt+F9 (specs/083 US2): плитки рівня ZMAX (0,78 м/пікс) навколо знайденої точки,
   щоб гравець порівняв зі знімком гри, куди ляже мітка. Плитки — ті самі, що мапа програми (mapUrl). */
export interface PreviewTile { z: number; tx: number; ty: number; left: number; top: number }
export interface Preview { tiles: PreviewTile[]; pin: { left: number; top: number } }

const N = 2 ** ZMAX;   // плиток по стороні на рівні ZMAX

/* x, y — метри гри; size — сторона квадрата прев'ю в пікселях; точка — у центрі квадрата */
export function pinPreview(x: number, y: number, size = 240): Preview {
  const [px, py] = toPx(x, y), ox = px - size / 2, oy = py - size / 2;
  const tiles: PreviewTile[] = [];
  for (let tx = Math.floor(ox / TILE); tx * TILE < ox + size; tx++)
    for (let ty = Math.floor(oy / TILE); ty * TILE < oy + size; ty++)
      if (tx >= 0 && ty >= 0 && tx < N && ty < N) tiles.push({ z: ZMAX, tx, ty, left: Math.round(tx * TILE - ox), top: Math.round(ty * TILE - oy) });
  return { tiles, pin: { left: size / 2, top: size / 2 } };
}
