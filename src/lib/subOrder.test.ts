import { describe, expect, it } from 'vitest';
import { subRank, subRanks } from './subOrder';

const many = (s: string, k: number) => Array(k).fill(s);

describe('порядок підгруп скупника (specs/028)', () => {
  it('«Шкури» — основна у «Шкур», навіть якщо м\'яса більше', () => {
    const r = subRanks('Шкури', [...many("М'ясо", 40), ...many('Шкури', 32)]);
    expect(subRank(r, 'Шкури')).toBe(0);
    expect(subRank(r, "М'ясо")).toBe(1);
  });
  it('назва скупника не збігається — основна найчисленніша, решта за абеткою', () => {
    const r = subRanks('Мисливець', [...many('Хутро', 2), ...many('Шкури', 5), 'Ікла']);
    expect(['Шкури', 'Ікла', 'Хутро'].map(s => subRank(r, s))).toEqual([0, 1, 2]);
  });
  it('нічия — основна перша за абеткою', () => {
    const r = subRanks('Х', ['Б', 'А', 'Б', 'А']);
    expect(subRank(r, 'А')).toBe(0);
    expect(subRank(r, 'Б')).toBe(1);
  });
  it('без підгрупи й невідома підгрупа — з основною', () => {
    const r = subRanks('Шкури', ['Шкури', "М'ясо", '']);
    expect(subRank(r, '')).toBe(0);
    expect(subRank(r, undefined)).toBe(0);
    expect(subRank(r, 'Роги')).toBe(0);
    expect(subRank(undefined, "М'ясо")).toBe(0);
  });
  it('одна підгрупа — лише ранг 0', () => {
    const r = subRanks('Риба', many('Риба', 14));
    expect([...r.values()]).toEqual([0, 0]);
  });
});
