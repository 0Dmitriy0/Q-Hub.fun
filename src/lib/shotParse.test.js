import { describe, expect, it } from 'vitest';
import { detectBuyer, parseShot, readPrice } from './shotParse';
import ocr from './fixtures/shot-ocr.json';
import catalog from './fixtures/catalog.json';
const items = catalog;
const shot = (n) => ocr[n];
const run = (n) => {
    const buyer = detectBuyer(shot(n), items);
    const rows = parseShot(shot(n), items.filter(i => i.buyer_id === buyer));
    return { buyer, got: Object.fromEntries(rows.filter(r => r.item && r.price).map(r => [r.item.name, r.price])), rows };
};
describe('ціни зі скріншота скупника (реальні скріни з гри)', () => {
    it('читає ціну в різних записах', () => {
        expect(readPrice('Продати $485')).toBe(485);
        expect(readPrice('7 Продати $1 10')).toBe(110);
        expect(readPrice('Продати 140')).toBe(140);
        expect(readPrice('Роздерта шкура кролика')).toBeNull();
    });
    it('мотлох: усі 10 товарів, латиниця на місці кирилиці не заважає', () => {
        const { buyer, got } = run('12');
        expect(buyer).toBe('junk');
        expect(got).toEqual({ eCola: 32, Шоколадка: 30, Бургер: 23, Пиво: 79, Мінералка: 55, Сигара: 37, Горілка: 83, Вино: 45, Кастет: 170, 'Розбита пляшка': 70 });
    });
    it('шкури: 10 схожих назв не плутаються', () => {
        const { buyer, got } = run('13');
        expect(buyer).toBe('hide');
        expect(got).toEqual({
            'Роздерта шкура кролика': 485, 'Груба шкура кролика': 552, 'Цілісна шкура кролика': 654, 'Бездоганна шкура кролика': 895,
            'Роздерта шкура оленя': 573, 'Груба шкура оленя': 609, 'Цілісна шкура оленя': 750, 'Бездоганна шкура оленя': 754,
            'Роздерта шкура кабана': 499, 'Груба шкура кабана': 353
        });
    });
    it('риба: впізнане — правильне; що не впізналось, лишається без товару, а не з чужою ціною', () => {
        const { buyer, got, rows } = run('14');
        expect(buyer).toBe('fish');
        const truth = { Окунь: 256, Оселедець: 86, Скумбрія: 140, Кефаль: 110, Горбуша: 110, Тріска: 132, Тунець: 113, Сібас: 315, Дорадо: 275, Форель: 256 };
        for (const [name, p] of Object.entries(got))
            expect(p).toBe(truth[name]);
        expect(Object.keys(got).length).toBeGreaterThanOrEqual(8);
        expect(rows.length).toBeGreaterThanOrEqual(10); // кожна ціна є в таблиці — невпізнану гравець підбере сам
    });
    it('паливо', () => {
        const { buyer, got } = run('15');
        expect(buyer).toBe('fuel');
        expect(got).toEqual({ Бензин: 351, Дизель: 405, Гас: 327 });
    });
});
