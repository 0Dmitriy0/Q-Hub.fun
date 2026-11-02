const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionMoney } = require('./sessionmoney.cjs');

const H = 36e5;

test('прибуток за годину: (зараз − початок) / години від першого зчитування', () => {
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

test('витрати — від\'ємний прибуток; переказ готівка ↔ картка суму не змінює', () => {
  const m = sessionMoney();
  m.update('k', { cash: 100000, bank: 0 }, 0);
  m.update('k', { cash: 0, bank: 100000 }, H / 4);
  assert.equal(m.perHour('k', H), 0);
  m.update('k', { cash: 0, bank: 40000 }, H);
  assert.equal(m.perHour('k', H), -60000);
});

test('нова сесія чи інший персонаж — відлік заново; збережений стан переживає перезапуск', () => {
  const m = sessionMoney();
  m.update('s1:c1', { cash: 0, bank: 0 }, 0);
  m.update('s1:c1', { cash: 500000, bank: 0 }, H);
  assert.equal(m.update('s2:c1', { cash: 500000, bank: 0 }, 2 * H), true);
  assert.equal(m.perHour('s1:c1', 3 * H), null, 'стара сесія більше не рахується');
  assert.equal(m.perHour('s2:c1', 3 * H), 0);
  const again = sessionMoney(m.state());
  again.update('s2:c1', { cash: 600000, bank: 0 }, 3 * H);
  assert.equal(again.perHour('s2:c1', 3 * H), 100000);
  assert.equal(sessionMoney({ junk: 1 }).perHour('s2:c1', 3 * H), null, 'зіпсований збережений стан — з нуля');
});
