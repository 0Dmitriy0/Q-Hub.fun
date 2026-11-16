const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionMoney } = require('./sessionmoney.cjs');

const H = 36e5;

test('прибуток за годину: сума надходжень / години від першого зчитування', () => {
  const m = sessionMoney();
  assert.equal(m.update('s1:c1', { cash: 1000, bank: 9000 }, 0), true);
  m.update('s1:c1', { cash: 51000, bank: 9000 }, H / 2);
  assert.equal(m.perHour('s1:c1', H / 2), 100000);
  assert.equal(m.perHour('s1:c1', H), 50000, 'час іде й без нових зчитувань');
});

test('перша хвилина — ще рано; без зчитування — null', () => {
  const m = sessionMoney();
  assert.equal(m.perHour('s1:c1', 1000), null);
  m.update('s1:c1', { cash: 10, bank: 0 }, 0);
  assert.equal(m.perHour('s1:c1', 59e3), null);
  assert.equal(m.perHour('s1:c1', 60e3), 0);
});

test('витрати прибуток за годину не зменшують: покупка посеред сеансу не дає мінус', () => {
  const m = sessionMoney();
  m.update('k', { cash: 500000, bank: 0 }, 0);
  m.update('k', { cash: 570000, bank: 0 }, H / 4);
  m.update('k', { cash: 370000, bank: 0 }, H / 2);     // купив за 200 000
  m.update('k', { cash: 440000, bank: 0 }, H);
  assert.equal(m.perHour('k', H), 140000, 'заробив 70 000 + 70 000, а не −60 000 «чистими»');
  assert.equal(m.summary('k').money_end - m.summary('k').money_start, -60000, '«Чистими» для кабінету — як було');
});

test('цифра, що на мить прочиталась неправильно й повернулась, — не заробіток', () => {
  const m = sessionMoney();
  m.update('k', { cash: 1000, bank: 1538292 }, 0);
  m.update('k', { cash: 1000, bank: 3538292 }, 2e3);
  m.update('k', { cash: 1000, bank: 1538292 }, 4e3);
  m.update('k', { cash: 31000, bank: 1538292 }, H);
  assert.equal(m.perHour('k', H), 30000);
  assert.deepEqual([m.summary('k').money_gain, m.summary('k').money_flag], [30000, false]);
});

test('велике надходження: у смужці — після 90 с перевірки, у підсумку сеансу — одразу', () => {
  const m = sessionMoney();
  m.update('k', { cash: 0, bank: 0 }, 0);
  m.update('k', { cash: 300000, bank: 0 }, H / 2);
  assert.equal(m.perHour('k', H / 2), 0);
  assert.equal(m.summary('k').money_gain, 300000);
  m.update('k', { cash: 300000, bank: 0 }, H / 2 + 91e3);
  assert.equal(m.perHour('k', H), 300000);
  assert.equal(m.summary('k').money_gain, 300000);
});

test('сеанс, початий старою програмою (стан без нового обліку), рахується далі без втрат', () => {
  const m = sessionMoney({ key: 'k', start: 1000, startAt: 0, last: 51000, lastAt: H / 2, gain: 50000, flag: false });
  m.update('k', { cash: 61000, bank: 0 }, H / 2 + 2e3);
  m.update('k', { cash: 71000, bank: 0 }, H);
  assert.equal(m.perHour('k', H), 70000);
  assert.equal(m.summary('k').money_gain, 70000);
});

test('нова сесія чи інший персонаж — відлік заново; збережений стан переживає перезапуск', () => {
  const m = sessionMoney();
  m.update('s1:c1', { cash: 0, bank: 0 }, 0);
  m.update('s1:c1', { cash: 500000, bank: 0 }, H);
  assert.equal(m.update('s2:c1', { cash: 500000, bank: 0 }, 2 * H), true);
  assert.equal(m.perHour('s1:c1', 3 * H), null, 'стара сесія більше не рахується');
  assert.equal(m.perHour('s2:c1', 3 * H), 0);
  const again = sessionMoney(m.state());
  again.update('s2:c1', { cash: 560000, bank: 0 }, 3 * H);
  assert.equal(again.perHour('s2:c1', 3 * H), 60000);
  assert.equal(sessionMoney({ junk: 1 }).perHour('s2:c1', 3 * H), null, 'зіпсований збережений стан — з нуля');
});

