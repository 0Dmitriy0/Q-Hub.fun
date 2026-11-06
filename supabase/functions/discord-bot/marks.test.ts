import { describe, expect, it } from 'vitest';
import { MAX, mapLink, marksMessage, type NewMark } from './marks';

const SITE = 'https://q-hub.fun';
const m = (id: number, author: string, name = 'Бак', category = 'Сміттєві баки'): NewMark => ({ id, author, category, name, x: 100.4 + id, y: -200.6 });

describe('оголошення нових міток', () => {
  it('посилання веде на точку мапи', () => {
    expect(mapLink(SITE, { x: 100.4, y: -200.6 })).toBe('https://q-hub.fun/mapa#100,-201,5');
  });
  it('групує за автором, відміна «мітки»', () => {
    const d = marksMessage([m(1, 'Roksa'), m(2, 'Roksa'), m(3, 'Andrii')], SITE).embeds![0];
    expect(d.title).toBe('Нові мітки від гравців: 3');
    expect(d.description).toContain('**Roksa** додав 2 мітки:');
    expect(d.description).toContain('**Andrii** додав мітку:');
    expect(d.description).toContain('• Сміттєві баки — Бак · [на мапі](https://q-hub.fun/mapa#101,-201,5)');
  });
  it('одна мітка; назва як у категорії не дублюється', () => {
    const d = marksMessage([m(1, 'Yan', 'Сміттєві баки')], SITE).embeds![0];
    expect(d.title).toBe('Нова мітка від гравця');
    expect(d.description).toContain('• Сміттєві баки · [на мапі]');
  });
  it('нік з розміткою Discord екранується', () => {
    expect(marksMessage([m(1, '*bold_')], SITE).embeds![0].description).toContain('**\\*bold\\_**');
  });
  it('понад MAX — «і ще N»', () => {
    const d = marksMessage(Array.from({ length: MAX + 3 }, (_, i) => m(i, 'A')), SITE).embeds![0];
    expect(d.description).toContain('…і ще 3');
    expect((d.description!.match(/• /g) || []).length).toBe(MAX);
  });
});
