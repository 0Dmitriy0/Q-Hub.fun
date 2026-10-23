import { describe, expect, it } from 'vitest';
import { pos, search, type BarPrice } from './barSearch';

const p = (item: string, buyer: string, price: number, min = 0, max = 0): BarPrice => ({ item, unit: 'шт', icon: '', buyer, buyerIcon: '', price, min, max, at: null });
const prices = [p('Глива', 'Гриби', 120, 100, 200), p('Глива', 'Харчі', 150), p('Гарбуз', 'Врожай', 900), p('Сироїжка зелена', 'Гриби', 460), p('Шкура кабана', 'Шкури', 600)];

describe('пошук цін у плашці', () => {
  it('групує скупників товару, найкращий — першим', () => {
    const [g] = search(prices, 'глива', {});
    expect(g.item).toBe('Глива');
    expect(g.best?.buyer).toBe('Харчі');
    expect(g.buyers.map(b => b.buyer)).toEqual(['Харчі', 'Гриби']);
  });
  it('спершу назви, що починаються з запиту; шукає й за скупником', () => {
    expect(search(prices, 'г', {}).map(f => f.item).slice(0, 2)).toEqual(['Гарбуз', 'Глива']);
    expect(search(prices, 'гриби', {}).map(f => f.item)).toEqual(['Глива', 'Сироїжка зелена']);
    expect(search(prices, 'шкура каб', {}).map(f => f.item)).toEqual(['Шкура кабана']);
  });
  it('порожній запит — те, що на складі, дорожчий запас першим', () => {
    expect(search(prices, '', { 'Глива': 10, 'Гарбуз': 1, 'Нема': 5 }).map(f => [f.item, f.have])).toEqual([['Глива', 10], ['Гарбуз', 1]]);
    expect(search(prices, '  ', {})).toEqual([]);
  });
  it('положення ціни в межах', () => {
    expect(pos(p('A', 'X', 150, 100, 200))).toBe(50);
    expect(pos(p('A', 'X', 150))).toBeNull();
  });
});
