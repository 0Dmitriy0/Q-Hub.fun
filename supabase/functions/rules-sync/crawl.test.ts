import { describe, expect, it } from 'vitest';
import { crawl } from './crawl';
import type { SourceRow } from './merge';

/* specs/095: обхід, спільний для функції й програми адміна */
const F = 'https://forum.quant5.com.ua/';
const post = (id: number, body: string) => `<div id='comment-${id}_wrap'><div data-commentID="${id}" data-quoteData='{&quot;username&quot;:&quot;Admin&quot;}'></div>`
  + `<div data-role='commentContent' class='ipsType_richText'>${body}</div><div class='cPostShareMenu'></div></div>`;
const topic = (title: string, body: string) => `<title>${title} - Загальні правила - QuantRP</title>` + post(1, body);
const site: Record<string, string> = {
  'index.php?/forum/10-правила/': `<h1>Правила серверу</h1><a href='index.php?/topic/5-dm/'>t</a>`,
  'index.php?/topic/5-dm/': topic('ДМ', '<p>1.1 Заборонено вбивати без причини.</p><p>1.2 Заборонено таранити.</p>'),
  'index.php?/topic/9-окрема/': topic('Окрема', '<p>2.1 Правило окремої теми.</p>'),
};
const rules: SourceRow = { id: 1, url: F + 'index.php?/forum/10-правила/', kind: 'rules', enabled: true };
const broken: SourceRow = { id: 2, url: F + 'index.php?/forum/36-немає/', kind: 'law', enabled: true };
const solo: SourceRow = { id: 3, url: F + 'index.php?/topic/9-окрема/', kind: 'order', enabled: true };
const off: SourceRow = { id: 4, url: F + 'index.php?/forum/77-вимкнений/', kind: 'law', enabled: false };

const seen: string[] = [];
const get = async (p: string) => {
  const k = p.replace(F, '');
  seen.push(k);
  if (!(k in site)) throw new Error('форум відповів 404');
  return site[k];
};

describe('crawl (specs/095)', () => {
  it('джерела → теми з пунктами; помилка одного джерела не зупиняє інші; вимкнене не читається', async () => {
    seen.length = 0;
    const { fresh, errors, titles } = await crawl(get, [rules, broken, solo, off]);
    expect(fresh.map(t => [t.src, t.kind, t.items.length]).sort()).toEqual([[1, 'rules', 2], [3, 'order', 1]]);
    expect([...errors.keys()]).toEqual([2]);
    expect(errors.get(2)).toMatch(/404/);
    expect(titles.get(1)).toBe('Правила серверу');
    expect(titles.get(3)).toBe('Окрема');
    expect(seen.some(s => s.includes('77-'))).toBe(false);
  });

  it('stop(e) — обриває весь обхід першою ж такою помилкою (програма: форум блокує)', async () => {
    class Blocked extends Error {}
    let n = 0;
    const blocking = async () => { n++; throw new Blocked('форум не пускає (403)'); };
    await expect(crawl(blocking, [rules, solo], e => e instanceof Blocked)).rejects.toBeInstanceOf(Blocked);
    expect(n).toBe(1);
  });
});
