const test = require('node:test');
const assert = require('node:assert');
const { createIdle } = require('./idlewin.cjs');

const hidden = { exists: true, visible: false };

test('сховане вікно закривається лише після ttl поспіль', () => {
  const idle = createIdle(1000);
  assert.equal(idle.due('map', hidden, 0), false);
  assert.equal(idle.due('map', hidden, 999), false);
  assert.equal(idle.due('map', hidden, 1000), true);
  assert.equal(idle.due('map', hidden, 1001), false);   // відлік почався заново
});

test('показ скидає відлік', () => {
  const idle = createIdle(1000);
  idle.due('map', hidden, 0);
  assert.equal(idle.due('map', { exists: true, visible: true }, 900), false);
  assert.equal(idle.due('map', hidden, 1000), false);
  assert.equal(idle.due('map', hidden, 1999), false);
  assert.equal(idle.due('map', hidden, 2000), true);
});

test('потрібне вікно (keep) і неіснуюче не закриваються', () => {
  const idle = createIdle(1000);
  assert.equal(idle.due('rule', { ...hidden, keep: true }, 0), false);
  assert.equal(idle.due('rule', { ...hidden, keep: true }, 5000), false);
  assert.equal(idle.due('timer', { exists: false, visible: false }, 0), false);
  assert.equal(idle.due('timer', { exists: false, visible: false }, 5000), false);
});

test('вікна рахуються окремо', () => {
  const idle = createIdle(1000);
  idle.due('map', hidden, 0);
  idle.due('timer', hidden, 500);
  assert.equal(idle.due('map', hidden, 1000), true);
  assert.equal(idle.due('timer', hidden, 1000), false);
});
