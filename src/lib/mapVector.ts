import L from 'leaflet';
import { cellOf, parseChunk, type Chunk, type Index } from './mapChunk';

/* Чітке наближення (z7+): замість розтягнутих картинок браузер сам малює трикутники мінікарти.
   Дані — шматки 800x800 м у /map/v (scripts/map-chunks.py). Тайл z>=7 завжди лежить в одному шматку,
   бо 800 м = 2^(z-4) тайлів, тож порядок малювання (море, тло, передній план) зберігається як у файлі. */
export const VZ = 7;

let index: Promise<Index | null> | null = null;
const chunks = new Map<string, Promise<Chunk | null>>();
const getIndex = () => index ??= fetch('/map/v/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
function getChunk(cx: number, cy: number) {
  const k = cx + '_' + cy;
  if (!chunks.has(k)) chunks.set(k, fetch(`/map/v/${k}.bin`).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && parseChunk(b)).catch(() => null));
  return chunks.get(k)!;
}

/* pxPerM — пікселів на метр на рівні ZMAX (1.28 при ZMAX 6) */
export function vectorLayer(zmax: number, pxPerM: number, maxZoom: number, bounds: L.LatLngBounds) {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const t = document.createElement('canvas'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = this.getTileSize(); t.width = size.x * dpr; t.height = size.y * dpr;
      getIndex().then(async ix => {
        const [cx, cy] = cellOf(coords.z, coords.x, coords.y);
        if (!ix || !ix.have.includes(cx * ix.n + cy)) return done(undefined, t);
        const ch = await getChunk(cx, cy); if (!ch) return done(undefined, t);
        const ctx = t.getContext('2d')!;
        const s = (pxPerM * 2 ** (coords.z - zmax)) / ix.q;   // пікселів на одиницю (чверть метра)
        ctx.setTransform(s * dpr, 0, 0, s * dpr, -coords.x * size.x * dpr, -coords.y * size.y * dpr);
        ctx.lineWidth = 0.9 / s; ctx.lineJoin = 'round';   // тонка обводка тим самим кольором закриває шви між трикутниками
        const { n, xy, c } = ch;
        for (let i = 0; i < n;) {
          const col = c[i]; ctx.beginPath();
          for (; i < n && c[i] === col; i++) {
            const o = i * 6; ctx.moveTo(xy[o], xy[o + 1]); ctx.lineTo(xy[o + 2], xy[o + 3]); ctx.lineTo(xy[o + 4], xy[o + 5]); ctx.closePath();
          }
          ctx.fillStyle = ctx.strokeStyle = ix.palette[col]; ctx.fill(); ctx.stroke();
        }
        done(undefined, t);
      });
      return t;
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ minZoom: VZ, maxZoom, tileSize: 256, noWrap: true, bounds, keepBuffer: 1 });
}

/* Назви місць — трикутники тексту з експорту Hydra (public/map/game/names.bin, ті самі, що в «Карті для гри»):
   частина мапи, а не HTML поверх неї, тож на кожному наближенні виглядають як у грі. Окрема панель 'names' — над зеленими зонами, під мітками.
   Координати — чверті метра від кута текстур гри (-4140, 8400); порядок у файлі — за висотою (тінь під літерами). */
const NQ = 4, NOX = -4140 + 5996, NOY = 8470 - 8400, NB = 1024;   // NOX/NOY — зсув кута текстур від кута мапи сайту, м; NB — клітинка 256 м
type Names = { xy: Uint16Array; c: Uint8Array; pal: string[]; cells: Map<number, number[]> };
let names: Promise<Names | null> | null = null;
const getNames = () => names ??= Promise.all([fetch('/map/game/export.json').then(r => r.json()), fetch('/map/game/names.bin').then(r => r.arrayBuffer())])
  .then(([meta, buf]) => {
    const n = new DataView(buf).getUint32(0, true), xy = new Uint16Array(buf, 4, n * 6), c = new Uint8Array(buf, 4 + n * 12, n);
    const cells = new Map<number, number[]>();
    for (let i = 0; i < n; i++) { const k = Math.floor(xy[i * 6] / NB) * 4096 + Math.floor(xy[i * 6 + 1] / NB); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); }
    return { xy, c, pal: meta.namesPalette as string[], cells };
  }).catch(() => null);

export function namesLayer(zmax: number, pxPerM: number, maxZoom: number, bounds: L.LatLngBounds) {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const t = document.createElement('canvas'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = this.getTileSize(); t.width = size.x * dpr; t.height = size.y * dpr;
      getNames().then(nm => {
        if (!nm) return done(undefined, t);
        const s = (pxPerM * 2 ** (coords.z - zmax)) / NQ;   // пікселів на чверть метра
        const u0 = coords.x * size.x / s - NOX * NQ, v0 = coords.y * size.y / s - NOY * NQ, u1 = u0 + size.x / s, v1 = v0 + size.y / s;
        const ids: number[] = [];
        for (let cx = Math.floor(u0 / NB) - 1; cx <= Math.floor(u1 / NB) + 1; cx++)
          for (let cy = Math.floor(v0 / NB) - 1; cy <= Math.floor(v1 / NB) + 1; cy++) { const a = nm.cells.get(cx * 4096 + cy); if (a) for (const i of a) ids.push(i); }
        if (!ids.length) return done(undefined, t);
        ids.sort((a, b) => a - b);
        const ctx = t.getContext('2d')!, { xy, c, pal } = nm;
        ctx.setTransform(s * dpr, 0, 0, s * dpr, -u0 * s * dpr, -v0 * s * dpr);
        ctx.lineWidth = 0.6 / s; ctx.lineJoin = 'round';
        for (let j = 0; j < ids.length;) {
          const col = c[ids[j]]; ctx.beginPath();
          for (; j < ids.length && c[ids[j]] === col; j++) {
            const o = ids[j] * 6; ctx.moveTo(xy[o], xy[o + 1]); ctx.lineTo(xy[o + 2], xy[o + 3]); ctx.lineTo(xy[o + 4], xy[o + 5]); ctx.closePath();
          }
          ctx.fillStyle = ctx.strokeStyle = pal[col]; ctx.fill(); ctx.stroke();
        }
        done(undefined, t);
      });
      return t;
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ maxZoom, tileSize: 256, noWrap: true, bounds, keepBuffer: 1, pane: 'names' });
}
