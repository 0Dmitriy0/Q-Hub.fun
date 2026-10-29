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
  /* минув проміжок — та сама ціна знову; але це нове відкриття вікна (пауза ≥ 10 с), тож спершу два кадри (specs/024, R4) */
  assert.deepStrictEqual(pick('fish', [r(1, 120)], 700e3), []);
  assert.deepStrictEqual(pick('fish', [r(1, 120)], 704e3), [r(1, 120)]);
  assert.deepStrictEqual(pick('fish', [r(1, 120)], 708e3), []);
});

test('товар без меж: дві однакові зчитки в межах одного відкриття, не обов\'язково поспіль', () => {
  const pick = pricePicker(600e3);
  const no = (item_id, price) => ({ buyer_id: 'junk', item_id, price, score: 0.95, min: 0, max: 0 });
  assert.deepStrictEqual(pick('junk', [no(7, 300)], 0), []);                   // побачено раз — не надіслано
  assert.deepStrictEqual(pick.confirmed.has(7), false);
  assert.deepStrictEqual(pick('junk', [no(8, 50)], 2e3), []);                  // інший товар між зчитками
  assert.deepStrictEqual(pick('junk', [no(7, 300)], 4e3), [{ buyer_id: 'junk', item_id: 7, price: 300 }]);
  assert.deepStrictEqual(pick.confirmed.has(7), true);
  /* нове відкриття: вчорашня зчитка не підтверджує сьогоднішню */
  assert.deepStrictEqual(pick('junk', [no(8, 50)], 60e3), []);
  assert.deepStrictEqual(pick.confirmed.has(8), false);
});

test('підтверджене, але вже надіслане — у confirmed, на сайт не йде', () => {
  const pick = pricePicker(600e3);
  const sure = { buyer_id: 'hide', item_id: 1, price: 556, score: 0.95, min: 400, max: 900 };
  assert.strictEqual(pick('hide', [sure], 0).length, 1);
  assert.deepStrictEqual(pick('hide', [sure], 2e3), []);
  assert.strictEqual(pick.confirmed.has(1), true);
});

const { coverage } = require('./pricescan.cjs');

test('покриття: N з M за відкриття вікна, pending, показ з першого кадру, закриття після 30 с', () => {
  const cov = coverage();
  assert.deepStrictEqual(cov.frame('hide', 32, [1, 2, 3], [1, 2], 0), { buyer: 'hide', read: 2, total: 32, pending: 1, shown: true });
  assert.deepStrictEqual(cov.frame('hide', 32, [3, 4], [3, 4], 2e3), { buyer: 'hide', read: 4, total: 32, pending: 0, shown: true });
  assert.strictEqual(cov.frame('hide', 32, [5], [5], 24e3).read, 5);           // кадр через 22 с (як на живій грі) — те саме відкриття
  assert.strictEqual(cov.view(53e3).read, 5);                                  // 29 с без кадрів — ще відкрите
  assert.strictEqual(cov.view(54e3), null);                                    // 30 с — закрите
  assert.deepStrictEqual(cov.frame('hide', 32, [6], [6], 60e3), { buyer: 'hide', read: 1, total: 32, pending: 0, shown: true });   // нове відкриття
  assert.strictEqual(cov.frame('fish', 14, [1], [], 62e3).read, 0);            // інший скупник — окремий лік
});

test('покриття: кадр, хибно впізнаний як інший скупник, не обнуляє лік (живу гру 2026-10-29)', () => {
  const cov = coverage();
  cov.frame('hide', 32, [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], 0);
  assert.strictEqual(cov.frame('meat', 8, [90], [90], 18e3).buyer, 'meat');   // «М'ясо» посеред «Шкур»
  assert.deepStrictEqual(cov.frame('hide', 32, [9, 10], [9, 10], 40e3), { buyer: 'hide', read: 10, total: 32, pending: 0, shown: true });
});

