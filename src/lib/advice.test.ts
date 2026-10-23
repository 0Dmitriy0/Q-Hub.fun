import { describe, expect, it } from 'vitest';
import { advise, stockValue, topPaying, type BuyerPrice, type Held } from './advice';

const now = Date.parse('2026-10-23T12:00:00Z');
const fresh = new Date(now - 36e5).toISOString();
const p = (buyer: string, item: string, price: number, min = 0, max = 0, at: string | null = fresh): BuyerPrice => ({ buyer, item, price, min, max, at });
const h = (name: string, qty: number, boughtQty = 0, avg = 0): Held => ({ name, qty, boughtQty, boughtCost: boughtQty * avg, avg });

describe('advise', () => {
  it('найкращий скупник, вартість і прибуток проти собівартості', () => {
    const [a] = advise([h('Глива', 100, 40, 120)], [p('Ферма', 'Глива', 200), p('Ринок', 'глива ', 250)], now);
    expect(a).toMatchObject({ item: 'Глива', buyer: 'Ринок', price: 250, value: 25000, profit: 40 * 130, pos: null, sell: false, stale: false });
  });
  it('зелена зона — від 80% діапазону; спершу те, що варто здати', () => {
    const r = advise([h('A', 1), h('B', 1)], [p('X', 'A', 1000, 0, 2000), p('X', 'B', 90, 0, 100)], now);
    expect(r.map(x => [x.item, x.pos, x.sell])).toEqual([['B', 90, true], ['A', 50, false]]);
  });
  it('нафармлене — без прибутку; товар без ціни не показується; стара ціна позначається', () => {
    const r = advise([h('A', 5), h('Нема', 3)], [p('X', 'A', 10, 0, 0, new Date(now - 4 * 36e5).toISOString()), p('Y', 'A', 0)], now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ profit: null, stale: true, value: 50 });
  });
});

describe('topPaying', () => {
  it('спершу свіжі ціни, ближчі до максимуму; без меж — не показується', () => {
    const r = topPaying([p('X', 'A', 90, 0, 100), p('X', 'B', 99, 0, 100, null), p('Y', 'C', 50, 0, 100), p('Y', 'D', 500)], 6, now);
    expect(r.map(t => [t.item, t.pos, t.stale])).toEqual([['A', 90, false], ['C', 50, false], ['B', 99, true]]);
  });
});

describe('stockValue', () => {
  it('мін / зараз / макс за найкращим скупником; без меж — ціна зараз', () => {
    expect(stockValue([h('A', 2), h('B', 1)], [p('X', 'A', 100, 50, 200), p('Y', 'A', 80, 0, 300), p('X', 'B', 10)])).toEqual({ min: 110, now: 210, max: 410 });
  });
});
