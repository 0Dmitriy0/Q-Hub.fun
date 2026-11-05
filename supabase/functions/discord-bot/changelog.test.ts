import { describe, expect, it } from 'vitest';
import { clip, dayOf, toDraft } from './changelog';

describe('журнал → чернетка новини', () => {
  it('програма: версія в заголовку, «Виправлено» йде до «Змінено»', () => {
    expect(toDraft({ id: '2026-11-05', version: '0.8.0', added: ['А'], changed: ['Б'], fixed: ['В'] }, 'changelog')).toEqual({
      source_ref: 'changelog:2026-11-05', title: 'Програма Q-Hub 0.8.0 — що нового', added: ['А'], changed: ['Б', 'В'], removed: [],
    });
  });
  it('без версії — назва запису, без назви — дата', () => {
    expect(toDraft({ id: '2026-11-05.2', title: 'Мапа для гри', changed: ['x'] }, 'changelog')!.title).toBe('Програма Q-Hub: Мапа для гри');
    expect(toDraft({ id: '2026-11-05.2', changed: ['x'] }, 'site')).toMatchObject({ source_ref: 'site:2026-11-05.2', title: 'Сайт Q-Hub — що нового 5 листопада' });
  });
  it('порожній запис — нічого', () => {
    expect(toDraft({ id: '2026-11-05', added: [], changed: ['  '] }, 'site')).toBeNull();
    expect(toDraft(null, 'site')).toBeNull();
  });
  it('пункт > 300 символів обрізається на межі слова з «…»', () => {
    const long = ('слово ').repeat(80);
    const c = clip(long);
    expect(c.length).toBeLessThanOrEqual(300);
    expect(c.endsWith('слово…')).toBe(true);
    expect(clip('коротко')).toBe('коротко');
  });
  it('дата з id', () => {
    expect(dayOf('2026-01-31')).toBe('31 січня');
    expect(dayOf('2026-11-05.3')).toBe('5 листопада');
  });
});
