const test = require('node:test');
const assert = require('node:assert/strict');
const { ocrRelease, IDLE, LIST_IDLE } = require('./ocridle.cjs');

const base = { active: true, inactiveSince: 0, listsAt: 0, hasAny: true, hasLists: false, now: 1e6 };

test('гра йде, список скупника не відкривали — нічого не закриваємо', () => {
  assert.equal(ocrRelease(base), null);
});

test('рушій списку: щойно читали — лишаємо; довше LIST_IDLE — закриваємо лише його', () => {
  assert.equal(ocrRelease({ ...base, hasLists: true, listsAt: base.now - 5e3 }), null);
  assert.equal(ocrRelease({ ...base, hasLists: true, listsAt: base.now - LIST_IDLE - 1 }), 'lists');
});

test('зір не працює: першу хвилину чекаємо (гравець міг на мить вийти), далі закриваємо все', () => {
  const off = { ...base, active: false, hasLists: true, listsAt: 0 };
  assert.equal(ocrRelease({ ...off, inactiveSince: base.now - 10e3 }), null);
  assert.equal(ocrRelease({ ...off, inactiveSince: base.now - IDLE - 1 }), 'all');
  assert.equal(ocrRelease({ ...off, inactiveSince: base.now - IDLE - 1, hasAny: false }), null);
});
