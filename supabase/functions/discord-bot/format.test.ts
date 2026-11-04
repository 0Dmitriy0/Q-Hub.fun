import { describe, expect, it } from 'vitest';
import { LEGEND, kyivTime, money, nextChange, pricesMessage, profit, tier } from './format';
import type { BoardRow, Group } from './prices';

const SITE = 'https://q-hub.fun';
const winter = new Date('2026-11-04T12:32:00Z');   // 14:32 за Києвом (UTC+2)
const summer = new Date('2026-07-04T12:32:00Z');   // 15:32 (UTC+3)
const g = (id: string, rows: Group['rows'], next: string | null = null, board?: BoardRow[]): Group =>
  ({ buyer: { id, name: id === 'mush' ? 'Гриби' : 'Скупник ' + id, sort: 0, next_change_at: next }, rows, board });

describe('числа й час', () => {
  it('пробіл тисяч і $', () => {
    expect(money(1250)).toBe('1 250 $');
    expect(money(980)).toBe('980 $');
    expect(money(1234567)).toBe('1 234 567 $');
  });
  it('час за Києвом — зима й літо', () => {
    expect(kyivTime(winter)).toBe('14:32');
    expect(kyivTime(summer)).toBe('15:32');
  });
  it('наступна зміна: сьогодні / завтра / дата; минула — нічого', () => {
    expect(nextChange('2026-11-04T16:00:00Z', winter)).toBe('сьогодні о 18:00');
    expect(nextChange('2026-11-04T22:30:00Z', winter)).toBe('завтра о 00:30');
    expect(nextChange('2026-11-07T08:00:00Z', winter)).toBe('7 листопада о 10:00');
    expect(nextChange('2026-11-04T10:00:00Z', winter)).toBeNull();
    expect(nextChange(null, winter)).toBeNull();
  });
});

describe('вигідність', () => {
  it('положення між мінімумом і максимумом, 0–100; без меж — null', () => {
    expect(profit(150, 100, 200)).toBe(50);
    expect(profit(250, 100, 200)).toBe(100);
    expect(profit(50, 100, 200)).toBe(0);
    expect(profit(150, 0, 0)).toBeNull();
    expect(profit(150, 200, 200)).toBeNull();
  });
  it('значок за вигідністю', () => {
    expect([tier(95), tier(90), tier(75), tier(45), tier(10), tier(null)]).toEqual(['🔥', '🔥', '🟢', '🟡', '🔴', '⚪']);
  });
});

describe('повідомлення цін — увесь прайс скупника', () => {
  const board: BoardRow[] = [
    { item_id: 1, name: 'Печериця', price: 63, min: 30, max: 99 },
    { item_id: 2, name: 'Цар-гриб', price: 5730, min: 3000, max: 5850 },
    { item_id: 3, name: 'Опеньок', price: 71, min: 50, max: 159 },
    { item_id: 4, name: 'Лисичка', price: 333, min: 100, max: 345 },
  ];
  const rows = [
    { item_id: 2, name: 'Цар-гриб', price: 5730, prev: 5610 },
    { item_id: 1, name: 'Печериця', price: 63, prev: 68 },
    { item_id: 4, name: 'Лисичка', price: 333, prev: null },
  ];

  it('заголовок, зведення змін, найвигідніше зверху, позначки змін, наступна зміна', () => {
    const [m] = pricesMessage([g('mush', rows, '2026-11-04T15:10:00Z', board)], { now: winter, site: SITE });
    expect(m.content).toBe('🍄 Гриби — нові ціни · 14:32');
    const e = m.embeds![0];
    expect(e.title).toBe('🍄 Гриби — ціни скупника');
    expect(e.url).toBe(SITE + '/tsiny#mush');
    expect(e.description).toBe([
      '**Змінилось 3: ▲ 1 · ▼ 1 · ● 1 нове**',
      '',
      '🔥 **Цар-гриб** — 5 730 $ · 96% ▲ +120',
      '🔥 **Лисичка** — 333 $ · 95% ● нове',
      '🟡 **Печериця** — 63 $ · 48% ▼ −5',
      '🔴 **Опеньок** — 71 $ · 19%',
      '',
      '⏰ **Наступна зміна:** сьогодні о 17:10',
    ].join('\n'));
    expect(e.footer?.text).toBe(LEGEND + '\nQ-Hub · q-hub.fun');
    expect(e.timestamp).toBe(winter.toISOString());
    expect(e.color).toBe(0xff6b00);
  });

  it('без відомої наступної зміни — рядка немає', () => {
    const [m] = pricesMessage([g('mush', rows, null, board)], { now: winter, site: SITE });
    expect(m.embeds![0].description).not.toContain('Наступна зміна');
  });

  it('без прайсу — лише змінені предмети, без вигідності', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'А', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].description).toContain('⚪ **А** — 1 $ ▼ −1');
  });

  it('кілька скупників в одному каналі — загальний текст, більше 10 — частини (1/2), (2/2)', () => {
    const many = Array.from({ length: 12 }, (_, i) => g('b' + i, [{ item_id: i, name: 'П' + i, price: 10, prev: 5 }]));
    const ms = pricesMessage(many, { now: winter, site: SITE });
    expect(ms).toHaveLength(2);
    expect(ms[0].embeds).toHaveLength(10);
    expect(ms[1].embeds).toHaveLength(2);
    expect(ms[0].content).toBe('🛒 Нові ціни скупників · 14:32 (1/2)');
    expect(ms[1].content).toBe('🛒 Нові ціни скупників · 14:32 (2/2)');
  });

  it('довгий прайс ділиться, а не обрізається; ліміти Discord дотримано', () => {
    const big: BoardRow[] = Array.from({ length: 200 }, (_, i) => ({ item_id: i, name: 'Дуже довга назва предмета номер ' + i, price: 100000 + i, min: 90000, max: 110000 }));
    const ms = pricesMessage([g('hide', [{ item_id: 0, name: big[0].name, price: 100000, prev: 99000 }], '2026-11-04T15:10:00Z', big)], { now: winter, site: SITE });
    const lines = ms.flatMap(m => m.embeds!.flatMap(e => e.description!.split('\n'))).filter(l => l.includes(' $'));
    expect(lines).toHaveLength(200);
    for (const m of ms) {
      expect(m.embeds!.length).toBeLessThanOrEqual(10);
      const total = m.embeds!.reduce((t, e) => t + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0), 0);
      expect(total).toBeLessThanOrEqual(6000);
      for (const e of m.embeds!) expect(e.description!.length).toBeLessThanOrEqual(4096);
    }
    const embeds = ms.flatMap(m => m.embeds!);
    expect(embeds[1].title).toContain('(продовження)');
    expect(embeds[0].description).toContain('Змінилось 1');
    expect(embeds[embeds.length - 1].description).toContain('Наступна зміна');
  });

  it('розмітка в назвах не ламає повідомлення', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'Риба *золота*_x', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].description).toContain('Риба \\*золота\\*\\_x');
  });
});
