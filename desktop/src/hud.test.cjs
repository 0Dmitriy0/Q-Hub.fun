const test = require('node:test');
const assert = require('node:assert');
const { region, parse, hasBadge, classify, watcher } = require('./hud.cjs');

test('HUD: ділянка грошей масштабується з висотою й тримається правого краю', () => {
  assert.deepEqual(region(1920, 1080), { left: 1578, top: 76, width: 140, height: 52 });
  assert.deepEqual(region(2560, 1440), { left: 2104, top: 101, width: 187, height: 69 });
});

test('HUD: розбір OCR — лише дві суми «$…», решта — null', () => {
  assert.deepEqual(parse('$3 820037\n$3 162623\n'), { cash: 3820037, bank: 3162623 });
  assert.deepEqual(parse('$3819335 \n $3 162723'), { cash: 3819335, bank: 3162723 });
  assert.equal(parse('1626232\n'), null);                     // меню закрило HUD
  assert.equal(parse(''), null);
  assert.equal(parse('$3 162723100'), null);                  // один рядок
  assert.equal(parse('$38199$37\n$3162723'), null);
});

test('HUD: значок зміни видно за червоним чи зеленим фоном', () => {
  const px = (r, g, b, n) => Buffer.from(Array.from({ length: n }, () => [b, g, r, 255]).flat());
  assert.equal(hasBadge(px(240, 240, 240, 500)), false);       // білий текст
  assert.equal(hasBadge(px(30, 30, 30, 500)), false);          // темний фон
  assert.equal(hasBadge(px(200, 40, 40, 40)), true);           // «−299 $»
  assert.equal(hasBadge(px(40, 170, 70, 40)), true);           // «+100 $»
});

test('HUD: зміни → витрата, прибуток, переказ', () => {
  const a = { cash: 3820037, bank: 3162623 };
  assert.deepEqual(classify(a, { cash: 3819738, bank: 3162623 }), [{ kind: 'tx', type: 'out', amount: 299, account: 'cash' }]);
  assert.deepEqual(classify(a, { cash: 3819937, bank: 3162723 }), [{ kind: 'transfer', from: 'cash', to: 'card', amount: 100 }]);
  assert.deepEqual(classify(a, { cash: 3820037, bank: 3192623 }), [{ kind: 'tx', type: 'in', amount: 30000, account: 'card' }]);
  assert.deepEqual(classify(a, { cash: 3820537, bank: 3162123 }), [{ kind: 'transfer', from: 'card', to: 'cash', amount: 500 }]);
  assert.deepEqual(classify(a, a), []);
});

test('HUD: спостерігач — нове значення лише після двох однакових показів, без запису на старті й на сміття', () => {
  const feed = watcher();
  const A = { cash: 1000, bank: 500 }, B = { cash: 700, bank: 500 }, junk = { cash: 70, bank: 500 };
  assert.deepEqual(feed(A), []); assert.deepEqual(feed(A), []);   // база, без запису
  assert.deepEqual(feed(B), []);                                  // перший показ — ще не віримо
  assert.deepEqual(feed(null), []);                               // значок / меню
  assert.deepEqual(feed(B), []);
  assert.deepEqual(feed(B), [{ kind: 'tx', type: 'out', amount: 300, account: 'cash' }]);
  assert.deepEqual(feed(junk), []); assert.deepEqual(feed(B), []); // разовий збій OCR нічого не записує
  const big = watcher({ maxJump: 1000 });
  big(A); big(A); big({ cash: 999999, bank: 500 });
  assert.deepEqual(big({ cash: 999999, bank: 500 }), []);         // неправдоподібний стрибок
});
