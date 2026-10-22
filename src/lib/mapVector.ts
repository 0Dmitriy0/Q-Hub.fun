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
