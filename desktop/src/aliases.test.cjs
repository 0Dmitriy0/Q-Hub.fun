const test = require('node:test');
const assert = require('node:assert/strict');
const { expandAliases } = require('./aliases.cjs');
const shot = require('./lib/shotparse.cjs');

test('псевдонім — ще одна назва того самого товару, оригінал першим', () => {
  const out = expandAliases([{ id: 7, name: 'Шкура вовка', buyer_id: 'hide', aliases: ['Шкура вовка 1', 'шкура вовка 1', ' ', 'ШКУРА ВОВКА'] }]);
  assert.deepEqual(out.map(i => [i.id, i.name, !!i.alias]), [[7, 'Шкура вовка', false], [7, 'Шкура вовка 1', true]]);
});

test('без псевдонімів список не змінюється', () => {
  const items = [{ id: 1, name: 'Молоток', buyer_id: 'tools' }, { id: 2, name: 'Пила', buyer_id: 'tools', aliases: [] }];
  assert.deepEqual(expandAliases(items), items);
});

test('назва, що читається з помилкою, знаходить товар через псевдонім', () => {
  const items = [{ id: 7, name: 'Шкура вовка', buyer_id: 'hide', aliases: ['Шкyрa вoвкa XL'] }, { id: 8, name: 'Шкура оленя', buyer_id: 'hide' }];
  const b = shot.bestItem('Шкyрa вoвкa XL', expandAliases(items));
  assert.equal(b.item.id, 7);
  assert.ok(b.score >= shot.MIN_SCORE);
});
