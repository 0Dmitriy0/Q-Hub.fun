import { describe, expect, it } from 'vitest';

import { compress, joaat, ytd, ytdRaw } from './ytd';

/* очікування — з .ytd, які OpenIV на Legacy зберіг після заміни PNG (Enhanced їх приймає цілими файлами) */
describe('.ytd для мінікарти', () => {
  it('хеш імені — joaat', () => {
    expect(joaat('minimap_0_0')).toBe(0x9ca4038f);
    expect(joaat('minimap_sea_0_0')).toBe(0xfb8abdb4);
  });

  it('розмітка як у OpenIV: 512 DXT1 — сторінка 128 КБ, 1024 DXT5 — 1 МБ, lod 128 — 8 КБ', () => {
    const r = ytdRaw('minimap_0_0', 512, 512, 'DXT1', new Uint8Array(131072));
    expect(r.gfxFlags).toBe(0xd0020004); expect(r.raw.length).toBe(139264);
    const v = new DataView(r.raw.buffer);
    expect(v.getUint32(0, true)).toBe(0x40573510); expect(v.getUint32(0x40, true)).toBe(0xb6f0ee97);
    expect(v.getUint32(0x80, true)).toBe(0x20020001); expect(v.getUint16(0x96, true)).toBe(256);
    expect(new TextDecoder().decode(r.raw.subarray(0x98, 0x9c))).toBe('DXT1');
    expect(new TextDecoder().decode(r.raw.subarray(0xf0, 0xfb))).toBe('minimap_0_0'); expect(r.raw[0xfc]).toBe(0xcd);
    expect(v.getUint32(0x100, true)).toBe(0x9ca4038f); expect(v.getUint32(0x110, true)).toBe(0x50000040);
    expect(ytdRaw('minimap_sea_0_0', 1024, 1024, 'DXT5', new Uint8Array(1 << 20)).gfxFlags).toBe(0xd0020007);
    expect(ytdRaw('minimap_lod_128', 128, 128, 'DXT1', new Uint8Array(8192)).gfxFlags).toBe(0xd0020000);
  });

  it('файл: RSC7 версії 13, стиснуті сторінки', async () => {
    const f = await ytd('minimap_lod_128', new Uint8Array(128 * 128 * 4), 128, 128, 'DXT1');
    const v = new DataView(f.buffer);
    expect(new TextDecoder().decode(f.subarray(0, 4))).toBe('RSC7');
    expect([v.getUint32(4, true), v.getUint32(8, true), v.getUint32(12, true)]).toEqual([13, 0x20000, 0xd0020000]);
    const raw = await new Response(new Blob([f.subarray(16) as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    expect(raw.byteLength).toBe(16384);
  });

  it('DXT1: прозорий піксель — індекс 3 у режимі трьох кольорів; суцільний колір — без втрат', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 16; i++) px.set([200, 100, 50, i === 5 ? 0 : 255], i * 4);
    const b = compress(px, 4, 4, 'DXT1'), v = new DataView(b.buffer);
    expect(v.getUint16(0, true)).toBeLessThanOrEqual(v.getUint16(2, true));
    expect(v.getUint32(4, true) >>> 10 & 3).toBe(3);
  });

  it('DXT5: прозорість зберігається на кінцях', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 16; i++) px.set([10, 20, 30, i * 17], i * 4);
    const b = compress(px, 4, 4, 'DXT5');
    expect([b[0], b[1]]).toEqual([255, 0]);
  });
});
