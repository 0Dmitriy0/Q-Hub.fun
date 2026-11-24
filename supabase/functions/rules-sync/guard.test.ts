import { describe, expect, it } from 'vitest';
import { checkAppBody, suspicious } from './guard';
import type { SnapTopic, SourceRow } from './merge';

/* specs/095: тіло від програми адміна і запобіжник від гіршого знімка */
const F = 'https://forum.quant5.com.ua/';
const sources: SourceRow[] = [
  { id: 1, url: F + 'index.php?/forum/10-правила/', kind: 'rules', enabled: true },
  { id: 2, url: F + 'index.php?/forum/36-закони/', kind: 'law', enabled: false },
];
const topic = (over: Record<string, unknown> = {}) => ({ title: 'ДМ', section: 'Загальні', url: F + 'index.php?/topic/5-dm/', kind: 'rules', src: 1, items: [{ n: '1.1', h: '', s: 'Текст' }], ...over });

describe('checkAppBody (specs/095)', () => {
  it('коректне тіло — приймається, errors/titles стають Map', () => {
    const r = checkAppBody({ via: 'app', fresh: [topic()], errors: [], titles: [[1, 'Правила серверу']] }, sources);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.fresh).toHaveLength(1); expect(r.titles.get(1)).toBe('Правила серверу'); }
  });
  it.each([
    ['посилання не на форум', { fresh: [topic({ url: 'https://evil.example/x' })] }, /не на форум/],
    ['невідоме джерело', { fresh: [topic({ src: 99 })] }, /невідоме чи вимкнене джерело 99/],
    ['вимкнене джерело', { fresh: [topic({ src: 2 })] }, /вимкнене джерело 2/],
    ['невідомий тип', { fresh: [topic({ kind: 'x' })] }, /невідомий тип x/],
    ['задовга назва', { fresh: [topic({ title: 'я'.repeat(301) })] }, /назва/],
    ['задовгий пункт', { fresh: [topic({ items: [{ n: '1', h: '', s: 'я'.repeat(20001) }] })] }, /пункт/],
    ['не масив', { fresh: 'x' }, /fresh/],
    ['помилка чужого джерела', { fresh: [], errors: [[42, 'x']] }, /errors/],
  ])('%s — відхиляється зі зрозумілою причиною', (_n, body, re) => {
    const r = checkAppBody(body, sources);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

describe('suspicious (specs/095)', () => {
  const t = (src: number, n: number): SnapTopic => ({ title: 'T', section: 'S', url: F + 'x', kind: 'rules', src, items: Array.from({ length: n }, (_, i) => ({ n: String(i), h: '', s: 's' })) });
  it('0 тем без помилки — підозріло', () => {
    expect(suspicious([t(1, 10)], [], sources, new Map()).get(1)).toMatch(/жодної теми/);
  });
  it('менше половини попередніх пунктів — підозріло', () => {
    expect(suspicious([t(1, 1000)], [t(1, 10)], sources, new Map()).get(1)).toMatch(/10 замість 1000/);
  });
  it('нормальна зміна і джерело з помилкою — не чіпаємо', () => {
    expect(suspicious([t(1, 1000)], [t(1, 900)], sources, new Map()).size).toBe(0);
    expect(suspicious([t(1, 1000)], [], sources, new Map([[1, '403']])).size).toBe(0);
  });
  it('нове джерело без попередніх пунктів — не підозріло', () => {
    expect(suspicious([], [t(1, 3)], sources, new Map()).size).toBe(0);
  });
});
