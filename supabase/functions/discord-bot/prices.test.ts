import { describe, expect, it } from 'vitest';
import { allowed, due, group, partKey, postKey, route, type BuyerInfo, type Ev } from './prices';

const T = (min: number) => new Date(Date.UTC(2026, 10, 4, 12, min)).toISOString();
const ev = (id: number, buyer_id: string, item_id: number, price: number, prev_price: number | null, min: number): Ev =>
  ({ id, buyer_id, item_id, price, prev_price, at: T(min) });
const buyers: BuyerInfo[] = [
  { id: 'fish', name: 'Рибний скупник', sort: 2, next_change_at: null },
  { id: 'hide', name: 'Скупник шкур', sort: 1, next_change_at: null },
];
const items = new Map([[1, 'Шкура оленя'], [2, 'Шкура кабана'], [3, 'Ікра'], [4, 'Окунь']]);

describe('вікно збирання', () => {
  it('чекає, поки від найстарішої події не мине вікно', () => {
    const e = [ev(1, 'hide', 1, 100, 90, 0), ev(2, 'hide', 2, 50, 40, 3)];
    expect(due(e, new Date(T(4)), 5)).toBe(false);
    expect(due(e, new Date(T(5)), 5)).toBe(true);
    expect(due([], new Date(T(60)), 5)).toBe(false);
  });
  it('ліміт пересилань на годину', () => {
    expect(allowed(9, 10)).toBe(true);
    expect(allowed(10, 10)).toBe(false);
  });
});

describe('групування', () => {
  it('кілька змін одного предмета — одна: остання ціна, попередня — з найстарішої', () => {
    const g = group([ev(1, 'hide', 1, 100, 90, 0), ev(2, 'hide', 1, 120, 100, 1), ev(3, 'hide', 1, 110, 120, 2)], buyers, items);
    expect(g).toHaveLength(1);
    expect(g[0].rows).toEqual([{ item_id: 1, name: 'Шкура оленя', price: 110, prev: 90 }]);
  });
  it('скупники в порядку sort, предмети за назвою', () => {
    const g = group([ev(1, 'fish', 4, 30, 25, 0), ev(2, 'hide', 1, 100, 90, 0), ev(3, 'hide', 3, 400, null, 1), ev(4, 'hide', 2, 50, 60, 1)], buyers, items);
    expect(g.map(x => x.buyer.id)).toEqual(['hide', 'fish']);
    expect(g[0].rows.map(r => r.name)).toEqual(['Ікра', 'Шкура кабана', 'Шкура оленя']);
  });
  it('ціна повернулась до попередньої — випадає; скупник без змін — теж', () => {
    const g = group([ev(1, 'hide', 1, 100, 90, 0), ev(2, 'hide', 1, 90, 100, 1), ev(3, 'fish', 4, 30, 25, 0)], buyers, items);
    expect(g.map(x => x.buyer.id)).toEqual(['fish']);
  });
  it('нове (prev null) лишається, навіть якщо потім мінялось', () => {
    const g = group([ev(1, 'hide', 3, 400, null, 0), ev(2, 'hide', 3, 410, 400, 1)], buyers, items);
    expect(g[0].rows[0]).toMatchObject({ price: 410, prev: null });
  });
  it('невідомий скупник чи предмет не ламає групування', () => {
    const g = group([ev(1, 'gone', 9, 5, 4, 0)], buyers, items);
    expect(g[0].buyer.name).toBe('gone');
    expect(g[0].rows[0].name).toBe('Предмет #9');
  });
});

describe('канали скупників', () => {
  it('події розходяться по каналах своїх скупників, без каналу — orphan', () => {
    const ch = new Map([['hide', '111111111111111111'], ['fish', '222222222222222222']]);
    const r = route([ev(1, 'hide', 1, 1, 1, 0), ev(2, 'fish', 4, 1, 1, 0), ev(3, 'meat', 5, 1, 1, 0), ev(4, 'hide', 2, 1, 1, 0)], ch);
    expect([...r.byChannel.keys()]).toEqual(['111111111111111111', '222222222222222222']);
    expect(r.byChannel.get('111111111111111111')!.map(e => e.id)).toEqual([1, 4]);
    expect(r.orphan.map(e => e.id)).toEqual([3]);
  });
  it('два скупники в одному каналі — разом', () => {
    const r = route([ev(1, 'hide', 1, 1, 1, 0), ev(2, 'fish', 4, 1, 1, 0)], new Map([['hide', '1'.repeat(18)], ['fish', '1'.repeat(18)]]));
    expect(r.byChannel.size).toBe(1);
    expect(r.byChannel.get('1'.repeat(18))).toHaveLength(2);
  });
});

describe('ключі публікації', () => {
  it('стабільний ключ вікна — за найменшим id, частини з номером', () => {
    expect(postKey([ev(7, 'hide', 1, 1, 1, 0), ev(5, 'hide', 2, 1, 1, 0)])).toBe('prices:5');
    expect(partKey('prices:5', 0)).toBe('prices:5');
    expect(partKey('prices:5', 1)).toBe('prices:5:2');
  });
});
