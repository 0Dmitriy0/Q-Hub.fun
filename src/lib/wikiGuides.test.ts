import { describe, expect, it } from 'vitest';
import { byCategory, guidePieces, slugOf, slugOk, type WikiGuide } from './wikiGuides';

const g = (slug: string, category: string, sort = 100, title = slug): WikiGuide => ({ slug, title, category, summary: '', body: '', sort, checked_on: null, published: true });

describe('гайди WIKI', () => {
  it('сторінки сайту — посилання, команди гри — ні', () => {
    expect(guidePieces('Усі роботи — /wiki/roboty, мапа: /mapa.')).toEqual([
      { k: 'text', v: 'Усі роботи — ' }, { k: 'site', v: '/wiki/roboty' }, { k: 'text', v: ', мапа: ' }, { k: 'site', v: '/mapa' }, { k: 'text', v: '.' }]);
    expect(guidePieces('/me дістав, /do Є маска? /try')).toEqual([{ k: 'text', v: '/me дістав, /do Є маска? /try' }]);
    expect(guidePieces('Програма: /programa і [Влаштуватися]').map(p => p.k)).toEqual(['text', 'site', 'text', 'btn']);
    expect(guidePieces('див. https://forum.quant5.com.ua/ і /tsiny?item=5').map(p => p.k)).toEqual(['text', 'url', 'text', 'site']);
  });
  it('розділи в заданому порядку, у розділі — за sort', () => {
    const r = byCategory([g('c', 'Заробіток', 30), g('x', 'Інше'), g('a', 'Новачку'), g('b', 'Заробіток', 20)]);
    expect(r.map(s => s.category)).toEqual(['Новачку', 'Заробіток', 'Інше']);
    expect(r[1].guides.map(x => x.slug)).toEqual(['b', 'c']);
  });
  it('адреса з назви', () => {
    expect(slugOf('Перший день на Quant RP')).toBe('pershyi-den-na-quant-rp');
    expect(slugOf("Фарм і скупники: як заробити")).toBe('farm-i-skupnyky-iak-zarobyty');
    expect(slugOk('pershi-groshi')).toBe(true);
    expect(slugOk('Пер')).toBe(false);
  });
});
