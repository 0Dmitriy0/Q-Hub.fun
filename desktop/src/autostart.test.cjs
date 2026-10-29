const test = require('node:test');
const assert = require('node:assert/strict');
const { autostartOnStart } = require('./autostart.cjs');

test('новий гравець — автозапуск увімкнено', () => {
  assert.equal(autostartOnStart({ init: false, hadSettings: false, oldOn: false, on: false }), true);
});

test('оновлення з 0.3.x: увімкнений лишається (запис переноситься), вимкнений — вимкненим', () => {
  assert.equal(autostartOnStart({ init: false, hadSettings: true, oldOn: true, on: false }), true);
  assert.equal(autostartOnStart({ init: false, hadSettings: true, oldOn: false, on: false }), false);
});

test('далі вибір гравця не чіпаємо; увімкнений — оновлюємо шлях', () => {
  assert.equal(autostartOnStart({ init: true, hadSettings: true, oldOn: false, on: false }), null);
  assert.equal(autostartOnStart({ init: true, hadSettings: true, oldOn: false, on: true }), true);
});
