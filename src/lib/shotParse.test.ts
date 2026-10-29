import { describe, expect, it } from 'vitest';
import { detectBuyer, mergeFrames, parseShot, readPrice, type CatalogItem, type OcrLine, type ShotRow } from './shotParse';
import ocr from './fixtures/shot-ocr.json';
import catalog from './fixtures/catalog.json';

const items = catalog as CatalogItem[];
const shot = (n: string) => (ocr as Record<string, OcrLine[]>)[n];
const run = (n: string) => {
  const buyer = detectBuyer(shot(n), items)!;
  const rows = parseShot(shot(n), items.filter(i => i.buyer_id === buyer));
  return { buyer, got: Object.fromEntries(rows.filter(r => r.item && r.price).map(r => [r.item!.name, r.price])), rows };
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
    const truth: Record<string, number> = { Окунь: 256, Оселедець: 86, Скумбрія: 140, Кефаль: 110, Горбуша: 110, Тріска: 132, Тунець: 113, Сібас: 315, Дорадо: 275, Форель: 256 };
    for (const [name, p] of Object.entries(got)) expect(p).toBe(truth[name]);
    expect(Object.keys(got).length).toBeGreaterThanOrEqual(8);
    expect(rows.length).toBeGreaterThanOrEqual(10);   // кожна ціна є в таблиці — невпізнану гравець підбере сам
  });
  it('паливо', () => {
    const { buyer, got } = run('15');
    expect(buyer).toBe('fuel');
    expect(got).toEqual({ Бензин: 351, Дизель: 405, Гас: 327 });
  });
});

describe('ціни з відео: зведення кадрів', () => {
  const a: CatalogItem = { id: 1, name: 'Акула', buyer_id: 'fish' }, b: CatalogItem = { id: 2, name: 'Скат', buyer_id: 'fish' };
  const r = (item: CatalogItem | null, price: number | null, score = 0.9): ShotRow => ({ item, read: item?.name || '', price, score });
  it('бере ціну, що повторюється найчастіше, і товари з усіх кадрів', () => {
    const out = mergeFrames([[r(a, 446)], [r(a, 448), r(b, 120)], [r(a, 446), r(b, null)], [r(null, 999)]]);
    expect(out.map(x => [x.item!.id, x.price])).toEqual([[1, 446], [2, 120]]);
  });
  it('при рівній кількості — ціна з пізнішого кадру; без жодної ціни — null', () => {
    expect(mergeFrames([[r(a, 440)], [r(a, 446)]])[0].price).toBe(446);
    expect(mergeFrames([[r(b, null)]])[0].price).toBeNull();
  });
});

describe('обрізані краєм списку рядки (specs/024, US3)', () => {
  const cat: CatalogItem[] = [{ id: 1, name: 'Шкура оленя', buyer_id: 'hide' }, { id: 2, name: 'Шкура кабана', buyer_id: 'hide' }];
  const L = (text: string, y: number, h?: number): OcrLine => ({ text, y, col: 0, ...(h === undefined ? {} : { h }) });
  const got = (ls: OcrLine[]) => Object.fromEntries(parseShot(ls, cat).filter(r => r.item && r.price).map(r => [r.item!.name, r.price]));

  it('ціна, обрізана нижнім краєм, не дає ціни', () => {
    expect(got([L('Шкура оленя', 0, 40), L('Продати $485', 60, 30), L('Шкура кабана', 200, 40), L('Продати $3', 260, 12)]))
      .toEqual({ 'Шкура оленя': 485 });
  });
  it('назва, обрізана верхнім краєм, не дає ціни навіть із цілою ціною під нею', () => {
    expect(got([L('Шкура оле', 0, 14), L('Продати $485', 60, 30), L('Шкура кабана', 200, 40), L('Продати $610', 260, 30)]))
      .toEqual({ 'Шкура кабана': 610 });
  });
  it('рядки без висоти (сайт, старі виклики) не відкидаються', () => {
    expect(got([L('Шкура оленя', 0), L('Продати $485', 60)])).toEqual({ 'Шкура оленя': 485 });
  });
});

describe('обрізаний рядок не дає ціні прилипнути до чужої назви (жива гра 2026-10-29)', () => {
  const cat: CatalogItem[] = [{ id: 95, name: 'Роздерта шкура койота', buyer_id: 'hide' }, { id: 111, name: 'Роздерта шкура корови', buyer_id: 'hide' }];
  const L = (text: string, y: number, h: number): OcrLine => ({ text, y, col: 0, h });
  it('ціна після обрізаної назви не дістається попередньому товару без ціни', () => {
    const got = (ls: OcrLine[]) => Object.fromEntries(parseShot(ls, cat).filter(r => r.item && r.price).map(r => [r.item!.name, r.price]));
    /* низька, але чітка назва — своя ціна; койот чужої не отримує */
    expect(got([L('Роздерта шкура койота', 0, 40), L('Продати $4', 60, 10), L('Роздерта шкура корови', 200, 12), L('Продати $423', 260, 30), L('Ще рядок', 300, 30)]))
      .toEqual({ 'Роздерта шкура корови': 423 });
    /* справді обрізана назва (нечитка) — нікому */
    expect(got([L('Роздерта шкура койота', 0, 40), L('Продати $4', 60, 10), L('Роздерта шкура ко', 200, 12), L('Продати $423', 260, 30), L('Ще рядок', 300, 30)]))
      .toEqual({});
  });
  it('коротка чітка назва нижча за решту («Опеньок» h34 при медіані 54) — не обрізок', () => {
    const mush: CatalogItem[] = [{ id: 1, name: 'Опеньок', buyer_id: 'mush' }, { id: 2, name: 'Лисичка', buyer_id: 'mush' }];
    const ls = [L('е Опеньок', 0, 34), L('£ = І', 60, 62), L('Продати $125', 120, 44), L('но Лисичка', 200, 52), L('Продати $240', 260, 54), L('ще', 300, 60)];
    expect(Object.fromEntries(parseShot(ls, mush).filter(r => r.item && r.price).map(r => [r.item!.name, r.price]))).toEqual({ 'Опеньок': 125, 'Лисичка': 240 });
  });
});

