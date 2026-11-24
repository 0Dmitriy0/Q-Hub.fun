import { describe, expect, it } from 'vitest';
import { buyerView, isFixed, saleLimitText } from './fixedPrices';

describe('скупник із фіксованими цінами (specs/096)', () => {
  it('фіксований: без таймера, меж, голосів, графіка й кнопки «Оновити ціну»', () => {
    const v = buyerView({ fixed_prices: true, sale_limit: 5000, sale_limit_unit: 'кг' });
    expect(v).toMatchObject({ fixed: true, timer: false, limits: false, pending: false, canUpdate: false, chart: false, stale: false });
    expect(v.limit).toMatch(/^5\s?000 кг$/);
  });
  it('звичайний скупник і база до 0082 (полів немає) — усе як раніше', () => {
    for (const b of [{ fixed_prices: false }, {}, null]) {
      expect(buyerView(b)).toMatchObject({ fixed: false, timer: true, limits: true, pending: true, canUpdate: true, chart: true, stale: true, limit: '' });
    }
  });
  it('ліміт продажу показується й у звичайного скупника, ховається без значення', () => {
    expect(saleLimitText({ sale_limit: '300', sale_limit_unit: 'шт' })).toBe('300 шт');
    expect(saleLimitText({ sale_limit: null, sale_limit_unit: 'кг' })).toBe('');
    expect(saleLimitText({ sale_limit: 0 })).toBe('');
    expect(isFixed(undefined)).toBe(false);
  });
});
