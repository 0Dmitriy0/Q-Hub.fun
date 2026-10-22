/* «Карта для гри»: ті самі 6 текстур, що дає Hydra (minimap_<рядок>_<стовпець>.png, 2x3 тайли),
   з вибраними мітками, намальованими поверх. Межі текстур гри: лівий верхній кут (-4140, 8400), тайл — 4500 м. */
export const GAME = { x0: -4140, yt: 8400, tile: 4500, cols: 2, rows: 3 };

/* метри гри -> пікселі повної текстури (size — розмір одного тайла в пікселях) */
export const gamePx = (x: number, y: number, size: number): [number, number] =>
  [(x - GAME.x0) * size / GAME.tile, (GAME.yt - y) * size / GAME.tile];

export const tileName = (row: number, col: number) => `minimap_${row}_${col}.png`;

/* CRC-32 для zip */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/* запис zip: data — вже готові байти (method 0 — як є, 8 — deflate); crc і size — розпакованих даних */
export type ZipEntry = { name: string; data: Uint8Array; method?: 0 | 8; crc?: number; size?: number };

export function makeZip(files: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), method = f.method ?? 0, crc = f.crc ?? crc32(f.data), size = f.size ?? f.data.length, n = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true); h.setUint32(14, crc, true);
    h.setUint32(18, n, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true); c.setUint32(16, crc, true);
    c.setUint32(20, n, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, f.data); central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + n;
  }
  const csize = central.reduce((t, p) => t + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

/* записи zip як є (без розпакування) — щоб переложити файли експорту Hydra в новий архів */
export function readZip(buf: Uint8Array): ZipEntry[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), dec = new TextDecoder();
  let e = buf.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('не zip');
  const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true) as 0 | 8, crc = v.getUint32(p + 16, true), csz = v.getUint32(p + 20, true), size = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    out.push({ name, data: buf.subarray(start, start + csz), method, crc, size });
    p += 46 + nl + xl + cl;
  }
  return out;
}

/* ---- значки міток геометрією, як це робить Hydra (supertile_fore_C_R_tile_2_2) ---- */
/* сітка частин мінікарти: стовпці по 1175 м від X -4500, рядки по 1388 м від Y 8000; папка minimap_<стовпець>_<рядок> */
export const supertileOf = (x: number, y: number): [number, number] => [Math.floor((x + 4500) / 1175), Math.floor((8000 - y) / 1388)];

/* значок у одиницях [-0.5, 0.5]: горизонтальні смужки однакового кольору з растру іконки */
export type IconRuns = { x0: number; x1: number; y0: number; y1: number; c: [number, number, number] }[];
export function iconRuns(px: Uint8ClampedArray, n: number): IconRuns {
  const runs: IconRuns = []; const q = (v: number) => Math.min(255, Math.round(v / 24) * 24);
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const i = (y * n + x) * 4; if (px[i + 3] < 128) { x++; continue; }
      const c: [number, number, number] = [q(px[i]), q(px[i + 1]), q(px[i + 2])]; let x2 = x + 1;
      while (x2 < n) { const j = (y * n + x2) * 4; if (px[j + 3] < 128 || q(px[j]) !== c[0] || q(px[j + 1]) !== c[1] || q(px[j + 2]) !== c[2]) break; x2++; }
      runs.push({ x0: x / n - 0.5, x1: x2 / n - 0.5, y0: 0.5 - y / n, y1: 0.5 - (y + 1) / n, c }); x = x2;
    }
  }
  return runs;
}

const hex = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const v = m ? parseInt(m[1], 16) : 0xff6a1f; return [v >> 16, (v >> 8) & 255, v & 255]; };

/* вершини (x y z r g b) і трикутники одного файлу значків */
export class IconMesh {
  v: number[][] = []; idx: number[] = [];
  private quad(a: number[], b: number[], c: number[], d: number[]) { const k = this.v.length; this.v.push(a, b, c, d); this.idx.push(k, k + 1, k + 2, k + 2, k + 3, k); }
  private disc(cx: number, cy: number, r: number, z: number, col: [number, number, number], seg = 20) {
    const k = this.v.length; this.v.push([cx, cy, z, ...col]);
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; this.v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, ...col]); }
    for (let i = 0; i < seg; i++) this.idx.push(k, k + 1 + i, k + 1 + ((i + 1) % seg));
  }
  /* кружок кольору категорії, темне коло всередині і сам значок — як мітка на сайті */
  add(x: number, y: number, size: number, color: string, runs: IconRuns) {
    const r = size / 2;
    this.disc(x, y, r, 17.0, hex(color)); this.disc(x, y, r * 0.84, 17.3, [17, 17, 17]);
    const s = size * 0.7;
    for (const u of runs) this.quad([x + u.x0 * s, y + u.y0 * s, 17.6, ...u.c], [x + u.x1 * s, y + u.y0 * s, 17.6, ...u.c], [x + u.x1 * s, y + u.y1 * s, 17.6, ...u.c], [x + u.x0 * s, y + u.y1 * s, 17.6, ...u.c]);
  }
  get size() { return this.v.length; }
}

