import { describe, expect, it } from 'vitest';
import { isSellQuestion, sellAdvice } from './sellAdvice';
import type { BarPrice } from './barSearch';

const p = (item: string, buyer: string, price: number): BarPrice => ({ item, unit: 'шт', icon: '', buyer, buyerIcon: '', price, min: 0, max: 0, at: null });
const PRICES = [p('Глива', 'Харчі', 120), p('Глива', 'Ринок Сенді', 150), p('Метал', 'Сенді', 1500), p('Метал', 'Палето', 1400), p('Шкура', 'Шкури', 900), p('Риба', 'Рибу', 0)];

describe('що продати зі складу', () => {
  it('найдорожче разом — першим, з найкращим скупником і другим за ціною', () => {
    const r = sellAdvice(PRICES, { 'Глива': 100, 'Метал': 3, 'Шкура': 20, 'Риба': 50 });
    expect(r.map(x => x.item)).toEqual(['Шкура', 'Глива', 'Метал']);
    expect(r[1]).toMatchObject({ buyer: 'Ринок Сенді', price: 150, total: 15000, next: { buyer: 'Харчі', price: 120 } });
    expect(r[0].next).toBeNull();
  });
  it('товар без ціни скупника й порожній склад не радить', () => {
    expect(sellAdvice(PRICES, { 'Риба': 50 })).toEqual([]);
    expect(sellAdvice(PRICES, {})).toEqual([]);
  });
  it('розпізнає питання, але не запис із сумою', () => {
    for (const t of ['що продати?', 'Що вигідно здати', 'куди здати склад', 'кому продати']) expect(isSellQuestion(t)).toBe(true);
    for (const t of ['продав 10 гливи 1500', 'правила продажу авто', 'здав метал 15к']) expect(isSellQuestion(t)).toBe(false);
  });
});
