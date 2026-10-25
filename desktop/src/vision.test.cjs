const test = require('node:test');
const assert = require('node:assert');
const { pricePicker } = require('./vision.cjs');

const r = (item_id, price) => ({ buyer_id: 'fish', item_id, price });

test('ціна йде на сайт після двох однакових кадрів, товари з різних кадрів збираються', () => {
  const pick = pricePicker(600e3);
  assert.deepStrictEqual(pick('fish', [r(1, 100), r(2, 200)], 0), []);              // перший кадр — лише запам'ятати
  assert.deepStrictEqual(pick('fish', [r(1, 100), r(2, 200), r(3, 300)], 4e3), [r(1, 100), r(2, 200)]);
  assert.deepStrictEqual(pick('fish', [r(1, 100), r(3, 300)], 8e3), [r(3, 300)]);   // товар, якого не було на першому кадрі
  assert.deepStrictEqual(pick('fish', [r(1, 100), r(2, 200), r(3, 300)], 12e3), []); // уже надіслані не повторюються
});

test('криве розпізнавання не проходить, нова ціна — проходить, стара — лише через проміжок', () => {
  const pick = pricePicker(600e3);
  pick('fish', [r(1, 100)], 0); assert.deepStrictEqual(pick('fish', [r(1, 100)], 4e3), [r(1, 100)]);
  assert.deepStrictEqual(pick('fish', [r(1, 108)], 8e3), []);                       // один кадр з іншим числом
  assert.deepStrictEqual(pick('fish', [r(1, 100)], 12e3), []);                      // знову стара — вже надсилали
  pick('fish', [r(1, 120)], 16e3); assert.deepStrictEqual(pick('fish', [r(1, 120)], 20e3), [r(1, 120)]);
  assert.deepStrictEqual(pick('fish', [r(1, 120)], 700e3), [r(1, 120)]);             // минув проміжок — та сама ціна знову
  assert.deepStrictEqual(pick('fish', [r(1, 120)], 704e3), []);
});
