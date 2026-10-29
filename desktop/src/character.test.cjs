const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCharacter } = require('./character.cjs');

test('звичайний персонаж', () => {
  assert.deepEqual(parseCharacter({ name: ' Luigi_Core ', static: '162103', start: '6544000' }), { name: 'Luigi_Core', stat: 162103, start: 6544000 });
});

test('статік і баланс так, як їх копіюють: «#162103», «6 544 000 $»', () => {
  assert.deepEqual(parseCharacter({ name: 'Luigi_Core', static: '#162 103', start: '6 544 000 $' }), { name: 'Luigi_Core', stat: 162103, start: 6544000 });
});

test("пробіли в імені: «Jacson _Core», «Jacson Core» → «Jacson_Core»", () => {
  for (const name of ['Jacson _Core', 'Jacson_ Core', 'Jacson Core', '  Jacson  _  Core ']) assert.equal(parseCharacter({ name, static: '1' }).name, 'Jacson_Core', name);
});

test('без балансу — 0', () => {
  assert.equal(parseCharacter({ name: 'Luigi_Core', static: '1' }).start, 0);
});

test("ім'я не як у грі — відмова", () => {
  for (const name of ['saha_23', 'luigi_core', 'Luigi', 'Luigi_Core_Jr', 'Луїджі_Коре', '']) assert.ok(parseCharacter({ name, static: '162103' }).error, name);
});

test('статік: порожній, без цифр, нуль, задовгий — відмова', () => {
  for (const s of ['', 'abc', '0', '1234567890', undefined]) assert.ok(parseCharacter({ name: 'Luigi_Core', static: s }).error, String(s));
});