const f7 = (n: number) => n.toFixed(7);
export function meshText(m: IconMesh): { mesh: string; min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of m.v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const lines: string[] = []; for (let i = 0; i < m.idx.length; i += 15) lines.push('\t\t\t\t' + m.idx.slice(i, i + 15).join(' '));
  const mesh = `Version 165 32\n{\n\tLocked false\n\tSkinned false\n\tBoneCount 0\n\tMask 255\n\tBounds\n\t{\n\t\tAabb\n\t\t{\n\t\t\tMin ${min.map(f7).join(' ')}\n\t\t\tMax ${max.map(f7).join(' ')}\n\t\t}\n\t}\n`
    + `\tGeometries\n\t{\n\t\tGeometry\n\t\t{\n\t\t\tShaderIndex 0\n\t\t\tFlags -\n\t\t\tVertexDeclaration NB60E6ACF\n\t\t\tIndices ${m.idx.length}\n\t\t\t{\n${lines.join('\n')}\n\t\t\t}\n`
    + `\t\t\tVertices ${m.v.length}\n\t\t\t{\n${m.v.map(p => `\t\t\t\t${f7(p[0])} ${f7(p[1])} ${f7(p[2])} / ${p[3]} ${p[4]} ${p[5]} 255`).join('\n')}\n\t\t\t}\n\t\t}\n\t}\n}`;
  return { mesh, min, max };
}

export function odrText(tile: string, min: number[], max: number[]) {
  const c = min.map((v, k) => (v + max[k]) / 2), r = Math.hypot(...max.map((v, k) => (v - min[k]) / 2));
  return `Version 165 32\n{\n\tShaders\n\t{\n\t\tminimap.sps\n\t\t{\n\t\t\tUseTessellation 0.0000000\n\t\t}\n\t}\n\tSkeleton null\n\tLodGroup\n\t{\n\t\tHigh 9998.0\n\t\t{\n\t\t\t${tile}\\${tile}_high.mesh 0\n\t\t}\n`
    + `\t\tMed 9998.0\n\t\tLow 9998.0\n\t\tVlow 9998.0\n\t\tAABBMin ${min.map(f7).join(' ')}\n\t\tAABBMax ${max.map(f7).join(' ')}\n\t\tRadius ${r.toFixed(5)}\n\t\tCenter ${c.map(f7).join(' ')}\n\t}\n\tLight null\n\tBound null\n\tJoints null\n}`;
}

export type GamePin = { x: number; y: number; icon: string; color: string };

