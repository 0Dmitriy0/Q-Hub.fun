import { describe, expect, it } from 'vitest';
import { placesText, rulesText, ruleText } from './barParts';

const h = { topic: 'Кримінальний кодекс штату Quant', url: '', kind: 'law' as const, n: '6.5', h: '', score: 1, s: 'Вимагання грошей | Позбавлення волі 30 хв. Примітка: лише для ПД' };

describe('текст для «Копіювати»', () => {
  it('пункт: джерело з номером, текст, покарання, примітка', () => {
    expect(ruleText(h)).toBe('Кримінальний кодекс штату Quant, ст. 6.5\nВимагання грошей\nПозбавлення волі 30 хв.\nПримітка: лише для ПД');
  });
  it('без номера й покарання', () => {
    expect(ruleText({ ...h, kind: 'rules', n: '', s: 'Заборонено DM' })).toBe('Кримінальний кодекс штату Quant\nЗаборонено DM');
  });
  it('усі пункти — через порожній рядок', () => {
    expect(rulesText([h, h]).split('\n\n')).toHaveLength(2);
  });
  it('місця з координатами', () => {
    expect(placesText([{ id: '1', name: 'Заправка №3', cat: 'Заправки', icon: '', x: 120.4, y: -339.6 }])).toBe('Заправка №3 — Заправки, X 120 · Y -340');
  });
});
