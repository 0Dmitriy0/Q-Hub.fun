import { describe, expect, it } from 'vitest';
import { buyers, pos, search, type BarPrice } from './barSearch';

const p = (item: string, buyer: string, price: number, min = 0, max = 0): BarPrice => ({ item, unit: 'шт', icon: '', buyer, buyerIcon: '', price, min, max, at: null });
const prices = [p('Глива', 'Гриби', 120, 100, 200), p('Глива', 'Харчі', 150), p('Гарбуз', 'Врожай', 900), p('Сироїжка зелена', 'Гриби', 460), p('Шкура кабана', 'Шкури', 600), p('Шкура кролика', 'Шкури', 500)];

describe('скупник у плашці цін', () => {
  it('«скупщик шкур» відкриває скупника з усіма його товарами', () => {
    const [b, ...rest] = buyers(prices, 'скупщик шкур', {});
    expect(b.buyer).toBe('Шкури');
    expect(b.items.map(i => i.item)).toEqual(['Шкура кабана', 'Шкура кролика']);
    expect(rest).toEqual([]);
  });
  it('назвав товар — скупники, що його беруть, дорожчий першим', () => {
    expect(buyers(prices, 'глива', {}).map(b => b.buyer)).toEqual(['Харчі', 'Гриби']);
  });
  it('товари зі складу — вгорі списку скупника', () => {
    const [b] = buyers(prices, 'гриби', { 'Сироїжка зелена': 3 });
    expect(b.items.map(i => [i.item, i.have])).toEqual([['Сироїжка зелена', 3], ['Глива', 0]]);
  });
  it('порожній запит чи лише «скупник» — нічого не відкриває', () => {
    expect(buyers(prices, '  ', {})).toEqual([]);
    expect(buyers(prices, 'скупник', {})).toEqual([]);
  });
  it('положення ціни в межах', () => {
    expect(pos(p('A', 'X', 150, 100, 200))).toBe(50);
    expect(pos(p('A', 'X', 150))).toBeNull();
  });
});

describe('товари зі скупниками (для «що продати?»)', () => {
  it('групує скупників товару, найкращий — першим', () => {
    const [g] = search(prices, 'глива', {});
    expect(g.best?.buyer).toBe('Харчі');
    expect(g.buyers.map(b => b.buyer)).toEqual(['Харчі', 'Гриби']);
    expect(search(prices, 'шкура каб', {}).map(f => f.item)).toEqual(['Шкура кабана']);
  });
  it('порожній запит — те, що на складі, дорожчий запас першим', () => {
    expect(search(prices, '', { 'Глива': 10, 'Гарбуз': 1, 'Нема': 5 }).map(f => [f.item, f.have])).toEqual([['Глива', 10], ['Гарбуз', 1]]);
  });
});
