import { describe, expect, it } from 'vitest';
import { arrange, filter, lastDays, levelsFromText, mapLink, suggestSlug } from './eventsWiki';

const T = '2026-11-04';
type R = { id: number; kind: 'event' | 'battlepass'; starts_on: string; ends_on: string | null };
const ev = (id: number, starts_on: string, ends_on: string | null, kind: R['kind'] = 'event'): R => ({ id, kind, starts_on, ends_on });

describe('івенти WIKI: порядок і банер', () => {
  it('тривають — за днями до кінця, без кінця — після; скоро — за днями до початку; минулі — новіші вище', () => {
    const a = arrange([
      ev(1, '2026-10-20', '2026-11-30'),
      ev(2, '2026-10-23', '2026-11-06'),
      ev(3, '2026-10-01', null),
      ev(4, '2026-11-20', '2026-11-25'),
      ev(5, '2026-11-10', '2026-11-12'),
      ev(6, '2026-09-01', '2026-09-10'),
      ev(7, '2026-10-01', '2026-10-15'),
    ], T);
    expect(a.banner).toBeNull();
    expect(a.now.map(x => x.id)).toEqual([2, 1, 3]);
    expect(a.soon.map(x => x.id)).toEqual([5, 4]);
    expect(a.past.map(x => x.id)).toEqual([7, 6]);
  });
  it('батл пас, що триває, — у банері й не серед плиток', () => {
    const a = arrange([ev(1, '2026-10-23', '2026-11-09'), ev(2, '2026-10-23', '2026-11-30', 'battlepass')], T);
    expect(a.banner?.id).toBe(2);
    expect(a.now.map(x => x.id)).toEqual([1]);
  });
  it('два батл паси, що тривають, — у банер той, що закінчується раніше', () => {
    const a = arrange([ev(1, '2026-10-01', '2026-12-01', 'battlepass'), ev(2, '2026-10-23', '2026-11-20', 'battlepass')], T);
    expect(a.banner?.id).toBe(2);
    expect(a.now.map(x => x.id)).toEqual([1]);
  });
  it('завершений батл пас — в архіві, банера немає; майбутній — серед «скоро»', () => {
    const a = arrange([ev(1, '2026-09-01', '2026-10-01', 'battlepass'), ev(2, '2026-12-01', '2027-01-01', 'battlepass')], T);
    expect(a.banner).toBeNull();
    expect(a.past.map(x => x.id)).toEqual([1]);
    expect(a.soon.map(x => x.id)).toEqual([2]);
  });
});

describe('івенти WIKI: фільтр і «Ще N дн.»', () => {
  const rows = [ev(1, '2026-10-23', '2026-11-09'), ev(2, '2026-11-10', null), ev(3, '2026-09-01', '2026-09-10')];
  it('без фільтра — усе, крім завершених; архів — лише завершені', () => {
    expect(filter(rows, 'all', T).map(x => x.id)).toEqual([1, 2]);
    expect(filter(rows, 'now', T).map(x => x.id)).toEqual([1]);
    expect(filter(rows, 'soon', T).map(x => x.id)).toEqual([2]);
    expect(filter(rows, 'past', T).map(x => x.id)).toEqual([3]);
  });
  it('«Ще N дн.» — лише коли лишилось 3 дні чи менше', () => {
    expect(lastDays({ kind: 'now', left: 3 })).toBe(3);
    expect(lastDays({ kind: 'now', left: 1 })).toBe(1);
    expect(lastDays({ kind: 'now', left: 4 })).toBeNull();
    expect(lastDays({ kind: 'now', left: null })).toBeNull();
    expect(lastDays({ kind: 'soon', in: 2 })).toBeNull();
  });
});

describe('івенти WIKI: адреса, рівні, мапа', () => {
  it('адреса з назви; зайнята — з роком, далі з номером', () => {
    expect(suggestSlug('Хелловін', [], 2026)).toBe('khellovin');
    expect(suggestSlug('Хелловін', ['khellovin'], 2026)).toBe('khellovin-2026');
    expect(suggestSlug('Хелловін', ['khellovin', 'khellovin-2026'], 2026)).toBe('khellovin-2026-2');
    expect(suggestSlug('!', [], 2026)).toMatch(/^event-/);
  });
  it('рівні з тексту: «рівень; нагорода; free|paid», лінія за замовчуванням — free', () => {
    expect(levelsFromText('1; 500 $; free\n2; Кейс; paid\n\n3; Авто')).toEqual({
      rows: [{ level: 1, reward: '500 $', line: 'free' }, { level: 2, reward: 'Кейс', line: 'paid' }, { level: 3, reward: 'Авто', line: 'free' }],
      error: null,
    });
  });
  it('поганий рядок — помилка з номером рядка', () => {
    expect(levelsFromText('1; 500 $\nx; Кейс').error).toBe('Рядок 2: рівень — число від 1 до 500');
    expect(levelsFromText('1; 500 $; vip').error).toBe('Рядок 1: лінія — free або paid');
    expect(levelsFromText('1;  ; free').error).toBe('Рядок 1: нагорода від 1 до 200 символів');
    expect(levelsFromText('1; A\n1; B').error).toBe('Рядок 2: рівень 1 (free) уже є');
  });
  it('посилання на велику мапу з кількома категоріями', () => {
    expect(mapLink(['harbuzy', 'pryvydy'])).toBe('/mapa?show=harbuzy,pryvydy');
  });
});