test('покриття: усі товари прочитано — M з M', () => {
  const cov = coverage();
  const ids = Array.from({ length: 32 }, (_, i) => i + 1);
  for (let f = 0; f < 4; f++) cov.frame('hide', 32, ids.slice(f * 8, f * 8 + 8), ids.slice(f * 8, f * 8 + 8), f * 2e3);
  assert.deepStrictEqual(cov.view(6e3), { buyer: 'hide', read: 32, total: 32, pending: 0, shown: true });
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

test('прокручуваний список: один кадр, якщо назва впевнена й ціна в межах скупника', () => {
  const pick = pricePicker(600e3);
  const sure = (item_id, price, score = 0.95) => ({ buyer_id: 'hide', item_id, price, score, min: 400, max: 900 });
  assert.deepStrictEqual(pick('hide', [sure(1, 556)], 0), [{ buyer_id: 'hide', item_id: 1, price: 556 }]);
  assert.deepStrictEqual(pick('hide', [sure(2, 1556)], 0), []);         // поза межами — чекати другого кадру
  assert.deepStrictEqual(pick('hide', [sure(3, 605, 0.7)], 0), []);     // назва невпевнена — чекати
  assert.deepStrictEqual(pick('hide', [{ ...sure(4, 605), min: 0, max: 0 }], 0), []);   // меж немає — чекати
  assert.deepStrictEqual(pick('hide', [sure(1, 556)], 2e3), []);        // уже надіслано
  assert.deepStrictEqual(pick('hide', [sure(1, 656)], 4e3), []);                     // інша ціна одним кадром — ні (549 → 495, жива гра)
  assert.deepStrictEqual(pick('hide', [sure(1, 656)], 6e3), [{ buyer_id: 'hide', item_id: 1, price: 656 }]);   // двома — виправлення
});

const { headerBuyer } = require('./pricescan.cjs');

test('скупник за заголовком «Купує …» ліворуч', () => {
  const L = (...t) => t.map((text, i) => ({ text, y: i * 40, col: 0 }));
  /* справжні результати OCR лівої смуги вікон (shots/*.png) */
  assert.strictEqual(headerBuyer(L('що', 'HAROLD BROWN', 'Купує', 'харчі')), 'food');
  assert.strictEqual(headerBuyer(L('129 kc', 'f', 'WALTER GREEN', 'Kv', 'врожай')), 'harvest');
  assert.strictEqual(headerBuyer(L('ЛЕ', 'f', 'ASHLEY WILLIAMS', 'колоди', 'ліміт ПРОДАЖУ')), 'wood');
  assert.strictEqual(headerBuyer(L('102 Kic', 'f', 'віск MALONE', '“nye', 'пальне')), 'fuel');
  assert.strictEqual(headerBuyer(L('f', 'Kyrye', 'о puby', 'ra і')), 'fish');
  assert.strictEqual(headerBuyer(L('fa', '[—', 'Kynye', 'метали')), 'metal');
  assert.strictEqual(headerBuyer(L('B1 Kie', 'fa', 'BRAD SHIDER', 'Купує', 'шкури')), 'hide');
  assert.strictEqual(headerBuyer(L('Купуе', "м'ясо")), 'meat');
  assert.strictEqual(headerBuyer([{ text: 'метали', y: 0, x: 900, col: 0 }], { maxX: 800 }), null);   // картка товару, не заголовок
  assert.strictEqual(headerBuyer([{ text: 'рибу', y: 40, col: 1 }]), null);                            // права половина екрана
  assert.strictEqual(headerBuyer(L('ЛІМІТ ПРОДАЖУ', '0')), null);
});

test('покриття: після довгої перерви старий лік іншого скупника не воскресає', () => {
  const cov = coverage();
  cov.frame('meat', 8, [90, 91], [90, 91], 0);
  cov.frame('hide', 32, [1], [1], 300e3);                                      // через 5 хв — нове відкриття
  assert.strictEqual(cov.frame('meat', 8, [92], [92], 310e3).read, 1);         // не 3
});

test('поза межами: «$» як «5» лише разом зі звичайною зчиткою; близько до меж — двома; далеко — ніколи (жива гра 2026-10-29)', () => {
  const pick = pricePicker(600e3);
  const r = (item_id, price, min, max, score = 1) => ({ buyer_id: 'hide', item_id, price, score, min, max });
  /* «5495» → 495, але справжня ціна 549: виправлене саме не йде */
  assert.deepStrictEqual(pick('hide', [r(2, 549, 259, 659)], 0), [{ buyer_id: 'hide', item_id: 2, price: 549 }]);
  assert.deepStrictEqual(pick('hide', [r(2, 5495, 259, 659)], 2e3), []);
  assert.deepStrictEqual(pick('hide', [r(2, 5495, 259, 659)], 4e3), []);          // дві виправлені — теж ні
  /* «51050» → 1050 стає ціною, коли звичайна зчитка дала 1050 */
  assert.deepStrictEqual(pick('hide', [r(86, 51050, 546, 1359)], 6e3), []);
  assert.deepStrictEqual(pick('hide', [r(86, 1050, 546, 1359, 0.8)], 8e3), [{ buyer_id: 'hide', item_id: 86, price: 1050 }]);
  /* «Дубова колода» 260 при межах 295–449 — межі застарілі: на сайт не йде, третя впевнена зчитка — адміну (T031) */
  assert.deepStrictEqual(pick('wood', [r(20, 260, 295, 449)], 10e3), []);
  assert.deepStrictEqual(pick('wood', [r(20, 260, 295, 449)], 12e3), []);
  assert.deepStrictEqual(pick.outside, []);
  /* далеко поза межами — ніколи */
  assert.deepStrictEqual(pick('hide', [r(87, 9999, 400, 900)], 14e3), []);
  assert.deepStrictEqual(pick('hide', [r(87, 9999, 400, 900)], 16e3), []);
});

test('хибні межі: та сама ціна поза межами ≥ 3 впевнені зчитки — адміну один раз, на сайт ніколи («Молоток» 64 при 76–498)', () => {
  const pick = pricePicker(600e3);
  const m = (price, score = 0.97) => ({ buyer_id: 'junk', item_id: 30, price, score, min: 76, max: 498 });
  assert.deepStrictEqual(pick('junk', [m(64)], 0), []);
  assert.deepStrictEqual(pick('junk', [m(64, 0.8)], 2e3), []);                  // невпевнена зчитка не рахується
  assert.deepStrictEqual(pick('junk', [m(64)], 4e3), []);
  assert.deepStrictEqual(pick.outside, []);                                       // поки двічі
  assert.deepStrictEqual(pick('junk', [m(64)], 6e3), []);
  assert.deepStrictEqual(pick.outside, [{ item_id: 30, price: 64, min: 76, max: 498 }]);
  assert.deepStrictEqual(pick.confirmed.has(30), false);                          // і в «прочитано N з M» не йде
  pick('junk', [m(64)], 8e3); assert.deepStrictEqual(pick.outside, []);           // четверта — уже не повідомляє
  /* інше число між зчитками починає лік спочатку */
  const pick2 = pricePicker(600e3);
  pick2('junk', [m(64)], 0); pick2('junk', [m(66)], 2e3); pick2('junk', [m(64)], 4e3); pick2('junk', [m(64)], 6e3);
  assert.deepStrictEqual(pick2.outside, []);
  /* звичайна ціна в межах після хибних — як завжди */
  assert.deepStrictEqual(pick2('junk', [m(120)], 8e3), [{ buyer_id: 'junk', item_id: 30, price: 120 }]);
});

test('надіслану в цьому відкритті ціну один кадр не змінює', () => {
  const pick = pricePicker(600e3);
  const r = price => ({ buyer_id: 'hide', item_id: 2, price, score: 1, min: 259, max: 659 });
  assert.strictEqual(pick('hide', [r(549)], 0).length, 1);
  assert.deepStrictEqual(pick('hide', [r(495)], 2e3), []);                         // інше число в межах, один кадр — ні
  assert.deepStrictEqual(pick('hide', [r(495)], 4e3), [{ buyer_id: 'hide', item_id: 2, price: 495 }]);   // двічі — так
});

test('«$» завжди як «5»: три однакові виправлені зчитки без суперечних — ціна («51 281» → 1281, жива гра 2026-10-29)', () => {
  const pick = pricePicker(600e3);
  const r = price => ({ buyer_id: 'hide', item_id: 86, price, score: 1, min: 546, max: 1359 });
  assert.deepStrictEqual(pick('hide', [r(51281)], 0), []);
  assert.deepStrictEqual(pick('hide', [r(51281)], 2e3), []);
  assert.deepStrictEqual(pick('hide', [r(51281)], 4e3), [{ buyer_id: 'hide', item_id: 86, price: 1281 }]);
  /* а поруч зі звичайною зчиткою 549 виправлене 495 не проходить і з трьох разів */
  const k = p => ({ buyer_id: 'hide', item_id: 2, price: p, score: 1, min: 259, max: 659 });
  pick('hide', [k(549)], 6e3);
  for (const t of [8e3, 10e3, 12e3]) assert.deepStrictEqual(pick('hide', [k(5495)], t), []);
});

const { textLeft } = require('./pricescan.cjs');

test('вирізка назви: світлу картинку товару ліворуч відрізано, без картинки — нічого (T030, «Фугу»)', () => {
  /* 100×20: темне тло картки (40), картинка — світла смуга 2–39, далі текст — світлі риски на 30 % рядків */
  const img = (pic) => {
    const w = 100, h = 20, px = Buffer.alloc(w * h * 4, 40);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, lit = (pic && x >= 2 && x < 40) || (x >= 50 && x < 70 && y >= 6 && y < 12 && x % 3);
      if (lit) px[i] = px[i + 1] = px[i + 2] = 200;
    }
    return [px, w, h];
  };
  assert.strictEqual(textLeft(...img(true)), 40);
  assert.strictEqual(textLeft(...img(false)), 0);
});
