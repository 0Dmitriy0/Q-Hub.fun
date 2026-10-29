const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNick } = require('./nick.cjs');

test('нік як у прикладі власника', () => {
  assert.deepEqual(parseNick(' D_VYRX '), { nick: 'D_VYRX' });
  assert.deepEqual(parseNick('saha_23'), { nick: 'saha_23' });
});

test('закороткий, задовгий, з пробілом, кирилицею — відмова', () => {
  for (const s of ['ab', 'a'.repeat(21), 'd vyrx', 'Діма', 'D-VYRX', '', undefined]) assert.ok(parseNick(s).error, String(s));
});
