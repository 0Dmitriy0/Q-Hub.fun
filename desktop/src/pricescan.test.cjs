const test = require('node:test');
const assert = require('node:assert');
const { pricePicker } = require('./pricescan.cjs');

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

const { parseChange, changePicker } = require('./pricescan.cjs');

test('таймер зміни цін: справжні результати OCR з вікон скупників', () => {
  assert.strictEqual(parseChange('Е ЗМІНА ЦІН НА. £\n= ТОВАРИ ЧЕРЕЗ i\n| 2 год. 55 хв. Е\n'), 175);
  assert.strictEqual(parseChange('ЗМІНА ЦІН НА.\nTOBAPH HEPES Оу\n2 год. 54 xB.\n'), 174);
  assert.strictEqual(parseChange('2 змінАЦІННА ;\n\noGAPH UEPEs\n3rop. 12xe. }\nя E:\n'), 192);
  assert.strictEqual(parseChange('. ЗМІНА ЦІН HA X\nТОВАРИ ЧЕРЕЗ\n\nй\n\nЗ год. 9 хв.\n'), 189);
  assert.strictEqual(parseChange('=\nШЕ |\n\n2ron. 35x. ©\nЗ г\n'), 155);
  assert.strictEqual(parseChange('45 хв.'), 45);
  assert.strictEqual(parseChange('1 год.'), 60);
  assert.strictEqual(parseChange('ЗМІНА ЦІН НА ТОВАРИ ЧЕРЕЗ'), null);
  assert.strictEqual(parseChange('2 год. 75 хв.'), null);
});

test('час зміни надсилається після двох кадрів і лише при новому циклі', () => {
  const pick = changePicker(), at = 10 * 36e5;
  assert.strictEqual(pick('food', at), false);            // перший кадр
  assert.strictEqual(pick('food', at + 60e3), true);      // другий, ±1 хв — надіслати
  assert.strictEqual(pick('food', at), false);            // той самий момент — не повторювати
  assert.strictEqual(pick('food', at + 3 * 36e5), false); // новий цикл — спершу підтвердити
  assert.strictEqual(pick('food', at + 3 * 36e5), true);
  assert.strictEqual(pick('fish', at), false);            // інший скупник — окремо
});
