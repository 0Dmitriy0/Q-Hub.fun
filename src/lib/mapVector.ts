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

let namesIndex: Promise<{ n: number; have: Record<number, number[]> } | null> | null = null;
const getNamesIndex = () => namesIndex ??= fetch('/map/n/index.json').then(r => r.ok ? r.json() : null).catch(() => null);

export function namesLayer(zmax: number, pxPerM: number, maxZoom: number, bounds: L.LatLngBounds) {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      /* до z6 — готові картинки (scripts/map-names-tiles.py): 200 тис. трикутників на дальньому зумі вішали браузер */
      if (coords.z <= zmax) {
        const box = document.createElement('div');   // img без src браузер обводить рамкою — у порожні тайли картинка не кладеться
        getNamesIndex().then(ix => {
          if (!ix || !ix.have[coords.z]?.includes(coords.x * ix.n + coords.y)) return done(undefined, box);
          const img = document.createElement('img'); img.alt = ''; img.width = img.height = 256; img.style.display = 'block';
          img.onload = () => done(undefined, box); img.onerror = () => done(undefined, box);
          img.src = `/map/n/${coords.z}/${coords.x}/${coords.y}.webp`; box.append(img);
        });
        return box;
      }
      const t = document.createElement('canvas'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = this.getTileSize(); t.width = size.x * dpr; t.height = size.y * dpr;
      getNames().then(nm => {
        if (!nm) return done(undefined, t);
        const s = (pxPerM * 2 ** (coords.z - zmax)) / NQ;   // пікселів на чверть метра
        const u0 = coords.x * size.x / s - NOX * NQ, v0 = coords.y * size.y / s - NOY * NQ, u1 = u0 + size.x / s, v1 = v0 + size.y / s;
        const ids: number[] = [];
        for (let cx = Math.floor(u0 / NB) - 1; cx <= Math.floor(u1 / NB) + 1; cx++)
          for (let cy = Math.floor(v0 / NB) - 1; cy <= Math.floor(v1 / NB) + 1; cy++) { const a = nm.cells.get(cx * 4096 + cy); if (a) for (const i of a) ids.push(i); }
        const { xy, c, pal } = nm, m = 2 / s;   // лише трикутники, що зачіпають тайл (з запасом у 2 px)
        const vis = ids.filter(i => {
          const o = i * 6, a = Math.min(xy[o], xy[o + 2], xy[o + 4]), b = Math.max(xy[o], xy[o + 2], xy[o + 4]);
          if (b < u0 - m || a > u1 + m) return false;
          const e = Math.min(xy[o + 1], xy[o + 3], xy[o + 5]), f = Math.max(xy[o + 1], xy[o + 3], xy[o + 5]);
          return f >= v0 - m && e <= v1 + m;
        });
        if (!vis.length) return done(undefined, t);
        vis.sort((a, b) => a - b);
        const ctx = t.getContext('2d')!;
        ctx.setTransform(s * dpr, 0, 0, s * dpr, -u0 * s * dpr, -v0 * s * dpr);
        ctx.lineWidth = 0.6 / s; ctx.lineJoin = 'round';
        for (let j = 0; j < vis.length;) {
          const col = c[vis[j]]; ctx.beginPath();
          for (; j < vis.length && c[vis[j]] === col; j++) {
            const o = vis[j] * 6; ctx.moveTo(xy[o], xy[o + 1]); ctx.lineTo(xy[o + 2], xy[o + 3]); ctx.lineTo(xy[o + 4], xy[o + 5]); ctx.closePath();
          }
          ctx.fillStyle = ctx.strokeStyle = pal[col]; ctx.fill(); ctx.stroke();
        }
        done(undefined, t);
      });
      return t;
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ minZoom: 3, maxZoom, tileSize: 256, noWrap: true, bounds, keepBuffer: 1, updateWhenZooming: false, pane: 'names' });
}
