/* Готові текстури гри (.ytd, формат Legacy RSC7) замість PNG у «Карті для гри».
   Розкладку взято з файлів, які OpenIV на Legacy зберіг після заміни PNG (перевірено 2026-11-04: їх приймає й GTA V Enhanced,
   якщо перетягнути цілим файлом у scaleform_generic.rpf). Один словник — одна текстура, один рівень mip:
   minimap_R_C і minimap_lod_128 — DXT1 (прозорість 1 біт), minimap_sea_R_C — DXT5 (плавна прозорість моря). */

export type YtdFormat = 'DXT1' | 'DXT5';

/* хеш імені текстури в словнику (joaat, як у грі; ім'я в нижньому регістрі) */
export function joaat(s: string): number {
  let h = 0;
  for (const c of new TextEncoder().encode(s.toLowerCase())) { h = (h + c) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; }
  h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; return (h + (h << 15)) >>> 0;
}

/* ---- стиснення блоками 4×4 ---- */
const to565 = (r: number, g: number, b: number) => ((r * 31 + 127) / 255 << 11) | ((g * 63 + 127) / 255 << 5) | ((b * 31 + 127) / 255);
const from565 = (c: number): [number, number, number] => {
  const r = c >> 11 & 31, g = c >> 5 & 63, b = c & 31;
  return [r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2];
};

/* кольорова частина блоку (8 байт): кінці — межі кольорів уздовж головної діагоналі, трохи всередину.
   holes — DXT1 з прозорими пікселями: режим 3 кольори + прозорий (c0 <= c1, індекс 3) */
function colorBlock(px: Uint8Array, out: Uint8Array, o: number, holes: boolean) {
  const solid: number[] = [];
  for (let i = 0; i < 16; i++) if (!holes || px[i * 4 + 3] >= 128) solid.push(i);
  const dv = new DataView(out.buffer, out.byteOffset + o, 8);
  if (!solid.length) { dv.setUint16(0, 0, true); dv.setUint16(2, 0xffff, true); dv.setUint32(4, 0xffffffff, true); return; }
  const mn = [255, 255, 255], mx = [0, 0, 0], mean = [0, 0, 0];
  for (const i of solid) for (let k = 0; k < 3; k++) { const v = px[i * 4 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); mean[k] += v / solid.length; }
  /* напрям діагоналі: знак коваріації зеленого (найточнішого) з червоним і синім */
  let crg = 0, cbg = 0;
  for (const i of solid) { const g = px[i * 4 + 1] - mean[1]; crg += (px[i * 4] - mean[0]) * g; cbg += (px[i * 4 + 2] - mean[2]) * g; }
  if (crg < 0) [mn[0], mx[0]] = [mx[0], mn[0]];
  if (cbg < 0) [mn[2], mx[2]] = [mx[2], mn[2]];
  for (let k = 0; k < 3; k++) { const d = (mx[k] - mn[k]) / 16; mn[k] += d; mx[k] -= d; }
  let best = fit(px, holes, mx, mn);
  /* уточнення кінців найменшими квадратами за вибраними індексами (як у stb_dxt): двічі, лишаємо краще */
  for (let it = 0; it < 2; it++) {
    const W = holes ? [1, 0, 0.5] : [1, 0, 2 / 3, 1 / 3];
    let aa = 0, ab = 0, bb = 0; const ax = [0, 0, 0], bx = [0, 0, 0];
    for (const i of solid) {
      const w = W[best.sel[i]] ?? 0.5, u = 1 - w;
      aa += w * w; ab += w * u; bb += u * u;
      for (let k = 0; k < 3; k++) { ax[k] += w * px[i * 4 + k]; bx[k] += u * px[i * 4 + k]; }
    }
    const det = aa * bb - ab * ab; if (Math.abs(det) < 1e-6) break;
    const cl = (x: number) => Math.min(255, Math.max(0, x));
    const A = ax.map((x, k) => cl((x * bb - bx[k] * ab) / det)), B = bx.map((x, k) => cl((x * aa - ax[k] * ab) / det));
    const next = fit(px, holes, A, B);
    if (next.err >= best.err) break;
    best = next;
  }
  dv.setUint16(0, best.c0, true); dv.setUint16(2, best.c1, true); dv.setUint32(4, best.idx, true);
}

/* кінці -> палітра 565 і найближчий колір кожного пікселя; sel[i] — індекс у порядку «a, b, між» до перестановки кінців */
function fit(px: Uint8Array, holes: boolean, hi: number[], lo: number[]) {
  let c0 = to565(hi[0], hi[1], hi[2]), c1 = to565(lo[0], lo[1], lo[2]), swap = false;
  if (holes ? c0 > c1 : c0 < c1) { [c0, c1] = [c1, c0]; swap = true; }
  const a = from565(c0), b = from565(c1);
  const pal = holes || c0 === c1
    ? [a, b, a.map((v, k) => (v + b[k]) >> 1)]
    : [a, b, a.map((v, k) => (2 * v + b[k]) / 3 | 0), a.map((v, k) => (v + 2 * b[k]) / 3 | 0)];
  /* sel — вага відносно hi: після перестановки 0↔1 і 2↔3 міняються місцями */
  const back = swap ? (holes ? [1, 0, 2] : [1, 0, 3, 2]) : [0, 1, 2, 3];
  const sel = new Array<number>(16).fill(0); let idx = 0, err = 0;
  for (let i = 15; i >= 0; i--) {
    let j = 0;
    if (holes && px[i * 4 + 3] < 128) j = 3;
    else {
      let bd = Infinity;
      pal.forEach((p, n) => { const d = (p[0] - px[i * 4]) ** 2 + (p[1] - px[i * 4 + 1]) ** 2 + (p[2] - px[i * 4 + 2]) ** 2; if (d < bd) { bd = d; j = n; } });
      err += bd; sel[i] = back[j];
    }
    idx = (idx << 2 | j) >>> 0;
  }
  return { c0, c1, idx, err, sel };
}

