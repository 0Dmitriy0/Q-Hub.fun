import { describe, expect, it } from 'vitest';
import { DRIFT_CHIP, TUNING, TUNING_GROUPS, emptyTune, readTune, stageSpeeds, tuneSummary, tuneTotal, tuningCost } from './tuning';

const costs = (gov: number) => Object.fromEntries(TUNING.map(([n, p]) => [n, tuningCost(gov, p)]));

describe('тюнінг (звірено зі скрінами з гри)', () => {
  it('Rune Lanes, держ. 300 000', () => {
    expect(costs(300000)).toEqual({ Хамелеон: 45000, Двигун: 30000, Турбонадув: 30000, Підвіска: 21000, Автопілот: 18000, Гальма: 18000, Трансмісія: 18000,
      Броня: 15000, 'Ремені безпеки': 15000, Тонування: 15000, 'Колір диму від шин': 12000, Неон: 12000, Перламутр: 12000, Пофарбування: 12000, 'Номерний знак': 6000, Клаксон: 3000 });
  });
  it('Karin Priu, держ. 150 000', () => {
    expect(costs(150000)).toMatchObject({ Хамелеон: 22500, Двигун: 15000, Підвіска: 10500, Автопілот: 9000, Броня: 7500, Неон: 6000, 'Номерний знак': 3000, Клаксон: 1500 });
  });
  it('швидкість з чіпами STAGE 1–4', () => {
    expect(stageSpeeds(170)).toEqual([178, 187, 196, 204]);
    expect(stageSpeeds(190)).toEqual([200, 209, 218, 228]);
  });
});

describe('стан тюнінгу (гараж і калькулятор)', () => {
  it('групи містять кожен елемент рівно раз', () => {
    expect(TUNING_GROUPS.flatMap(g => g.items).sort()).toEqual(TUNING.map(t => t[0]).sort());
  });
  it('readTune: порожнє, старе й зіпсоване — без падіння, лише відоме', () => {
    expect(readTune({})).toEqual(emptyTune());
    expect(readTune(null)).toEqual(emptyTune());
    expect(readTune({ items: ['Двигун', 'Ракета'], stage: 7, drift: 'так', xenon: true })).toEqual({ items: ['Двигун'], stage: 0, drift: false, xenon: true });
  });
  it('tuneTotal: елементи від держ., DRIFT фіксовано, STAGE і ксенон — лише з ціною', () => {
    const t = { items: ['Двигун', 'Клаксон'], drift: true, stage: 2, xenon: true };
    expect(tuneTotal(300000, t)).toBe(30000 + 3000 + DRIFT_CHIP);
    expect(tuneTotal(300000, t, { stage: 1000000, xenon: 300000 })).toBe(30000 + 3000 + DRIFT_CHIP + 1000000 + 300000);
  });
  it('tuneSummary', () => {
    expect(tuneSummary({ items: ['Двигун'], drift: true, stage: 2, xenon: false })).toBe('Stage 2 · DRIFT · 1 з 16');
    expect(tuneSummary(emptyTune())).toBe('');
  });
});