/* specs/044: підсумок сеансу для кабінету — «Заробив» (сума зростань) і «Чистими» (кінець − початок) */
test('«Заробив» — сума зростань, витрати її не зменшують; «Чистими» — різниця', () => {
  const m = sessionMoney();
  m.update('k', { cash: 1000000, bank: 0 }, 0, 5e6);
  m.update('k', { cash: 1100000, bank: 0 }, H / 4, 5e6);
  m.update('k', { cash: 1070000, bank: 0 }, H / 2, 5e6);
  m.update('k', { cash: 1070000, bank: 50000 }, H, 5e6);
  assert.deepEqual(m.summary('k'), {
    money_from: new Date(0).toISOString(), money_to: new Date(H).toISOString(),
    money_start: 1000000, money_end: 1120000, money_gain: 150000, money_flag: false,
  });
});

test('стрибок понад поріг — позначка «сумнівне», у «Заробив» не йде; далі рахується від нового значення', () => {
  const m = sessionMoney();
  m.update('k', { cash: 100000, bank: 0 }, 0, 5e6);
  m.update('k', { cash: 9100000, bank: 0 }, 60e3, 5e6);
  let s = m.summary('k');
  assert.equal(s.money_flag, true);
  assert.equal(s.money_gain, 0);
  m.update('k', { cash: 9150000, bank: 0 }, 120e3, 5e6);
  s = m.summary('k');
  assert.equal(s.money_gain, 50000, 'після стрибка — від нового значення');
  assert.equal(s.money_end, 9150000);

  const d = sessionMoney();
  d.update('k', { cash: 8000000, bank: 0 }, 0, 5e6);
  d.update('k', { cash: 1000000, bank: 0 }, 60e3, 5e6);
  assert.equal(d.summary('k').money_flag, true, 'падіння понад поріг — теж сумнівне');
});

test('рівно поріг — ще правдоподібно; без порогу — типові 5 000 000', () => {
  const m = sessionMoney();
  m.update('k', { cash: 0, bank: 0 }, 0, 5e6);
  m.update('k', { cash: 5e6, bank: 0 }, 60e3, 5e6);
  assert.deepEqual([m.summary('k').money_gain, m.summary('k').money_flag], [5e6, false]);
  const d = sessionMoney();
  d.update('k', { cash: 0, bank: 0 }, 0);
  d.update('k', { cash: 6e6, bank: 0 }, 60e3);
  assert.equal(d.summary('k').money_flag, true);
});

test('підсумок: до першого зчитування й для чужого ключа — null; новий ключ — з нуля; стан переживає перезапуск', () => {
  const m = sessionMoney();
  assert.equal(m.summary('k'), null);
  m.update('s1:c1', { cash: 0, bank: 0 }, 0, 5e6);
  m.update('s1:c1', { cash: 300, bank: 0 }, 60e3, 5e6);
  assert.equal(m.summary('s1:c2'), null, 'інший персонаж — не його підсумок');
  m.update('s1:c2', { cash: 1000, bank: 0 }, 120e3, 5e6);
  assert.equal(m.summary('s1:c2').money_gain, 0, 'інший персонаж — відлік заново');
  const again = sessionMoney(m.state());
  again.update('s1:c2', { cash: 1500, bank: 0 }, 180e3, 5e6);
  assert.equal(again.summary('s1:c2').money_gain, 500);
  const old = sessionMoney({ key: 'k', start: 10, startAt: 0, last: 30 });
  assert.deepEqual([old.summary('k').money_gain, old.summary('k').money_to], [0, new Date(0).toISOString()], 'стан 0.6 без gain/lastAt — без падіння');
});