describe('опис картки дрібним шрифтом не рве «назва → ціна» (жива гра 2026-10-29, «Риба»)', () => {
  const cat: CatalogItem[] = [{ id: 71, name: 'Тріска', buyer_id: 'fish' }, { id: 72, name: 'Сібас', buyer_id: 'fish' }];
  const L = (text: string, y: number, h: number): OcrLine => ({ text, y, col: 1, h });
  it('Тріска: назва, опис h 18, ціна — ціна прочитана', () => {
    const rows = parseShot([L('Tpicka', 1034, 44), L('JSF | тн', 1156, 18), L('Продати $207', 1226, 44), L('Cibac', 1458, 44), L('Продати $272', 1520, 44)], cat);
    expect(Object.fromEntries(rows.filter(r => r.item && r.price).map(r => [r.item!.name, r.price]))).toEqual({ 'Тріска': 207, 'Сібас': 272 });
  });
});

describe('назва-нічия двох товарів не забирає ціну (жива гра 2026-10-29)', () => {
  const cat: CatalogItem[] = [{ id: 111, name: 'Роздерта шкура корови', buyer_id: 'hide' }, { id: 95, name: 'Роздерта шкура койота', buyer_id: 'hide' }, { id: 1, name: 'Роздерта шкура кабана', buyer_id: 'hide' }];
  const L = (text: string, y: number): OcrLine => ({ text, y, col: 0, h: 44 });
  it('«Роздерта шкура Kono?» — ні корова, ні койот', () => {
    expect(parseShot([L('Роздерта шкура Kono?', 0), L('Продати $443', 60)], cat).filter(r => r.item && r.price)).toEqual([]);
  });
  it('«Роздерта шкура Kabat» з відривом — кабан', () => {
    expect(parseShot([L('шкури . Роздерта шкура Kabat', 0), L('Продати $517', 60)], cat).filter(r => r.item && r.price).map(r => r.item!.id)).toEqual([1]);
  });
});

describe('обрізане слово назви («кролі») — не нічия (жива гра 2026-10-29)', () => {
  const cat: CatalogItem[] = ['кролика', 'корови', 'койота', 'кабана', 'оленя'].map((w, i) => ({ id: i + 1, name: 'Роздерта шкура ' + w, buyer_id: 'hide' }));
  const L = (text: string, y: number): OcrLine => ({ text, y, col: 0, h: 44 });
  const pick = (t: string) => parseShot([L(t, 0), L('Продати $300', 60)], cat).filter(r => r.item && r.price).map(r => r.item!.name);
  it('«0 % Роздерта шкура кролі» → кролика', () => { expect(pick('0 % Роздерта шкура кролі')).toEqual(['Роздерта шкура кролика']); });
  it('«Роздерта шкура Kono?» — досі нічия', () => { expect(pick('Роздерта шкура Kono?')).toEqual([]); });
  it('«Роздерта шкура Koon» — досі нічия', () => { expect(pick('Роздерта шкура Koon')).toEqual([]); });
});

describe('ціна з чужої картки за панеллю «ЛІМІТ ПРОДАЖУ» (жива гра 2026-10-29, «Риба»)', () => {
  const cat: CatalogItem[] = [{ id: 1, name: 'Тунець', buyer_id: 'fish' }, { id: 2, name: 'Горбуша', buyer_id: 'fish' }];
  const L = (text: string, y: number, h: number): OcrLine => ({ text, y, col: 0, h });
  it('Тунець не бере 153 за 622 px нижче', () => {
    const ls = [L('Горбуша', 810, 44), L('Ж Продати $299', 1002, 44), L('й Re т. Тунець', 1216, 62), L('КУ й у Ще', 1298, 50), L('ЛІМІТ ПРОДАЖУ', 1370, 104), L('0', 1458, 46), L('ЗМІНА ЦІН НА', 1740, 58), L('Продати $1 53', 1838, 70)];
    expect(Object.fromEntries(parseShot(ls, cat).filter(r => r.item && r.price).map(r => [r.item!.name, r.price]))).toEqual({ 'Горбуша': 299 });
  });
});
