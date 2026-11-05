import { describe, expect, it } from 'vitest';
import { coverKind, coverTitle, coverVersion, wrap } from './newsCover';

describe('обкладинка новини', () => {
  it('вид за джерелом чернетки', () => {
    expect(coverKind('changelog:2026-11-05')).toBe('app');
    expect(coverKind('site:2026-11-05')).toBe('site');
    expect(coverKind('manual:abc')).toBe('news');
    expect(coverKind('merged:1,2')).toBe('news');
  });
  it('версія з заголовка — дві перші цифри', () => {
    expect(coverVersion('Програма Q-Hub 0.8.0 — що нового')).toBe('0.8');
    expect(coverVersion('Сайт Q-Hub: мапа')).toBe('');
  });
  it('заголовок без префікса джерела', () => {
    expect(coverTitle('Сайт Q-Hub: Q-Hub тепер у Discord')).toBe('Q-Hub тепер у Discord');
    expect(coverTitle('Програма Q-Hub 0.8.0 — що нового')).toBe('що нового');
    expect(coverTitle('Свята новина')).toBe('Свята новина');
  });
  it('перенесення: не ширше за max, зайве — «…»', () => {
    const m = (s: string) => s.length;
    expect(wrap(m, 'один два три', 7, 2)).toEqual(['один', 'два три']);
    const r = wrap(m, 'аа бб вв гг дд ее', 5, 2);
    expect(r).toHaveLength(2); expect(r[1].endsWith('…')).toBe(true);
    expect(r.every(l => l.length <= 5)).toBe(true);
  });
});
