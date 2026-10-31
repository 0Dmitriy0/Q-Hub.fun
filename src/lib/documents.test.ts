import { describe, expect, it } from 'vitest';
import { daysLeft, daysWord, docState, iconFor, plusDays, sortDocs, stateText } from './documents';

const now = new Date(2026, 9, 31, 23, 30);   // 31 жовтня, пізно ввечері — день ще не змінився

describe('строк документа', () => {
  it('дні до закінчення — календарні', () => {
    expect(daysLeft('2026-10-31', now)).toBe(0);
    expect(daysLeft('2026-11-01', now)).toBe(1);
    expect(daysLeft('2026-10-29', now)).toBe(-2);
    expect(daysLeft('2027-01-01', now)).toBe(62);
  });
  it('стан: прострочений, скоро, діє, безстроковий', () => {
    expect(docState('2026-10-30', now)).toEqual({ kind: 'expired', days: -1 });
    expect(docState('2026-11-03', now)).toEqual({ kind: 'soon', days: 3 });
    expect(docState('2026-11-04', now)).toEqual({ kind: 'ok', days: 4 });
    expect(docState(null, now)).toEqual({ kind: 'none' });
  });
  it('текст для гравця', () => {
    expect(stateText('2026-10-30', now)).toBe('закінчився вчора');
    expect(stateText('2026-10-26', now)).toBe('закінчився 5 днів тому');
    expect(stateText('2026-10-31', now)).toBe('останній день');
    expect(stateText('2026-11-01', now)).toBe('закінчується завтра');
    expect(stateText('2026-11-03', now)).toBe('ще 3 дні');
    expect(stateText('2026-11-12', now)).toBe('до 12.11.2026');
    expect(stateText(null, now)).toBe('безстроковий');
  });
  it('відмінювання днів', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map(daysWord)).toEqual(['1 день', '2 дні', '5 днів', '11 днів', '21 день', '22 дні', '25 днів', '111 днів']);
  });
});

describe('порядок і продовження', () => {
  it('спершу ті, що закінчуються раніше, безстрокові — у кінці', () => {
    const r = sortDocs([{ name: 'Б', expires: null }, { name: 'В', expires: '2026-12-01' }, { name: 'А', expires: null }, { name: 'Г', expires: '2026-10-01' }]);
    expect(r.map(d => d.name)).toEqual(['Г', 'В', 'А', 'Б']);
  });
  it('діючий продовжується від своєї дати, прострочений — від сьогодні', () => {
    expect(plusDays(7, null, now)).toBe('2026-11-07');
    expect(plusDays(30, '2026-11-05', now)).toBe('2026-12-05');
    expect(plusDays(7, '2026-10-01', now)).toBe('2026-11-07');
  });
  it('іконка — з типового документа, інакше книжка', () => {
    expect(iconFor('Ліцензія на зброю')).toBe('shield');
    expect(iconFor('Пропуск у порт')).toBe('book');
  });
});
