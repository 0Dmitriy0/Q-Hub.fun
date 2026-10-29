import { describe, expect, it } from 'vitest';
import { isVisible, toggled, type Filters } from './mapFilters';

const cats = [
  { id: 'shop-247', grp: 'Магазини' },
  { id: 'skupnyk', grp: 'Заробіток' },
  { id: 'gangs', grp: 'Банди' },
  { id: 'pryvydy', grp: 'Міні-ігри, квести й контракти' },
  { id: 'names', grp: 'Шари мапи' },
  { id: 'zones', grp: 'Шари мапи' },
];
const f = (over: Partial<Filters>): Filters => ({ only: null, on: {}, saved: {}, ...over });
const shown = (x: Filters) => cats.filter(c => isVisible(c, x)).map(c => c.id);

describe('фільтри мапи', () => {
  it('без збереженого — групи за замовчуванням', () => {
    expect(shown(f({}))).toEqual(['shop-247', 'skupnyk']);
  });

  it('перемкнуте зараз важливіше за збережене', () => {
    expect(shown(f({ saved: { 'shop-247': false, skupnyk: false, gangs: true }, on: { gangs: false } }))).toEqual([]);
  });

  it('?show= — лише ця категорія й назви, хоч що збережено', () => {
    const x = f({ only: 'pryvydy', saved: { 'shop-247': true, gangs: true, zones: true }, on: { gangs: true } });
    expect(shown(x)).toEqual(['pryvydy', 'names']);
  });

  it('перше перемикання після ?show= зберігає видиме зараз + перемкнуте, без старого збереженого', () => {
    const x = f({ only: 'pryvydy', saved: { 'shop-247': true, gangs: true } });
    expect(toggled(cats, x, ['gangs'], true)).toEqual({ 'shop-247': false, skupnyk: false, gangs: true, pryvydy: true, names: true, zones: false });
  });

  it('звичайне перемикання зберігає все видиме зараз + перемкнуте', () => {
    const x = f({ saved: { gangs: true }, on: { zones: true } });
    expect(toggled(cats, x, ['shop-247', 'pryvydy'], false)).toEqual({ 'shop-247': false, skupnyk: false, gangs: true, pryvydy: false, names: false, zones: true });
  });

  it('збережене до specs/020 — «Заробіток» сам не вмикається', () => {
    expect(shown(f({ saved: { gangs: true } }))).toEqual(['shop-247', 'gangs']);
  });

  it('новий гравець перемкнув щось — «Заробіток» лишається увімкненим', () => {
    const n = toggled(cats, f({}), ['gangs'], true);
    expect(shown(f({ saved: n }))).toEqual(['shop-247', 'skupnyk', 'gangs']);
  });

  it('категорія, якої вже немає в списку, зі збереженого не губиться', () => {
    const x = f({ only: 'pryvydy', saved: { old: true } });
    expect(toggled(cats, x, [], true).old).toBe(true);
  });
});
