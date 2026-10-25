const test = require('node:test');
const assert = require('node:assert');
const { netOf, perHour } = require('./strip.cjs');

test('чистий: надходження мінус витрати, перекази не рахуються', () => {
  assert.strictEqual(netOf([
    { type: 'in', amount: 15000, source: 'desktop' },
    { type: 'out', amount: 2500, source: 'manual' },
    { type: 'out', amount: 50000, source: 'transfer' },
    { type: 'in', amount: 50000, source: 'transfer' },
    { type: 'in', amount: '1000', source: 'deal' },
  ]), 13500);
  assert.strictEqual(netOf(null), 0);
});

test('за годину: від хвилини гри, округлено', () => {
  assert.strictEqual(perHour(10000, 30e3), null);
  assert.strictEqual(perHour(10000, 30 * 60e3), 20000);
  assert.strictEqual(perHour(-5000, 2 * 36e5), -2500);
});
