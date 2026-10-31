import { describe, expect, it } from 'vitest';
import { buyers, places, pos, search, type BarPrice } from './barSearch';

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
  describe('м\'ясо після шкур (specs/028, US2)', () => {
    const s = (item: string, sub: string) => ({ ...p(item, 'Шкури', 100), sub });
    const hide = [s("М'ясо оленя", "М'ясо"), s('Груба шкура кабана', 'Шкури'), s("М'ясо кабана", "М'ясо"), s('Бездоганна шкура оленя', 'Шкури'), s('Цілісна шкура кабана', 'Шкури')];
    const names = (stock: Record<string, number>) => buyers(hide, 'шкури', stock)[0].items.map(i => i.item);
    it('порожній склад — усі шкури, потім усе м\'ясо', () => {
      expect(names({})).toEqual(['Бездоганна шкура оленя', 'Груба шкура кабана', 'Цілісна шкура кабана', "М'ясо кабана", "М'ясо оленя"]);
    });
    it('зі складу — шкура, потім м\'ясо; далі решта шкур, далі решта м\'яса', () => {
      expect(names({ "М'ясо оленя": 2, 'Груба шкура кабана': 1 })).toEqual(['Груба шкура кабана', "М'ясо оленя", 'Бездоганна шкура оленя', 'Цілісна шкура кабана', "М'ясо кабана"]);
    });
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

describe('місця на мапі в рядку Alt+Q (specs/014 FR-007)', () => {
  const cats = [{ id: 'fuel', name: 'Заправки', icon: '/i/fuel.svg' }, { id: 'shop', name: 'Магазини 24/7', icon: '/i/shop.svg' }, { id: 'med', name: 'Лікарні', icon: '/i/med.svg' }];
  const marks = [
    { id: 'a', name: 'Заправка Globe Oil', category: 'fuel', x: 1, y: 2 },
    { id: 'b', name: '', category: 'fuel', x: 3, y: 4 },
    { id: 'c', name: '24/7 Інноченс', category: 'shop', x: 5, y: 6, icon: '/i/own.svg' },
    { id: 'd', name: 'Лікарня Пілбокс', category: 'med', x: 7, y: 8 },
    { id: 'e', name: 'Таємне', category: 'немає', x: 0, y: 0 },
  ];
  it('за назвою категорії й мітки; збіг назви мітки — першим; безіменна мітка — з назвою категорії', () => {
    const r = places('заправка', marks, cats);
    expect(r.map(h => h.id)).toEqual(['a', 'b']);
    expect(r[1]).toEqual({ id: 'b', name: 'Заправки', cat: 'Заправки', icon: '/i/fuel.svg', x: 3, y: 4 });
  });
  it('«24/7», «де лікарня», «заправки» — слова-заповнювачі й закінчення не заважають', () => {
    expect(places('24/7', marks, cats).map(h => h.id)).toEqual(['c']);
    expect(places('24/7', marks, cats)[0].icon).toBe('/i/own.svg');
    expect(places('де лікарня', marks, cats).map(h => h.id)).toEqual(['d']);
    expect(places('заправки', marks, cats).length).toBe(2);
  });
  it('порожній запит чи лише заповнювачі — нічого; мітки без категорії — ні; не більше limit', () => {
    expect(places('', marks, cats)).toEqual([]);
    expect(places('де на мапі', marks, cats)).toEqual([]);
    expect(places('таємне', marks, cats)).toEqual([]);
    expect(places('а', [...marks, ...marks.map(m => ({ ...m, id: m.id + '2' }))], cats, 3).length).toBeLessThanOrEqual(3);
  });
});
