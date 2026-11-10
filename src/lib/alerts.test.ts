import { describe, expect, it } from 'vitest';
import {
  EVENT_LEAD, PROMO_QUIET, SELL_GAP, WATCH_MAX, eventDue, eventIds, promoCommand, promoShown, sellDue, sitePromo, watchList, watchToggle,
  type SellSent, type WatchPrice,
} from './alerts';
import { kyTs } from './events';
import { GOOD, STALE } from './pricestats';

const MIN = 60e3, H = 60 * MIN;
const now = Date.parse('2026-11-10T12:00:00Z');
const at = (ago: number) => new Date(now - ago).toISOString();
const p = (itemId: number, item: string, buyer: string, price: number, min = 0, max = 100, when: string | null = at(10 * MIN)): WatchPrice => ({ itemId, item, buyer, price, min, max, at: when });

describe('075 «час здавати»: sellDue', () => {
  it(`ціна від ${GOOD}% діапазону й свіжа — одне сповіщення з товаром, скупником, ціною й відсотком`, () => {
    const r = sellDue([1], [p(1, 'Шкура вовка', 'Шкури', 92)], {}, now);
    expect(r.note).toEqual({ title: 'Час здавати: Шкура вовка', body: expect.stringMatching(/^Скупник «Шкури»: 92.\$ — 92% діапазону\.$/) });
    expect(r.changed).toBe(true);
    expect(r.sent).toEqual({ 1: { at: now, price: 92, buyer: 'Шкури' } });
  });
  it('нижче порога, не позначений товар, порожній список — тиша', () => {
    expect(sellDue([1], [p(1, 'A', 'X', 79)], {}, now).note).toBeNull();
    expect(sellDue([2], [p(1, 'A', 'X', 95)], {}, now).note).toBeNull();
    expect(sellDue([], [p(1, 'A', 'X', 95)], {}, now)).toMatchObject({ note: null, changed: false });
  });
  it('рівно поріг — уже сповіщає', () => {
    expect(sellDue([1], [p(1, 'A', 'X', GOOD)], {}, now).note).not.toBeNull();
  });
  it(`ціна, старша за ${STALE / H} год, і товар без меж — ніколи`, () => {
    expect(sellDue([1], [p(1, 'A', 'X', 95, 0, 100, at(STALE + MIN))], {}, now).note).toBeNull();
    expect(sellDue([1], [p(1, 'A', 'X', 95, 0, 100, null)], {}, now).note).toBeNull();
    expect(sellDue([1], [p(1, 'A', 'X', 95, 0, 0)], {}, now).note).toBeNull();
  });
  it('та сама ціна в того самого скупника не сповіщає вдруге, скільки б не трималась', () => {
    let sent: SellSent = sellDue([1], [p(1, 'A', 'X', 90)], {}, now).sent;
    for (const later of [5 * MIN, SELL_GAP + MIN, 2 * H]) {
      const r = sellDue([1], [p(1, 'A', 'X', 90, 0, 100, new Date(now + later - MIN).toISOString())], sent, now + later);
      expect(r.note).toBeNull(); sent = r.sent;
    }
  });
  it('інша ціна: до 30 хв — тиша, після — нове сповіщення', () => {
    const sent = sellDue([1], [p(1, 'A', 'X', 90)], {}, now).sent;
    const fresh = (t: number) => [p(1, 'A', 'X', 97, 0, 100, new Date(t - MIN).toISOString())];
    expect(sellDue([1], fresh(now + SELL_GAP - MIN), sent, now + SELL_GAP - MIN).note).toBeNull();
    expect(sellDue([1], fresh(now + SELL_GAP), sent, now + SELL_GAP).note?.title).toBe('Час здавати: A');
  });
  it('впала нижче порога й піднялась до тієї самої ціни — сповіщає знову, але не раніше 30 хв', () => {
    let sent = sellDue([1], [p(1, 'A', 'X', 90)], {}, now).sent;
    const low = sellDue([1], [p(1, 'A', 'X', 50)], sent, now + 5 * MIN);
    expect(low.note).toBeNull(); expect(low.changed).toBe(true); sent = low.sent;
    const up = (t: number) => sellDue([1], [p(1, 'A', 'X', 90, 0, 100, new Date(t - MIN).toISOString())], sent, t);
    expect(up(now + 10 * MIN).note).toBeNull();
    expect(up(now + SELL_GAP).note).not.toBeNull();
  });
  it('два скупники — рахується той, хто платить більше; у сповіщенні саме він', () => {
    const r = sellDue([1], [p(1, 'A', 'Ферма', 200, 0, 1000), p(1, 'A', 'Ринок', 900, 0, 1000)], {}, now);
    expect(r.note?.body).toContain('«Ринок»');
    /* дорожчий скупник поза зеленою зоною — тиша, хоч у дешевшого вона зелена */
    expect(sellDue([1], [p(1, 'A', 'Ферма', 95, 0, 100), p(1, 'A', 'Ринок', 500, 0, 1000)], {}, now).note).toBeNull();
  });
  it('кілька товарів за одну перевірку — одне сповіщення; понад три — «і ще N»', () => {
    const r = sellDue([1, 2], [p(1, 'A', 'X', 90), p(2, 'B', 'Y', 85)], {}, now);
    expect(r.note).toEqual({ title: 'Час здавати: 2 товари', body: expect.stringContaining('\n') });
    const five = sellDue([1, 2, 3, 4, 5], [1, 2, 3, 4, 5].map(i => p(i, 'T' + i, 'X', 90)), {}, now);
    expect(five.note?.title).toBe('Час здавати: 5 товарів');
    expect(five.note?.body.split('\n')).toHaveLength(4);
    expect(five.note?.body).toContain('і ще 2');
  });
  it('пам\'ять про товар, з якого зняли позначку, прибирається; id рядком і числом — той самий товар', () => {
    const r = sellDue(['2'], [p(2, 'B', 'Y', 10)], { 1: { at: now, price: 90, buyer: 'X' } }, now);
    expect(r.sent).toEqual({}); expect(r.changed).toBe(true);
    expect(sellDue(['2'], [p(2, 'B', 'Y', 90)], {}, now).note).not.toBeNull();
  });
});

