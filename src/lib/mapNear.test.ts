import { describe, expect, it } from 'vitest';
import { dist, nearest } from './mapNear';
import type { MapMark } from './mapData';

const mk = (id: string, category: string, x: number, y: number, name = id): MapMark => ({ id, category, x, y, name, note: '' });

describe('найближчі мітки від «Ти тут» (specs/014 FR-011)', () => {
  const marks = [mk('far', 'fuel', 3000, 4000), mk('near', 'fuel', 30, 40), mk('mid', 'fuel', -300, 400), mk('shop', 'shop', 1, 1), mk('b', 'fuel', 50, 0), mk('a', 'fuel', 0, -50)];
  it('лише вибрані категорії, найближчі першими, відстань — до 10 м', () => {
    const r = nearest(marks, { x: 0, y: 0 }, new Set(['fuel']), 3);
    expect(r.map(x => x.mark.id)).toEqual(['a', 'b', 'near']);
    expect(r.map(x => x.m)).toEqual([50, 50, 50]);
    expect(nearest(marks, { x: 0, y: 0 }, new Set(['fuel']))[4]).toEqual({ mark: marks[0], m: 5000 });
  });
  it('без категорій чи міток — порожньо', () => {
    expect(nearest(marks, { x: 0, y: 0 }, new Set())).toEqual([]);
    expect(nearest([], { x: 0, y: 0 }, new Set(['fuel']))).toEqual([]);
  });
  it('відстань словами', () => {
    expect(dist(420)).toBe('420 м');
    expect(dist(1260)).toBe('1,3 км');
  });
});
