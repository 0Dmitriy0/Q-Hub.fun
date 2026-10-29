import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOf, readCopy, saveCopy, stale } from './mapCache';

describe('копія мапи для роботи без інтернету (specs/014 US4)', () => {
  const store = new Map<string, string>();
  beforeEach(() => { store.clear(); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } }); });
  afterEach(() => vi.unstubAllGlobals());

  it('зберігається з часом і читається; биті дані чи порожньо — null', () => {
    expect(readCopy()).toBeNull();
    const d = { cats: [], marks: [{ id: 'a', category: 'x', name: 'A', note: '', x: 1, y: 2 }], areas: null, owners: null };
    saveCopy(d, Date.UTC(2026, 9, 29, 12, 5));
    expect(readCopy()).toEqual({ ...d, at: '2026-10-29T12:05:00.000Z' });
    store.set('qhub:map:copy', '{"at":"x","cats":[]}'); expect(readCopy()).toBeNull();
    store.set('qhub:map:copy', 'не json'); expect(readCopy()).toBeNull();
  });
  it('оновлювати з 5 хв', () => {
    expect(stale(0, 4 * 60e3)).toBe(false);
    expect(stale(0, 5 * 60e3)).toBe(true);
  });
  it('«станом на» — київський час', () => {
    expect(asOf('2026-10-29T12:05:00.000Z')).toBe('станом на 29.10, 14:05');
  });
});
