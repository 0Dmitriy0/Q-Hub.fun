import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOf, readCopy, saveCopy, stale } from './mapCache';

describe('копія мапи для роботи без інтернету (specs/014 US4)', () => {
  const store = new Map<string, string>();
  beforeEach(() => { store.clear(); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } }); });
  afterEach(() => vi.unstubAllGlobals());

  it('зберігається з часом і читається; биті дані чи порожньо — null', () => {
    expect(readCopy()).toBeNull();
    const d = { cats: [], marks: [{ id: 'a', category: 'x', name: 'A', note: '', x: 1, y: 2 }], areas: null, labels: [], owners: null };
    saveCopy(d, Date.UTC(2026, 9, 29, 12, 5));
    expect(readCopy()).toEqual({ ...d, at: '2026-10-29T12:05:00.000Z' });
    store.set('qhub:map:copy', '{"at":"x","cats":[]}'); expect(readCopy()).toBeNull();
    store.set('qhub:map:copy', 'не json'); expect(readCopy()).toBeNull();
  });
  it('копія до specs/088 (зони без animals) читається з порожніми звірами, а не ламає мапу', () => {
    store.set('qhub:map:copy', JSON.stringify({ at: '2026-11-15T10:00:00.000Z', cats: [], marks: [], owners: null,
      areas: [{ id: 'area-1', dbId: 1, category: 'hunting-fields', name: 'Поле полювання 1', note: '', ring: [[0, 0], [1, 0], [0, 1]] },
        { id: 'area-2', dbId: 2, category: 'hunting-fields', name: 'Поле полювання 2', note: '', ring: [[0, 0], [1, 0], [0, 1]], animals: ['boar', 'wolf', 'deer'] }] }));
    expect(readCopy()?.areas?.map(a => a.animals)).toEqual([[], ['deer', 'boar']]);
  });
  it('копія до specs/089 (без написів) читається з порожнім списком написів', () => {
    store.set('qhub:map:copy', JSON.stringify({ at: '2026-11-15T10:00:00.000Z', cats: [], marks: [], areas: null, owners: null }));
    expect(readCopy()?.labels).toEqual([]);
  });
  it('оновлювати з 5 хв', () => {
    expect(stale(0, 4 * 60e3)).toBe(false);
    expect(stale(0, 5 * 60e3)).toBe(true);
  });
  it('«станом на» — київський час', () => {
    expect(asOf('2026-10-29T12:05:00.000Z')).toBe('станом на 29.10, 14:05');
  });
});
