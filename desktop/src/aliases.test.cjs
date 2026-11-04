const test = require('node:test');
const assert = require('node:assert/strict');
const { expandAliases } = require('./aliases.cjs');
/* src/lib/shotparse.cjs збирається з сайту (npm run ui) і в git не лежить — тести CI йдуть до збірки, тож тут без нього */

test('псевдонім — ще одна назва того самого товару, оригінал першим', () => {
  const out = expandAliases([{ id: 7, name: 'Шкура вовка', buyer_id: 'hide', aliases: ['Шкура вовка 1', 'шкура вовка 1', ' ', 'ШКУРА ВОВКА'] }]);
  assert.deepEqual(out.map(i => [i.id, i.name, !!i.alias]), [[7, 'Шкура вовка', false], [7, 'Шкура вовка 1', true]]);
});

test('без псевдонімів список не змінюється', () => {
  const items = [{ id: 1, name: 'Молоток', buyer_id: 'tools' }, { id: 2, name: 'Пила', buyer_id: 'tools', aliases: [] }];
  assert.deepEqual(expandAliases(items), items);
});

test('копія-псевдонім несе той самий товар: id, скупника й межі — ціна піде в правильний товар', () => {
  const [, a] = expandAliases([{ id: 7, name: 'Шкура вовка', buyer_id: 'hide', min: 100, max: 900, last: 450, aliases: ['Шкyрa вoвкa XL'] }]);
  assert.deepEqual({ id: a.id, buyer_id: a.buyer_id, min: a.min, max: a.max, last: a.last, name: a.name },
    { id: 7, buyer_id: 'hide', min: 100, max: 900, last: 450, name: 'Шкyрa вoвкa XL' });
});
