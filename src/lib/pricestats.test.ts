import { describe, expect, it } from 'vitest';
import { DAY, nextKyivAt, priceRange, rangePos, series } from './pricestats';
import { kyHM, kyTs } from './events';

const now = 100 * DAY;
const pts = [{ t: now - 40 * DAY, p: 50 }, { t: now - 10 * DAY, p: 120 }, { t: now - 2 * DAY, p: 200 }, { t: now - DAY, p: 160 }];

describe('priceRange', () => {
  it('межі редактора важливіші за спостережені', () => {
    expect(priceRange(pts, 100, 300, now)).toEqual({ min: 100, max: 300, from: 'editor' });
  });
  it('без меж редактора — мінімум і максимум за 30 днів, стара точка не рахується', () => {
    expect(priceRange(pts, 0, 0, now)).toEqual({ min: 120, max: 200, from: 'seen' });
  });
  it('одна точка чи однакові ціни — меж немає', () => {
    expect(priceRange([{ t: now, p: 5 }], 0, 0, now)).toBeNull();
    expect(priceRange([{ t: now, p: 5 }, { t: now - 1, p: 5 }], 0, 0, now)).toBeNull();
  });
});

describe('rangePos', () => {
  it('рахує відсоток і притискає до країв', () => {
    const r = { min: 100, max: 300, from: 'editor' as const };
    expect(rangePos(260, r)).toBe(80);
    expect(rangePos(50, r)).toBe(0);
    expect(rangePos(999, r)).toBe(100);
    expect(rangePos(0, r)).toBeNull();
  });
});

describe('series', () => {
  it('починає з останньої ціни до періоду і йде за часом', () => {
    const s = series([...pts].reverse(), now);
    expect(s.map(x => x.p)).toEqual([50, 120, 200, 160]);
    expect(s[0].t).toBe(now - 30 * DAY);
  });
});

describe('nextKyivAt', () => {
  const now = kyTs(2026, 10, 21, 20, 30);
  it('час пізніше сьогодні — сьогодні, раніше — завтра', () => {
    expect(nextKyivAt('21:40', now)! - now).toBe(70 * 60000);
    expect(kyHM(nextKyivAt('09:05', now)!)).toBe('09:05');
    expect(nextKyivAt('09:05', now)! - now).toBe((12 * 60 + 35) * 60000);
  });
  it('нісенітниця — null', () => { expect(nextKyivAt('25:00', now)).toBeNull(); expect(nextKyivAt('abc', now)).toBeNull(); });
});