describe('075: список «стежу»', () => {
  it('дзвіночок додає й знімає; хибний id — без змін', () => {
    expect(watchToggle([], 7)).toEqual([7]);
    expect(watchToggle([7, 8], 7)).toEqual([8]);
    expect(watchToggle([7], '7')).toEqual([]);
    expect(watchToggle([7], null)).toEqual([7]);
    expect(watchToggle([7], NaN)).toEqual([7]);
  });
  it(`не більше ${WATCH_MAX} товарів`, () => {
    const full = Array.from({ length: WATCH_MAX }, (_, i) => i);
    expect(watchToggle(full, 999)).toBe(full);
    expect(watchToggle(full, 3)).toHaveLength(WATCH_MAX - 1);
  });
  it('список з налаштувань: без сміття й повторів', () => {
    expect(watchList([1, '1', 2, null, {}, 'a'])).toEqual([1, 2, 'a']);
    expect(watchList('ні')).toEqual([]);
  });
});

/* 2026-11-10 — зимовий час, Київ = UTC+2 */
const ky = (h: number, mi: number, s = 0) => kyTs(2026, 11, 10, h, mi) + s * 1000;

describe('076 нагадування про івенти: eventDue', () => {
  it('за 10 хв до старту — сповіщення з київським часом; за 11 хв — ще ні', () => {
    expect(eventDue(['ufo'], {}, ky(17, 4)).note).toBeNull();
    const r = eventDue(['ufo'], {}, ky(17, 5));
    expect(r.note).toEqual({ title: 'НЛО — через 10 хв', body: 'Початок о 17:15 за Києвом.' });
    expect(r.sent).toEqual({ ufo: ky(17, 15) });
    expect(ky(17, 15)).toBe(Date.parse('2026-11-10T15:15:00Z'));   // час рахується за Києвом, а не за годинником ПК
  });
  it('про той самий старт — один раз, і після перезапуску (sent збережено)', () => {
    const { sent } = eventDue(['ufo'], {}, ky(17, 5));
    expect(eventDue(['ufo'], sent, ky(17, 5, 20)).note).toBeNull();
    expect(eventDue(['ufo'], JSON.parse(JSON.stringify(sent)), ky(17, 12)).note).toBeNull();
    /* наступний старт того ж івенту — знову */
    expect(eventDue(['ufo'], sent, ky(22, 6)).note?.title).toBe('НЛО — через 9 хв');
  });
  it('програму запустили за 4 хв до старту — одразу, з правдивим «через 4 хв»', () => {
    expect(eventDue(['ufo'], {}, ky(12, 11)).note?.title).toBe('НЛО — через 4 хв');
  });
  it('івент уже йде — про цей старт не сповіщає', () => {
    expect(eventDue(['ufo'], {}, ky(12, 16)).note).toBeNull();
  });
  it('невибраний івент і порожній вибір — тиша', () => {
    expect(eventDue(['gungame'], {}, ky(17, 5)).note).toBeNull();
    expect(eventDue([], {}, ky(17, 5)).note).toBeNull();
  });
  it('Лотерея :00 і Перегони :02 — одне спільне сповіщення, обидва відмічені', () => {
    const r = eventDue(['lottery', 'race'], {}, ky(13, 50));
    expect(r.note?.title).toBe('Скоро івенти: Лотерея, Перегони');
    expect(r.note?.body).toBe('Лотерея — о 14:00, через 10 хв\nПерегони — о 14:02, через 12 хв');
    expect(eventDue(['lottery', 'race'], r.sent, ky(13, 52)).note).toBeNull();
  });
  it('НЛО о 22:15 переходить через північ — нагадування лише про старт', () => {
    expect(eventDue(['ufo'], {}, ky(23, 50)).note).toBeNull();
  });
  it(`стала «за ${EVENT_LEAD / MIN} хв»`, () => { expect(EVENT_LEAD).toBe(10 * MIN); });
  it('вибір з налаштувань: лише відомі івенти, без повторів, у порядку розкладу', () => {
    expect(eventIds(['ufo', 'нема', 'lottery', 'ufo', 5])).toEqual(['lottery', 'ufo']);
    expect(eventIds(null)).toEqual([]);
  });
});

