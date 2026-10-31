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

test('вибір в інсталяторі (specs/008) важливіший за типові правила', () => {
  assert.equal(autostartOnStart({ init: false, hadSettings: false, oldOn: false, on: false, chosen: false }), false);
  assert.equal(autostartOnStart({ init: true, hadSettings: true, oldOn: false, on: false, chosen: true }), true);
  assert.equal(autostartOnStart({ init: true, hadSettings: true, oldOn: false, on: true, chosen: undefined }), true);
});
