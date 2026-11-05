import { describe, expect, it } from 'vitest';
import { kyivTime, money, newsDescription, newsMessage, newsTooLong, nextChange, pricesMessage, profit, tier } from './format';
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

  it('заголовок, зведення змін і наступна зміна вгорі, розділи за вигідністю, найвигідніше зверху', () => {
    const [m] = pricesMessage([g('mush', rows, '2026-11-04T15:10:00Z', board)], { now: winter, site: SITE });
    expect(m.content).toBeUndefined();
    const e = m.embeds![0];
    expect(e.title).toBe('🍄 Гриби — нові ціни');
    expect(e.url).toBe(SITE + '/tsiny#mush');
    expect(e.description).toBe('**Змінилось 3 з 4:** ▲ 1 · ▼ 1 · ● 1 нове\n⏰ Наступна зміна: **сьогодні о 17:10**');
    expect(e.fields).toEqual([
      { name: '🔥 Вигідно продавати · 2', value: '` 96%` Цар-гриб — **5 730 $** ▲ +120\n` 95%` Лисичка — **333 $** ● нове' },
      { name: '🟡 Середньо · 1', value: '` 48%` Печериця — **63 $** ▼ −5' },
      { name: '🔴 Краще почекати · 1', value: '` 19%` Опеньок — **71 $**' },
    ]);
    expect(e.footer?.text).toContain('Q-Hub · q-hub.fun');
    expect(e.timestamp).toBe(winter.toISOString());
    expect(e.color).toBe(0xff6b00);
  });

  it('відсоток однакової ширини: 7% і 100%', () => {
    const [m] = pricesMessage([g('hide', [], null, [
      { item_id: 1, name: 'А', price: 107, min: 100, max: 200 },
      { item_id: 2, name: 'Б', price: 200, min: 100, max: 200 },
    ])], { now: winter, site: SITE });
    const all = m.embeds![0].fields!.map(f => f.value).join('\n');
    expect(all).toContain('`100%` Б');
    expect(all).toContain('`  7%` А');
  });

  it('прайс без змін — «Поточні ціни», без ▲/▼', () => {
    const [m] = pricesMessage([g('mush', [], '2026-11-04T15:10:00Z', board)], { now: winter, site: SITE });
    expect(m.embeds![0].title).toBe('🍄 Гриби — поточні ціни');
    expect(m.embeds![0].description).toBe('**Поточні ціни** · 4 предмети\n⏰ Наступна зміна: **сьогодні о 17:10**');
    expect(m.embeds![0].fields!.map(f => f.value).join('\n')).not.toMatch(/[▲▼●]/);
  });

  it('без відомої наступної зміни — рядка немає', () => {
    const [m] = pricesMessage([g('mush', rows, null, board)], { now: winter, site: SITE });
    expect(m.embeds![0].description).not.toContain('Наступна зміна');
  });

  it('без прайсу — лише змінені предмети, розділ «Без меж»', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'А', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].fields).toEqual([{ name: '⚪ Без меж · 1', value: 'А — **1 $** ▼ −1' }]);
  });

  it('кілька скупників в одному каналі — більше 10 карток ділиться на повідомлення', () => {
    const many = Array.from({ length: 12 }, (_, i) => g('b' + i, [{ item_id: i, name: 'П' + i, price: 10, prev: 5 }]));
    const ms = pricesMessage(many, { now: winter, site: SITE });
    expect(ms).toHaveLength(2);
    expect(ms[0].embeds).toHaveLength(10);
    expect(ms[1].embeds).toHaveLength(2);
    expect(ms.every(x => x.content === undefined)).toBe(true);
  });

  it('довгий прайс ділиться, а не обрізається; ліміти Discord дотримано', () => {
    const big: BoardRow[] = Array.from({ length: 400 }, (_, i) => ({ item_id: i, name: 'Дуже довга назва предмета номер ' + i, price: 100000 + i, min: 90000, max: 110000 }));
    const ms = pricesMessage([g('hide', [{ item_id: 0, name: big[0].name, price: 100000, prev: 99000 }], '2026-11-04T15:10:00Z', big)], { now: winter, site: SITE });
    const embeds = ms.flatMap(m => m.embeds!);
    const lines = embeds.flatMap(e => (e.fields ?? []).flatMap(f => f.value.split('\n')));
    expect(lines).toHaveLength(400);
    for (const m of ms) {
      expect(m.embeds!.length).toBeLessThanOrEqual(10);
      const total = m.embeds!.reduce((t, e) => t + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0)
        + (e.fields ?? []).reduce((s, f) => s + f.name.length + f.value.length, 0), 0);
      expect(total).toBeLessThanOrEqual(6000);
      for (const e of m.embeds!) {
        expect(e.fields!.length).toBeLessThanOrEqual(25);
        for (const f of e.fields!) expect(f.value.length).toBeLessThanOrEqual(1024);
      }
    }
    expect(embeds.length).toBeGreaterThan(1);
    expect(embeds[1].title).toContain('(продовження)');
    expect(embeds[0].description).toContain('Наступна зміна');
  });

  it('розмітка в назвах не ламає повідомлення', () => {
    const [m] = pricesMessage([g('hide', [{ item_id: 1, name: 'Риба *золота*_x', price: 1, prev: 2 }])], { now: winter, site: SITE });
    expect(m.embeds![0].fields![0].value).toContain('Риба \\*золота\\*\\_x');
  });
});

describe('новина з чернетки', () => {
  const d = { title: 'Програма Q-Hub 0.8.0 — що нового', added: ['Нове'], changed: ['Інше', ' '], removed: [] };
  it('групи з «• », порожні не показуються, footer', () => {
    const m = newsMessage(d);
    expect(m.content).toBeUndefined();
    expect(m.embeds![0].title).toBe('Програма Q-Hub 0.8.0 — що нового');
    const e = m.embeds![0];
    expect(e.description).toBe('**✨ Додано**\n• Нове\n\n**🔧 Змінено**\n• Інше');
    expect(e.footer!.text).toBe('Q-Hub · q-hub.fun');
    expect(e.url).toBeUndefined(); expect(e.image).toBeUndefined();
  });
  it('посилання й картинка — лише якщо задані', () => {
    const e = newsMessage({ ...d, link: 'https://q-hub.fun/mapa', image_url: 'https://x/y.webp' }).embeds![0];
    expect(e.url).toBe('https://q-hub.fun/mapa'); expect(e.image).toEqual({ url: 'https://x/y.webp' });
  });
  it('задовге — на скільки перевищено 4096', () => {
    expect(newsTooLong(d)).toBe(0);
    const big = { ...d, added: Array.from({ length: 20 }, () => 'я'.repeat(300)) };
    expect(newsTooLong(big)).toBe(newsDescription(big).length - 4096);
    expect(newsTooLong(big)).toBeGreaterThan(0);
  });
});
