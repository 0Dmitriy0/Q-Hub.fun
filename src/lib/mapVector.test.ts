import { describe, expect, it } from 'vitest';
import { cellOf, parseChunk } from './mapChunk';

describe('векторна мапа', () => {
  it('тайл z7+ лежить в одному шматку 800 м', () => {
    expect(cellOf(7, 0, 0)).toEqual([0, 0]);
    expect(cellOf(7, 7, 15)).toEqual([0, 1]);   // 8 тайлів z7 = 800 м
    expect(cellOf(9, 32, 31)).toEqual([1, 0]);
  });
  it('розбір файлу шматка', () => {
    const b = new ArrayBuffer(4 + 12 + 1); new DataView(b).setUint32(0, 1, true);
    new Uint16Array(b, 4, 6).set([1, 2, 3, 4, 5, 6]); new Uint8Array(b, 16, 1)[0] = 7;
    const c = parseChunk(b);
    expect(c.n).toBe(1); expect([...c.xy]).toEqual([1, 2, 3, 4, 5, 6]); expect(c.c[0]).toBe(7);
  });
});
