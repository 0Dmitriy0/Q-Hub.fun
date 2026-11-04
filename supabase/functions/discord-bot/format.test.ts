import { describe, expect, it } from 'vitest';
import { kyivTime, money, nextChange, pricesMessage } from './format';
import type { Group } from './prices';

const SITE = 'https://q-hub.fun';
const winter = new Date('2026-11-04T12:32:00Z');   // 14:32 за Києвом (UTC+2)
const summer = new Date('2026-07-04T12:32:00Z');   // 15:32 (UTC+3)
const g = (id: string, rows: Group['rows'], next: string | null = null): Group =>
  ({ buyer: { id, name: 'Скупник ' + id, sort: 0, next_change_at: next }, rows });

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

describe('повідомлення цін', () => {
  it('заголовок, embed на скупника, позначки змін', () => {
    const [m] = pricesMessage([g('hide', [
      { item_id: 1, name: 'Шкура оленя', price: 1250, prev: 1200 },
      { item_id: 2, name: 'Шкура кабана', price: 980, prev: 1000 },
      { item_id: 3, name: 'Ікра', price: 410, prev: null },
    ], '2026-11-04T16:00:00Z')], { now: winter, site: SITE });
    expect(m.content).toBe('🛒 Оновлення цін скупників · 14:32');
    expect(m.embeds).toHaveLength(1);
    const e = m.embeds![0];
    expect(e.title).toBe('Скупник hide');
    expect(e.url).toBe(SITE + '/tsiny#hide');
    expect(e.description).toBe([
      'Шкура оленя — **1 250 $** ▲ +50',
      'Шкура кабана — **980 $** ▼ −20',
      'Ікра — **410 $** ● нове',
    ].join('\n'));
    expect(e.footer?.text).toBe('Наступна зміна: сьогодні о 18:00 · Q-Hub');
    expect(e.color).toBe(0xff6b00);
  });
  it('без відомої наступної зміни — footer лише Q-Hub', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'А', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].footer?.text).toBe('Q-Hub');
  });
  it('більше 10 скупників — кілька повідомлень з (1/2), (2/2)', () => {
    const many = Array.from({ length: 12 }, (_, i) => g('b' + i, [{ item_id: i, name: 'П' + i, price: 10, prev: 5 }]));
    const ms = pricesMessage(many, { now: winter, site: SITE });
    expect(ms).toHaveLength(2);
    expect(ms[0].embeds).toHaveLength(10);
    expect(ms[1].embeds).toHaveLength(2);
    expect(ms[0].content).toBe('🛒 Оновлення цін скупників · 14:32 (1/2)');
    expect(ms[1].content).toBe('🛒 Оновлення цін скупників · 14:32 (2/2)');
  });
  it('довгий список ділиться, а не обрізається; ліміти Discord дотримано', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ item_id: i, name: 'Дуже довга назва предмета номер ' + i, price: 100000 + i, prev: 100000 }));
    const ms = pricesMessage([g('hide', rows)], { now: winter, site: SITE });
    const lines = ms.flatMap(m => m.embeds!.flatMap(e => e.description!.split('\n')));
    expect(lines).toHaveLength(200);
    for (const m of ms) {
      expect(m.embeds!.length).toBeLessThanOrEqual(10);
      const total = m.embeds!.reduce((t, e) => t + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0), 0);
      expect(total).toBeLessThanOrEqual(6000);
      for (const e of m.embeds!) expect(e.description!.length).toBeLessThanOrEqual(4096);
    }
    expect(ms.flatMap(m => m.embeds!)[1].title).toBe('Скупник hide (продовження)');
    expect(ms.length).toBeGreaterThan(1);
  });
  it('розмітка в назвах не ламає повідомлення', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'Риба *золота*_x', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].description).toContain('Риба \\*золота\\*\\_x');
  });
});
