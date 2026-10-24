import { describe, expect, it } from 'vitest';
import { groupCategories, parseBulk, ringProblem, slugify, type MapCategory } from './mapData';

const c = (id: string, grp: string, sort: number): MapCategory => ({ id, name: id, grp, icon: '', color: '#ff6a1f', sort, shown: true });

describe('категорії мапи', () => {
  it('групи в порядку QuantFun, нові групи — в кінці', () => {
    const g = groupCategories([c('a', 'Моя група', 5), c('b', 'Розваги', 40), c('c', 'Магазини', 11), c('d', 'Магазини', 10)]);
    expect(g.map(x => x.grp)).toEqual(['Магазини', 'Розваги', 'Моя група']);
    expect(g[0].cats.map(x => x.id)).toEqual(['d', 'c']);
  });
  it('id з української назви', () => {
    expect(slugify('Сміттєві баки')).toBe('smittievi-baky');
    expect(slugify('24/7')).toBe('24-7');
    expect(slugify('!')).toMatch(/^cat-/);
  });
});

describe('масове додавання міток', () => {
  it('рядки «X, Y, назва», пропуск порожніх, погані рядки за номером', () => {
    const r = parseBulk('100, -200, Бак біля пірсу\n\n-1600.5 -1000\nабв\n99999, 0, поза мапою\n12;34;Бак 3');
    expect(r.ok).toEqual([{ x: 100, y: -200, name: 'Бак біля пірсу' }, { x: -1600.5, y: -1000, name: '' }, { x: 12, y: 34, name: 'Бак 3' }]);
    expect(r.bad).toEqual([4, 5]);
  });
  it('рядки з пікселями QuantFun переводяться у координати гри', () => {
    const r = parseBulk('0, 0, кут\n-5, 3', (x, y) => [x - 100, y + 100]);
    expect(r.ok).toEqual([{ x: -100, y: 100, name: 'кут' }, { x: -105, y: 103, name: '' }]);
  });
});

describe('контур зони', () => {
  it('менше 3 точок — не можна', () => expect(ringProblem([[0, 0], [1, 1]])).toMatch(/3 точки/));
  it('трикутник у межах мапи — можна', () => expect(ringProblem([[0, 0], [10, 0], [0, 10]])).toBeNull());
  it('точка поза мапою — ні', () => expect(ringProblem([[0, 0], [10, 0], [99999, 10]])).toMatch(/поза мапою/));
  it('понад 500 точок — ні', () => expect(ringProblem(Array.from({ length: 501 }, (_, i) => [i, 0] as [number, number]))).toMatch(/Забагато/));
});