const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => {
  const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

async function deflate(data: Uint8Array): Promise<{ data: Uint8Array; method: 0 | 8 }> {
  if (typeof CompressionStream !== 'function') return { data, method: 0 };
  const out = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return { data: new Uint8Array(out), method: 8 };
}

/* 6 текстур мапи (як пак Hydra) з мітками, намальованими поверх */
async function textures(pins: GamePin[], size: number, pinPx: number, imgs: Map<string, HTMLImageElement | null>): Promise<ZipEntry[]> {
  const [meta, buf] = await Promise.all([fetch('/map/game/export.json').then(r => r.json()), fetch('/map/game/export.bin').then(r => r.arrayBuffer())]);
  const n = new DataView(buf).getUint32(0, true), xy = new Uint16Array(buf, 4, n * 6), col = new Uint8Array(buf, 4 + n * 12, n);
  const W = size * GAME.cols, H = size * GAME.rows;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const s = size / GAME.tile / meta.q;
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.lineWidth = 0.6 / s; ctx.lineJoin = 'round';
  for (let i = 0; i < n;) {   // підряд однакові кольори — одним шляхом; порядок як у файлі (тло, потім передній план)
    const c = col[i]; ctx.beginPath();
    for (; i < n && col[i] === c; i++) { const o = i * 6; ctx.moveTo(xy[o], xy[o + 1]); ctx.lineTo(xy[o + 2], xy[o + 3]); ctx.lineTo(xy[o + 4], xy[o + 5]); ctx.closePath(); }
    ctx.fillStyle = ctx.strokeStyle = meta.palette[c]; ctx.fill(); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = pinPx / 2;
  for (const p of pins) {
    const [px, py] = gamePx(p.x, p.y, size); if (px < 0 || py < 0 || px > W || py > H) continue;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.lineWidth = Math.max(1, pinPx / 12); ctx.strokeStyle = p.color; ctx.stroke();
    const im = imgs.get(p.icon); if (im) ctx.drawImage(im, px - r * 0.72, py - r * 0.72, r * 1.44, r * 1.44);
  }
  const files: ZipEntry[] = [];
  const t = document.createElement('canvas'); t.width = t.height = size; const tc = t.getContext('2d')!;
  for (let row = 0; row < GAME.rows; row++) for (let c = 0; c < GAME.cols; c++) {
    tc.clearRect(0, 0, size, size); tc.drawImage(cv, c * size, row * size, size, size, 0, 0, size, size);
    const b = await new Promise<Blob>((res, rej) => t.toBlob(x => (x ? res(x) : rej(new Error('PNG'))), 'image/png'));
    files.push({ name: 'textures/' + tileName(row, c), data: new Uint8Array(await b.arrayBuffer()) });
  }
  return files;
}

/* растр іконки -> смужки для геометрії */
function runsOf(im: HTMLImageElement | null, n = 24): IconRuns {
  if (!im) return [];
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, n, n);
  try { return iconRuns(x.getImageData(0, 0, n, n).data, n); } catch { return []; }   // чужа картинка без CORS
}

/* список об'єктів частини мапи (minimap_C_R.odd): усі її .odr за алфавітом — без нього гра нові файли не підхопить */
export const oddText = (k: string, odrs: string[]) =>
  `Version 165 32\n{\n${[...new Set(odrs)].sort().map(n => `\tminimap_${k}\\${n}`).join('\n')}\n}`;

/* файли значків для вектора мінікарти: у кожній частині мапи — supertile_fore_C_R_tile_2_2 (далі 2_3…, якщо значків забагато) */
async function iconFiles(pins: GamePin[], sizeM: number, imgs: Map<string, HTMLImageElement | null>, added: Map<string, string[]>, taken: Set<string>): Promise<ZipEntry[]> {
  const runs = new Map<string, IconRuns>(); for (const [src, im] of imgs) runs.set(src, runsOf(im));
  const groups = new Map<string, GamePin[]>();
  for (const p of pins) { const [c, r] = supertileOf(p.x, p.y); const k = c + '_' + r; groups.set(k, [...(groups.get(k) || []), p]); }
  const out: ZipEntry[] = []; const enc = new TextEncoder();
  for (const [k, list] of groups) {
    /* у базі вже лежать назви й зони (tile_2_2, 2_3…) — значки йдуть у наступні вільні файли */
    let part = 2; while (taken.has(`minimap_${k}/supertile_fore_${k}_tile_2_${part}.odr`)) part++;
    let m = new IconMesh();
    const flush = async () => {
      if (!m.size) return;
      const tile = `supertile_fore_${k}_tile_2_${part}`, dir = `minimap_${k}/`;
      const { mesh, min, max } = meshText(m);
      for (const [name, text] of [[`${dir}${tile}/${tile}_high.mesh`, mesh], [`${dir}${tile}.odr`, odrText(tile, min, max)]] as const) {
        const raw = enc.encode(text); const z = await deflate(raw);
        out.push({ name, data: z.data, method: z.method, crc: crc32(raw), size: raw.length });
      }
      added.set(k, [...(added.get(k) || []), tile + '.odr']);
      part++; while (taken.has(`minimap_${k}/supertile_fore_${k}_tile_2_${part}.odr`)) part++;
      m = new IconMesh();
    };
    for (const p of list) { if (m.size > 60000) await flush(); m.add(p.x, p.y, sizeM, p.color, runs.get(p.icon) || []); }
    await flush();
  }
  return out;
}

/* повний пак для гри: наша мапа (експорт Hydra з назвами й зеленими зонами в стилі сайту) + значки вибраних міток + 6 текстур */
export async function buildGamePack(pins: GamePin[], opt: { iconM: number; texSize: number; texPin: number }, step?: (s: string) => void): Promise<Blob> {
  step?.('Завантажую мапу…');
  const res = await fetch('/map/game/base.zip'); if (!res.ok) throw new Error('немає файлів мапи');
  const ab: ArrayBuffer = await res.arrayBuffer();
  const base = readZip(new Uint8Array(ab));
  step?.('Готую значки…');
  const imgs = new Map<string, HTMLImageElement | null>();
  for (const src of new Set(pins.map(p => p.icon))) imgs.set(src, await loadImg(src));
  const added = new Map<string, string[]>();
  const icons = await iconFiles(pins, opt.iconM, imgs, added, new Set(base.map(e => e.name)));
  /* .odd змінених частин: старі .odr з експорту + нові файли значків */
  const enc = new TextEncoder(), odds: ZipEntry[] = [];
  for (const [k, list] of added) {
    const own = base.filter(e => e.name.startsWith(`minimap_${k}/`) && /^minimap_[\d_]+\/[^/]+\.odr$/.test(e.name)).map(e => e.name.split('/')[1]);
    const raw = enc.encode(oddText(k, [...own, ...list])); const z = await deflate(raw);
    odds.push({ name: `minimap_${k}.odd`, data: z.data, method: z.method, crc: crc32(raw), size: raw.length });
  }
  const replaced = new Set(odds.map(e => e.name));
  step?.('Малюю текстури…');
  const tex = await textures(pins, opt.texSize, opt.texPin, imgs);
  step?.('Пакую архів…');
  return new Blob([makeZip([...base.filter(e => !replaced.has(e.name)), ...odds, ...icons, ...tex]) as BlobPart], { type: 'application/zip' });
}
