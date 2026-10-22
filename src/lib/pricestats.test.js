import { describe, expect, it } from 'vitest';
import { DAY, chartWindow, priceRange, rangePos, series, seriesIn } from './pricestats';
import { kyTs } from './events';
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
        const r = { min: 100, max: 300, from: 'editor' };
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
describe('вікна графіка', () => {
    const now = kyTs(2026, 10, 21, 15, 30);
    it('сьогодні й учора — за київською добою', () => {
        expect(chartWindow('today', now)).toEqual({ from: kyTs(2026, 10, 21, 0, 0), to: now });
        expect(chartWindow('yesterday', now)).toEqual({ from: kyTs(2026, 10, 20, 0, 0), to: kyTs(2026, 10, 21, 0, 0) });
        expect(chartWindow('year', now).to - chartWindow('year', now).from).toBe(365 * DAY);
    });
    it('у вікні вчора — ціна з позавчора стає першою точкою', () => {
        const pts = [{ t: kyTs(2026, 10, 19, 12, 0), p: 100 }, { t: kyTs(2026, 10, 20, 9, 0), p: 120 }, { t: kyTs(2026, 10, 21, 9, 0), p: 130 }];
        const w = chartWindow('yesterday', now);
        expect(seriesIn(pts, w.from, w.to).map(x => x.p)).toEqual([100, 120]);
    });
});