describe('077 промокод Q-Hub над плашкою', () => {
  it('показується, лише коли жоден івент не йде й не почнеться за 15 хв', () => {
    expect(PROMO_QUIET).toBe(15 * MIN);
    expect(promoShown(ky(14, 30))).toBe(true);    // Перегони скінчились о 14:07, Лотерея — о 15:00
    expect(promoShown(ky(14, 44))).toBe(true);    // до Лотереї 16 хв
    expect(promoShown(ky(14, 45))).toBe(false);   // рівно 15 хв до Лотереї
    expect(promoShown(ky(15, 3))).toBe(false);    // Лотерея й Перегони йдуть
    expect(promoShown(ky(15, 7))).toBe(false);    // до GunGame о 15:20 — 13 хв
    expect(promoShown(ky(15, 25))).toBe(true);    // GunGame скінчився, до Лотереї 35 хв
    expect(promoShown(ky(13, 0))).toBe(false);    // НЛО 12:15–14:15 іде
    expect(promoShown(ky(5, 1))).toBe(false);     // Рестарт о 05:15 — за 14 хв
  });
  it('рядок з бази: вимкнений, порожній чи з недопустимими знаками — не показуємо', () => {
    expect(sitePromo({ code: ' QHUB ', reward: ' 50.000$ та +1 рівень. ', note: '', enabled: true })).toEqual({ code: 'QHUB', reward: '50.000$ та +1 рівень.' });
    expect(sitePromo({ code: 'QHUB', enabled: false })).toBeNull();
    expect(sitePromo({ code: '', enabled: true })).toBeNull();
    expect(sitePromo({ code: 'Q HUB', enabled: true })).toBeNull();
    expect(sitePromo({ code: '<b>x</b>', enabled: true })).toBeNull();
    expect(sitePromo(null)).toBeNull();
    expect(sitePromo({ code: 'QHUB' })).toEqual({ code: 'QHUB', reward: '' });
  });
  it('команда для чату гри — малими літерами', () => {
    expect(promoCommand('QHUB')).toBe('/promo qhub');
  });
});
