import { describe, expect, it } from 'vitest';
import { matchCats, type Cat } from './catMatch';

const cats: Cat[] = [
  { id: 'trash-bins', name: 'Сміттєві баки', grp: 'Міні-ігри, квести й контракти' },
  { id: 'trash-bags', name: 'Сміттєві пакети', grp: 'Міні-ігри, квести й контракти' },
  { id: 'gas', name: 'Заправки', grp: 'Транспорт' },
  { id: 'shop-247', name: '24/7', grp: 'Магазини' },
  { id: 'bar', name: 'Бари', grp: 'Магазини' },
  { id: 'water', name: 'Апарати з водою', grp: 'Вендингові апарати' },
];
const ids = (t: string) => matchCats(cats, t).map(c => c.id);

describe('категорія за набраним текстом', () => {
  it('порожньо — нічого', () => expect(ids('  ')).toEqual([]));
  it('початок назви — першим', () => expect(ids('ба')[0]).toBe('bar'));
  it('початок слова в назві', () => expect(ids('бак')).toEqual(['trash-bins']));
  it('будь-де в назві й без регістру', () => expect(ids('СМІТТ')).toEqual(['trash-bins', 'trash-bags']));
  it('цифри', () => expect(ids('24')).toEqual(['shop-247']));
  it('за групою — наприкінці', () => expect(ids('магаз')).toEqual(['shop-247', 'bar']));
  it('не більше ліміту', () => expect(matchCats(cats, 'а', 2)).toHaveLength(2));
});
