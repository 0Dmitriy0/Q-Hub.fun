import { describe, expect, it } from 'vitest';
import { pinPreview } from './pinPreview';
import { TILE, toPx, PX_PER_M } from '../lib/mapGeo';

describe('шматок мапи у формі мітки (specs/083 US2)', () => {
  it('позначка в центрі квадрата', () => {
    expect(pinPreview(200, -900, 240).pin).toEqual({ left: 120, top: 120 });
  });
  it('плитки покривають увесь квадрат', () => {
    const size = 240, p = pinPreview(200, -900, size);
    for (const [cx, cy] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1], [120, 120]])
      expect(p.tiles.some(t => cx >= t.left && cx < t.left + TILE && cy >= t.top && cy < t.top + TILE)).toBe(true);
    expect(p.tiles.length).toBeGreaterThanOrEqual(1);
    expect(p.tiles.length).toBeLessThanOrEqual(4);
  });
  it('точка в центрі квадрата відповідає координатам гри', () => {
    const [px, py] = toPx(1889, 2606), p = pinPreview(1889, 2606), t = p.tiles[0];
    /* піксель мапи під центром = верхній лівий кут плитки + зсув від її краю */
    expect(t.tx * TILE + (120 - t.left)).toBeCloseTo(px, 0);
    expect(t.ty * TILE + (120 - t.top)).toBeCloseTo(py, 0);
  });
  it('біля краю мапи — плитки поза мапою відкинуто', () => {
    const p = pinPreview(-5996, 8470);   // лівий верхній кут мапи
    expect(p.tiles.every(t => t.tx >= 0 && t.ty >= 0)).toBe(true);
    expect(p.tiles.length).toBe(1);
  });
  it('масштаб — 0,78 м на піксель', () => {
    expect(1 / PX_PER_M).toBeCloseTo(0.78, 2);
  });
});
