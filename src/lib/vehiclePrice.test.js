import { describe, expect, it } from 'vitest';
import { priceKind, priceSortKey, salonLabel } from './vehiclePrice';
import { fmt, money } from './format';
describe('ціна транспорту з валютою', () => {
    it('ігрова, донатна, ексклюзив', () => {
        expect(salonLabel({ price: 300000, salon_price: 300000, currency: 'game' })).toBe(money(300000));
        expect(salonLabel({ price: 0, salon_price: 15000, currency: 'donate' })).toBe(fmt(15000) + ' донат');
        expect(salonLabel({ price: 150000, salon_price: null, exclusive: true })).toBe('Ексклюзив');
        expect(priceKind({ price: 0, salon_price: 15000, currency: 'donate' })).toBe('donate');
    });
    it('сортування: ігрова → донатна → ексклюзив', () => {
        const k = [{ price: 0, salon_price: 15000, currency: 'donate' }, { price: 1, exclusive: true }, { price: 300000, salon_price: 300000 }].map(priceSortKey);
        expect(k.map(x => x[0])).toEqual([1, 2, 0]);
    });
});