/* прозорість DXT5 (8 байт): 8 рівнів між найбільшою й найменшою */
function alphaBlock(px: Uint8Array, out: Uint8Array, o: number) {
  let lo = 255, hi = 0;
  for (let i = 0; i < 16; i++) { lo = Math.min(lo, px[i * 4 + 3]); hi = Math.max(hi, px[i * 4 + 3]); }
  out[o] = hi; out[o + 1] = lo;
  const pal = [hi, lo]; for (let j = 1; j < 7; j++) pal.push(hi === lo ? hi : ((7 - j) * hi + j * lo) / 7 | 0);
  let bits = 0n;
  for (let i = 15; i >= 0; i--) {
    const a = px[i * 4 + 3]; let best = 0, bd = Infinity;
    pal.forEach((p, j) => { const d = Math.abs(p - a); if (d < bd) { bd = d; best = j; } });
    bits = bits << 3n | BigInt(best);
  }
  for (let k = 0; k < 6; k++) out[o + 2 + k] = Number(bits >> BigInt(8 * k) & 0xffn);
}

/* RGBA (як getImageData) -> блоки DXT; сторони кратні 4 */
export function compress(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, fmt: YtdFormat): Uint8Array {
  const bs = fmt === 'DXT1' ? 8 : 16, out = new Uint8Array((w / 4) * (h / 4) * bs), px = new Uint8Array(64);
  let o = 0;
  for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4) {
    for (let y = 0; y < 4; y++) px.set(rgba.subarray(((by + y) * w + bx) * 4, ((by + y) * w + bx + 4) * 4), y * 16);
    if (fmt === 'DXT5') { alphaBlock(px, out, o); colorBlock(px, out, o + 8, false); }
    else colorBlock(px, out, o, true);
    o += bs;
  }
  return out;
}

/* ---- файл ресурсу ---- */
const SYS = 0x2000;          // системна сторінка: словник, опис текстури, ім'я — укладаються в 8 КБ
const SYS_FLAGS = 0x20000;   // одна сторінка 0x200 << 4
const P_SYS = 0x50000000, P_GFX = 0x60000000;

/* розпакований вміст .ytd: системна сторінка + графічна (дані текстури), обидві — у розмірах сторінок RSC7 */
export function ytdRaw(name: string, w: number, h: number, fmt: YtdFormat, data: Uint8Array): { raw: Uint8Array; gfxFlags: number } {
  let shift = 0; while ((0x2000 << shift) < data.length) shift++;
  const gfx = 0x2000 << shift, raw = new Uint8Array(SYS + gfx);
  raw.fill(0xcd, 0xe0, SYS);   // так OpenIV лишає вільне місце сторінки
  const v = new DataView(raw.buffer);
  const u64 = (o: number, x: number) => { v.setUint32(o, x >>> 0, true); v.setUint32(o + 4, Math.floor(x / 2 ** 32), true); };
  /* pgDictionary<grcTexture> */
  u64(0x00, 0x140573510); u64(0x08, P_SYS + 0xd0); u64(0x18, 1);
  u64(0x20, P_SYS + 0x100); v.setUint16(0x28, 1, true); v.setUint16(0x2a, 1, true);   // хеші імен
  u64(0x30, P_SYS + 0x110); v.setUint16(0x38, 1, true); v.setUint16(0x3a, 1, true);   // вказівники на текстури
  /* grcTexturePC */
  v.setUint32(0x40, 0xb6f0ee97, true); u64(0x68, P_SYS + 0xf0);
  v.setUint32(0x70, 0x00300001, true); v.setUint32(0x80, (0x20000000 | data.length | 1) >>> 0, true);
  v.setUint16(0x90, w, true); v.setUint16(0x92, h, true); v.setUint16(0x94, 1, true);
  v.setUint16(0x96, w * (fmt === 'DXT1' ? 4 : 8) / 8, true);
  raw.set(new TextEncoder().encode(fmt), 0x98); raw[0x9d] = 1;   // рівнів mip
  u64(0xb0, P_GFX);
  raw[0xd8] = 1; raw[0xd9] = 1;   // сторінок: системних, графічних
  const nm = new TextEncoder().encode(name); if (nm.length > 15) throw new Error('задовге ім\'я текстури: ' + name);
  raw.set(nm, 0xf0); raw[0xf0 + nm.length] = 0;
  v.setUint32(0x100, joaat(name), true);
  u64(0x110, P_SYS + 0x40);
  raw.set(data, SYS);
  return { raw, gfxFlags: (0xd0000000 | 1 << 17 | shift) >>> 0 };
}

async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'function') throw new Error('Браузер не вміє стискати файли — онови його');
  return new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

/* .ytd з однією текстурою: заголовок RSC7 (версія 13) + стиснуті сторінки */
export async function ytd(name: string, rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, fmt: YtdFormat): Promise<Uint8Array> {
  const { raw, gfxFlags } = ytdRaw(name, w, h, fmt, compress(rgba, w, h, fmt));
  const z = await deflateRaw(raw), out = new Uint8Array(16 + z.length), v = new DataView(out.buffer);
  out.set([0x52, 0x53, 0x43, 0x37]); v.setUint32(4, 13, true); v.setUint32(8, SYS_FLAGS, true); v.setUint32(12, gfxFlags, true);
  out.set(z, 16);
  return out;
}
