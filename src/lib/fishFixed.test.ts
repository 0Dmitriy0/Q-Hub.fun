/* Скупник риби з фіксованими цінами (specs/096, SC-002): три кадри вікна після оновлення рибалки (знімки власника
   24.11.2026 00:25, 1920×1080) через увесь шлях програми parseShot → pricePicker → coverage. Рядки — такі, які дає lines()
   у vision.cjs для чистого OCR: назва й «Продати $N» кожної картки, координати половини екрана ×2 (col 0 — ліва колонка
   карток, col 1 — права). Шум OCR перевіряють записи живої гри в priceFixtures.test.ts; тут — 20 назв і логіка фіксованих цін. */
import { describe, expect, it } from 'vitest';
import { MIN_SCORE, parseShot, type OcrLine } from './shotParse';
import { coverage, pricePicker } from '../../desktop/src/pricescan.cjs';

const PRICES: Record<string, number> = {
  'Оселедець': 157, 'Форель': 183, 'Короп': 197, 'Окунь': 210, 'Тунець': 220, 'Тріска': 252, 'Скумбрія': 260, 'Щука': 307,
  'Дорадо': 345, 'Камбала': 405, 'Кефаль': 422, 'Акула': 427, 'Горбуша': 445, 'Сібас': 450, 'Сом': 482, 'Лосось': 520,
  'Мурена': 558, 'Скат': 702, 'Осетр': 825, 'Фугу': 967,
};
const items = Object.entries(PRICES).map(([name, price], i) => ({ id: 900 + i, name, buyer_id: 'fish', min: 0, max: 0, last: price, fixed: true }));

/* картка: назва на y (екран), «Продати $N» на 98 px нижче; null — ціна закрита смужкою програми чи краєм вікна */
type Card = [name: string | null, y: number, col: 0 | 1, price?: boolean];
const X = [1434, 640], PX = [1508, 712];
const frame = (cards: Card[]): OcrLine[] => cards.flatMap(([name, y, col, price = true]) => [
  ...(name ? [{ text: name, y: y * 2, x: X[col], h: 44, col }] : []),
  ...(price && name ? [{ text: `Продати $${PRICES[name]}`, y: (y + 98) * 2, x: PX[col], h: 44, col }] : []),
]);
const FRAMES: OcrLine[][] = [
  frame([['Оселедець', 101, 0], ['Форель', 101, 1], ['Короп', 313, 0], ['Окунь', 313, 1], ['Тунець', 525, 0], ['Тріска', 525, 1],
    ['Скумбрія', 737, 0], ['Щука', 737, 1], ['Дорадо', 949, 0], ['Камбала', 949, 1]]),
  frame([['Кефаль', 229, 0], ['Акула', 229, 1], ['Горбуша', 441, 0], ['Сібас', 441, 1], ['Сом', 653, 0], ['Лосось', 653, 1],
    ['Мурена', 865, 0], ['Скат', 865, 1]]),
  frame([['Горбуша', 159, 0], ['Сібас', 159, 1], ['Сом', 371, 0], ['Лосось', 371, 1], ['Мурена', 583, 0], ['Скат', 583, 1],
    ['Осетр', 795, 0], ['Фугу', 795, 1]]),
];

function replay(cat: typeof items, frames: OcrLine[][], step = 4000) {
  const pick = pricePicker(), cov = coverage(), sent: unknown[] = [], odd: unknown[] = [], named = new Set<number>(), read = new Set<number>();
  let last = null;
  frames.forEach((lines, i) => {
    const rows = parseShot(lines, cat).filter(r => r.item && r.price && r.score >= MIN_SCORE).map(r => {
      const it = cat.find(c => c.id === r.item!.id)!;
      named.add(it.id);
      return { buyer_id: 'fish', item_id: it.id, price: r.price!, score: r.score, min: it.min, max: it.max, last: it.last, fixed: it.fixed };
    });
    sent.push(...pick('fish', rows, i * step));
    odd.push(...pick.outside);
    for (const id of pick.confirmed) read.add(id);
    last = cov.frame('fish', cat.length, rows.map(r => r.item_id), pick.confirmed, i * step, true);
  });
  return { sent, odd, named, read, cover: last as unknown as { shown: boolean } };
}

describe('скупник риби: 20 видів, фіксовані ціни (specs/096)', () => {
  it('усі 20 назв зіставлено, жодної ціни на сайт, смужка не просить прокручувати', () => {
    const r = replay(items, FRAMES);
    expect([...r.named].map(id => items.find(i => i.id === id)!.name).sort()).toEqual(Object.keys(PRICES).sort());
    expect(r.read.size).toBe(20);
    expect(r.sent).toEqual([]);
    expect(r.odd).toEqual([]);
    expect(r.cover.shown).toBe(false);
  });
  it('на екрані інша ціна: після трьох упевнених кадрів — один звіт адміну, на сайт нічого', () => {
    const cat = items.map(i => (i.name === 'Осетр' ? { ...i, last: 800 } : i));
    const r = replay(cat, [FRAMES[2], FRAMES[2], FRAMES[2], FRAMES[2]]);
    expect(r.sent).toEqual([]);
    expect(r.odd).toEqual([{ item_id: cat.find(i => i.name === 'Осетр')!.id, price: 825, last: 800, fixed: true }]);
  });
});
