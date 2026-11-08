import { describe, expect, it } from 'vitest';
import { append, changes, itemChanges, similar, KEEP_ENTRIES } from './changes';
import type { SnapTopic } from './merge';

const F = 'https://forum.quant5.com.ua/index.php?/topic/';
const t = (id: number, items: [string, string][], src = 1): SnapTopic =>
  ({ title: 'Док ' + id, section: 'S', url: F + id + '-x/', kind: 'rules', src, items: items.map(([n, s]) => ({ n, h: '', s })) });
const kinds = (cs: { type: string }[]) => cs.map(c => c.type);

describe('itemChanges: пункти однієї теми', () => {
  const base: [string, string][] = [['1.1', 'Заборонено DM без причини'], ['1.2', 'Заборонено PG у будь-якому вигляді'], ['1.3', 'Метагеймінг карається варном']];
  const items = (a: [string, string][]) => a.map(([n, s]) => ({ n, h: '', s }));
  it('нічого не змінилось — порожньо', () => expect(itemChanges(items(base), items(base))).toEqual([]));
  it('вставили пункт на початок — номери зсунулись, але змінений лише новий', () => {
    const next: [string, string][] = [['1.1', 'Новий пункт про таксі'], ['1.2', base[0][1]], ['1.3', base[1][1]], ['1.4', base[2][1]]];
    const cs = itemChanges(items(base), items(next));
    expect(kinds(cs)).toEqual(['added']);
    expect(cs[0].it.s).toBe('Новий пункт про таксі');
  });
  it('той самий номер, інший текст — змінено, зі старим текстом', () => {
    const cs = itemChanges(items(base), items([base[0], ['1.2', 'Дозволено PG на івентах'], base[2]]));
    expect(cs).toEqual([{ type: 'changed', it: { n: '1.2', h: '', s: 'Дозволено PG на івентах' }, old: base[1][1] }]);
  });
  it('прибрали пункт — removed', () => expect(kinds(itemChanges(items(base), items([base[0], base[2]])))).toEqual(['removed']));
  it('пункт без номера переписали трохи — changed, а не прибрано + додано', () => {
    const cs = itemChanges(items([['', 'Адміністрація може видати бан за образу гравців у чаті сервера']]),
      items([['', 'Адміністрація може видати бан за образу гравців чи рідних у чаті сервера']]));
    expect(kinds(cs)).toEqual(['changed']);
  });
});

describe('changes: зміни між знімками', () => {
  const a = t(1, [['1.1', 'Перше правило'], ['1.2', 'Друге правило']]);
  it('першого знімка немає — жодного запису', () => expect(changes([], [a], new Set([1]))).toEqual([]));
  it('нова тема — один рядок «документ додано»', () => {
    expect(changes([a], [a, t(2, [['1', 'x']])], new Set([1]))).toMatchObject([{ type: 'doc-added', doc: 'Док 2', items: 1 }]);
  });
  it('тема зникла з джерела, що зібралось без помилки, — документ прибрано', () => {
    expect(changes([a, t(2, [['1', 'x']])], [a], new Set([1]))).toMatchObject([{ type: 'doc-removed', doc: 'Док 2' }]);
  });
  it('тема зникла, бо джерело вимкнули чи воно впало, — не записується', () => {
    expect(changes([a, t(2, [['1', 'x']], 7)], [a], new Set([1]))).toEqual([]);
  });
  it('пункти — з назвою документа й посиланням', () => {
    const cs = changes([a], [t(1, [['1.1', 'Перше правило'], ['1.2', 'Друге правило змінене трохи']])], new Set([1]));
    expect(cs).toMatchObject([{ type: 'changed', doc: 'Док 1', url: a.url, n: '1.2', old: 'Друге правило' }]);
  });
  it('переписано майже весь документ — одним рядком з лічильниками', () => {
    const many = (p: string) => Array.from({ length: 30 }, (_, i) => [String(i + 1), `${p} унікальний текст номер ${i} ${p.repeat(3)}`] as [string, string]);
    const cs = changes([t(1, many('аа'))], [t(1, many('бб'))], new Set([1]));
    expect(cs).toMatchObject([{ type: 'doc-rewritten', changed: 30, added: 0, removed: 0 }]);
  });
});

describe('append: журнал', () => {
  const c = changes([t(1, [['1', 'a']])], [t(1, [['1', 'b b b']])], new Set([1]));
  it('без змін — нічого не пишемо', () => expect(append(null, '2026-11-08T01:00:00Z', [])).toBeNull());
  it('новий запис — зверху, старіші за 120 днів — прибрано', () => {
    const log = { updated: '', entries: [{ at: '2026-11-01T01:00:00Z', changes: c }, { at: '2026-05-01T01:00:00Z', changes: c }] };
    expect(append(log, '2026-11-08T01:00:00Z', c)!.entries.map(e => e.at)).toEqual(['2026-11-08T01:00:00Z', '2026-11-01T01:00:00Z']);
  });
  it('не більше KEEP_ENTRIES записів', () => {
    const log = { updated: '', entries: Array.from({ length: 100 }, (_, i) => ({ at: new Date(Date.parse('2026-11-07T00:00:00Z') - i * 36e5).toISOString(), changes: c })) };
    expect(append(log, '2026-11-08T01:00:00Z', c)!.entries).toHaveLength(KEEP_ENTRIES);
  });
  it('similar: однакові — 1, різні — 0', () => { expect(similar('a b', 'b a')).toBe(1); expect(similar('a', 'b')).toBe(0); });
});
