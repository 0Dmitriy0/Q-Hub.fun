import { describe, expect, it } from 'vitest';
import { diff, merge, plan, topicKey, type SnapTopic, type SourceRow } from './merge';

const F = 'https://forum.quant5.com.ua/';
const rules: SourceRow = { id: 1, url: F + 'index.php?/forum/10-правила-серверу/', kind: 'rules', enabled: true };
const law: SourceRow = { id: 2, url: F + 'index.php?/forum/36-законодавча-база-штату/', kind: 'law', enabled: true };
const t = (src: number, url: string, items: [string, string][]): SnapTopic =>
  ({ title: 'T' + url, section: 'S', url, kind: 'rules', src, items: items.map(([n, s]) => ({ n, h: '', s })) });

describe('plan: які теми брати', () => {
  const listed = new Map([[1, [{ url: 'index.php?/topic/5-dm/', section: 'Загальні' }, { url: 'index.php?/topic/6-pg/', section: 'Загальні' }]],
    [2, [{ url: 'index.php?/topic/7-kk/', section: 'Закони' }]]]);
  it('теми розділів — з типом розділу', () => {
    expect(plan([rules, law], listed).map(p => `${topicKey(p.url)}:${p.kind}:${p.src}`)).toEqual(['t5:rules:1', 't6:rules:1', 't7:law:2']);
  });
  it('тема, вимкнена окремим джерелом, не береться', () => {
    const off: SourceRow = { id: 3, url: F + 'index.php?/topic/6-pg-інша-назва/', kind: 'rules', enabled: false };
    expect(plan([rules, law, off], listed).map(p => topicKey(p.url))).toEqual(['t5', 't7']);
  });
  it('тема і з розділу, і окремо — один раз, тип і джерело від окремого, розділ — з розділу', () => {
    const own: SourceRow = { id: 4, url: F + 'index.php?/topic/7-kk/', kind: 'order', enabled: true };
    const p = plan([rules, law, own], listed);
    expect(p.filter(x => topicKey(x.url) === 't7')).toEqual([{ url: own.url, section: 'Закони', kind: 'order', src: 4 }]);
  });
  it('окрема тема, якої немає в жодному розділі, — без розділу (його дасть заголовок сторінки)', () => {
    const solo: SourceRow = { id: 5, url: F + 'index.php?/topic/99-ivent/', kind: 'rules', enabled: true };
    expect(plan([solo], new Map())).toEqual([{ url: solo.url, section: '', kind: 'rules', src: 5 }]);
  });
  it('вимкнений розділ — його теми не беруться', () => {
    expect(plan([{ ...rules, enabled: false }, law], listed).map(p => topicKey(p.url))).toEqual(['t7']);
  });
});

describe('merge: новий знімок', () => {
  const prev = [t(1, 'index.php?/topic/5-dm/', [['1.1', 'Заборонено DM']]), t(2, 'index.php?/topic/7-kk/', [['6.5', 'Викрадення']])];
  it('джерело з помилкою — його теми з попереднього знімка, помилка записана, різниці немає', () => {
    const fresh = [t(1, 'index.php?/topic/5-dm/', [['1.1', 'Заборонено DM']])];
    const r = merge(prev, [rules, law], fresh, new Map([[2, 'форум недоступний']]));
    expect(r.topics.map(x => topicKey(x.url))).toEqual(['t5', 't7']);
    expect(r.results.get(2)).toEqual({ items: null, error: 'форум недоступний', diff: null });
    expect(r.results.get(1)).toEqual({ items: 1, error: null, diff: { added: 0, changed: 0, removed: 0 } });
  });
  it('0 пунктів — як помилка: попередні теми лишаються', () => {
    const r = merge(prev, [rules, law], [t(1, 'index.php?/topic/5-dm/', [['1.1', 'Заборонено DM']]), t(2, 'index.php?/topic/7-kk/', [])], new Map());
    expect(r.topics.find(x => x.src === 2)?.items).toHaveLength(1);
    expect(r.results.get(2)?.error).toMatch(/0 пунктів/);
  });
  it('різниця за ключем «тема + пункт»: додано, змінено, прибрано', () => {
    const before = [t(1, 'index.php?/topic/5-dm/', [['1.1', 'А'], ['1.2', 'Б']])];
    const after = [t(1, 'index.php?/topic/5-dm-нова-назва/', [['1.1', 'А'], ['1.2', 'Б змінено'], ['1.3', 'В']])];
    expect(diff(before, after)).toEqual({ added: 1, changed: 1, removed: 0 });
    expect(diff(after, before)).toEqual({ added: 0, changed: 1, removed: 1 });
  });
  it('той самий номер двічі в темі — два різні пункти, а не один', () => {
    const twice = [t(2, 'index.php?/topic/7-kk/', [['1.1', 'Розділ I'], ['1.1', 'Розділ II']])];
    expect(diff([], twice)).toEqual({ added: 2, changed: 0, removed: 0 });
  });
  it('вимкнене джерело в знімок не потрапляє', () => {
    const r = merge(prev, [rules, { ...law, enabled: false }], [t(1, 'index.php?/topic/5-dm/', [['1.1', 'Заборонено DM']])], new Map());
    expect(r.topics.every(x => x.src === 1)).toBe(true);
    expect(r.results.has(2)).toBe(false);
  });
});
