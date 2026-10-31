const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate, dealRows, saleQueue, outQueue, TTL, UNDO } = require('./salequeue.cjs');

const L = (item, qty, price, farm = 0) => ({ item, qty, price, farm });

test('validate: рядки й сума', () => {
  assert.equal(validate([L('A', 10, 475)], 4750), null);
  assert.equal(validate([L('A', 3, 333)], 1000), null);   // ручний вибір: 999 проти 1000 у межах Σ qty
  assert.equal(validate([L('A', 10, 400)], 4750), 'Сума не збігається з продажем.');
  assert.equal(validate([L('A', 0, 475)], 0), 'Вкажи кількість.');
  assert.equal(validate([L('A', 2, 10, 3)], 20), 'Хибна кількість.');
  assert.equal(validate([L('A', 2, 10.5)], 21), 'Хибна ціна.');
  assert.equal(validate([L('', 2, 10)], 20), 'Обери товар.');
  assert.equal(validate([L('x'.repeat(81), 2, 10)], 20), 'Обери товар.');
  assert.equal(validate([], 20), 'Нема що списувати.');
});

test('dealRows: «Нафармив» на 1 мс раніше, стабільні external_id', () => {
  const at = Date.parse('2026-10-31T12:00:00Z');
  const r = dealRows('t1', [L('A', 10, 475, 6), L('B', 2, 5)], at, 'c1');
  assert.deepEqual(r.map(d => [d.op, d.item, d.qty, d.price, d.external_id, d.tx_id, d.character_id]), [
    ['farm', 'A', 6, 0, 'sale:t1:0:farm', 't1', 'c1'], ['sell', 'A', 10, 475, 'sale:t1:0:sell', 't1', 'c1'], ['sell', 'B', 2, 5, 'sale:t1:1:sell', 't1', 'c1'],
  ]);
  assert.equal(Date.parse(r[0].ts), at - 1);
  assert.deepEqual(dealRows('t1', [L('A', 10, 475, 6)], at, 'c1').map(d => d.external_id), ['sale:t1:0:farm', 'sale:t1:0:sell']);
});

test('saleQueue: без дублів, TTL, скасування лише 10 с', () => {
  let t = 0;
  const q = saleQueue(() => t);
  assert.equal(q.add({ txId: 'a', at: 0 }), true);
  assert.equal(q.add({ txId: 'a', at: 0 }), false);
  q.add({ txId: 'b', at: 0 });
  assert.deepEqual(q.pending().map(s => s.txId), ['a', 'b']);
  assert.equal(q.confirm('a'), true);
  assert.equal(q.confirm('a'), false);
  t = UNDO - 1; assert.equal(q.undo('a'), true);
  assert.equal(q.confirm('b'), true);
  t = 2 * UNDO + 1; assert.equal(q.undo('b'), false);
  q.add({ txId: 'c', at: t });
  assert.equal(q.decline('c'), true);
  assert.equal(q.decline('c'), false);
  q.add({ txId: 'd', at: t });
  t += TTL + 1; assert.equal(q.state('d'), 'expired');
  assert.deepEqual(q.pending(), []);
});

test('outQueue: лишає неуспішне, прибирає відправлене й скасоване', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sq-')), 'out.json');
  const o = outQueue(file);
  o.put('a', [1]); o.put('b', [2]); o.put('a', [3]);
  assert.equal(o.size(), 2);
  await o.flush(async rows => (rows[0] === 3 ? 'ok' : 'retry'));
  assert.equal(o.size(), 1);
  assert.equal(o.drop('b'), true);
  assert.equal(o.drop('b'), false);
  assert.equal(fs.existsSync(file), false);
});
