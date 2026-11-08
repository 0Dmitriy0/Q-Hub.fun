import { describe, expect, it } from 'vitest';
import { blocksError, emptyBlock, GUIDE_ICONS, linkOk, tidyBlocks } from './guideBlocks';
import { diff, FIELDS, parseInput, toInput, validate } from './wiki';
import { GUIDES, type GuideBlock } from '../data/guides';
import mig from '../../supabase/migrations/0065_wiki_guides.sql?raw';

describe('блоки гайду: ті самі межі, що в базі (0065)', () => {
  it('усі гайди з коду проходять', () => { for (const g of GUIDES) expect(blocksError(g.blocks), g.slug).toBe(''); });
  it('іконки — той самий список, що wiki_guide_icons()', () => {
    const sql = mig.match(/select array\[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map(s => s.slice(1, -1));
    expect(GUIDE_ICONS).toEqual(sql);
    for (const g of GUIDES) expect(GUIDE_ICONS).toContain(g.icon);
  });
  it('сід міграції містить усі гайди з коду', () => { for (const g of GUIDES) expect(mig).toContain(`('${g.slug}', `); });
  it('порожній гайд, порожній абзац, порожня назва стовпця — помилка', () => {
    expect(blocksError([])).toMatch(/хоча б один/);
    expect(blocksError([{ k: 'p', text: '  ' }])).toMatch(/порожній/);
    expect(blocksError([{ k: 'table', head: ['a', ''], rows: [['1', '2']] }])).toMatch(/назва/);
    expect(blocksError([{ k: 'table', head: ['a', 'b'], rows: [['1']] }])).toMatch(/2 клітинок/);
  });
  it('посилання — лише на сторінки сайту', () => {
    expect(linkOk('/wiki/roboty?job=farmer')).toBe(true);
    expect(linkOk('/mapa#x=1&y=2&z=6')).toBe(true);
    expect(linkOk('https://evil.example')).toBe(false);
    expect(linkOk('//evil.example')).toBe(false);
    expect(linkOk('/wiki/<script>')).toBe(false);
    expect(blocksError([{ k: 'links', items: [{ to: 'https://x.example', label: 'x' }] }])).toMatch(/сторінки сайту/);
  });
  it('новий блок кожного типу порожній — і саме тому не пройде, поки його не заповнять', () => {
    for (const k of ['p', 'h', 'list', 'tip', 'warn', 'table', 'links'] as const) expect(blocksError([emptyBlock(k)]), k).not.toBe('');
  });
});

describe('tidyBlocks: що піде в базу', () => {
  it('прибирає порожні пункти списку, пробіли й незаповнені посилання', () => {
    const raw: GuideBlock[] = [
      { k: 'list', items: [' a ', '', 'b', ''], ordered: true },
      { k: 'links', items: [{ to: ' /wiki/roboty ', label: ' Роботи ' }, { to: '/wiki/', label: '' }] },
      { k: 'p', text: '  текст  ' },
    ];
    expect(tidyBlocks(raw)).toEqual([
      { k: 'list', items: ['a', 'b'], ordered: true },
      { k: 'links', items: [{ to: '/wiki/roboty', label: 'Роботи' }] },
      { k: 'p', text: 'текст' },
    ]);
  });
  it('Enter у кінці списку не дає помилки (порожній рядок прибереться)', () => {
    const f = FIELDS.guide.find(x => x.key === 'blocks')!;
    const v = parseInput(f, JSON.stringify([{ k: 'list', items: ['перший', ''] }]));
    expect(validate('guide', { blocks: v }, false)).toEqual({});
  });
});

describe('гайд як розділ довідника', () => {
  const g = GUIDES[0];
  const data = { id: g.slug, name: g.title, summary: g.summary, icon: g.icon, blocks: g.blocks };
  const f = FIELDS.guide.find(x => x.key === 'blocks')!;
  it('блоки проходять форму туди й назад без «змін»', () => {
    const back = parseInput(f, toInput(f, g.blocks) as string);
    expect(diff('guide', data, { ...data, blocks: back })).toEqual({});
  });
  it('змінений абзац — зміна поля blocks', () => {
    const blocks = g.blocks.map((b, i) => (i === 0 && b.k === 'p' ? { ...b, text: b.text + ' Ще речення.' } : b));
    expect(Object.keys(diff('guide', data, { ...data, blocks }))).toEqual(['blocks']);
  });
  it('новий гайд: потрібні назва, «коротко», текст і адреса', () => {
    const err = validate('guide', { name: 'Ри' }, true);
    expect(Object.keys(err).sort()).toEqual(['blocks', 'id', 'summary']);
    expect(validate('guide', { id: 'rybalka', name: 'Рибалка з нуля', summary: 'Де ловити', icon: 'boat', blocks: [{ k: 'p', text: 'Вудка' }] }, true)).toEqual({});
  });
});
