const test = require('node:test');
const assert = require('node:assert/strict');
const { blackWatch, HOLD_MS, COOLDOWN_MS } = require('./blackwatch.cjs');

const T0 = 1_000_000;

test('чорний кадр 20 с поспіль — одне попередження', () => {
  const w = blackWatch();
  assert.equal(w.feed(true, T0), null);
  assert.equal(w.feed(true, T0 + HOLD_MS - 1), null);
  assert.equal(w.feed(true, T0 + HOLD_MS), 'warn');
  assert.equal(w.feed(true, T0 + HOLD_MS + 2000), null);   // той самий епізод — без повтору
  assert.equal(w.black, true);
});

test('короткий чорний кадр (екран завантаження) — без попередження', () => {
  const w = blackWatch();
  w.feed(true, T0);
  w.feed(true, T0 + 10e3);
  assert.equal(w.feed(false, T0 + 12e3), null);   // банера не було — і знімати нічого
  assert.equal(w.black, false);
  assert.equal(w.feed(true, T0 + 14e3), null);
  assert.equal(w.feed(true, T0 + 14e3 + HOLD_MS - 1), null);
});

test('гру перемкнули на «вікно без рамки» — попередження знімається', () => {
  const w = blackWatch();
  w.feed(true, T0); w.feed(true, T0 + HOLD_MS);
  assert.equal(w.feed(false, T0 + HOLD_MS + 1000), 'clear');
  assert.equal(w.black, false);
  assert.equal(w.feed(false, T0 + HOLD_MS + 3000), null);
});

test('знову повноекранний: повтор попередження не частіше, ніж раз на 30 хв; банер — одразу', () => {
  const w = blackWatch();
  w.feed(true, T0); w.feed(true, T0 + HOLD_MS);
  w.feed(false, T0 + HOLD_MS + 1000);
  w.feed(true, T0 + 60e3);
  assert.equal(w.feed(true, T0 + 60e3 + HOLD_MS), 'show');    // банер знову, без сповіщення
  assert.equal(w.black, true);
  w.feed(false, T0 + 100e3);
  w.feed(true, T0 + COOLDOWN_MS + 1);
  assert.equal(w.feed(true, T0 + COOLDOWN_MS + 1 + HOLD_MS), 'warn');
});

test('без кадрів (гру закрито) — reset, наступна гра рахує заново', () => {
  const w = blackWatch();
  w.feed(true, T0); w.feed(true, T0 + HOLD_MS);
  assert.equal(w.reset(), 'clear');
  assert.equal(w.black, false);
  assert.equal(w.reset(), null);
});
