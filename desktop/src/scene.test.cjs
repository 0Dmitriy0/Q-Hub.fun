const test = require('node:test');
const assert = require('node:assert');
const { scene, category, records, phrase } = require('./scene.cjs');

test('місце за текстом меню (як OCR читає екрани гри)', () => {
  assert.deepEqual(scene('Магазин 24/7 #32\nСім-карта $5000\nДодати в кошик\nЗамовлення'), { kind: 'shop', title: 'Магазин 24/7 #32' });
  assert.deepEqual(scene('HAROLD BROWN\nКупує\nхарчі\nМолоко Продати $801 ЗА ШТ.'), { kind: 'buyer', title: 'Скупник: харчі' });
  /* справжній OCR вікна «Риба» (жива гра 2026-10-29): ні «Купує», ні «ліміт продажу» */
  assert.equal(scene('зачинити X\na ПИ Окунь bing Оселедець\nо Kynye Продам | $159 4 Peri Продам | $99 ет\nTe | поши | бів прод | $151 ай').kind, 'buyer');
  assert.equal(scene('Оселедець Продам | $99'), null);                   // одна кнопка «Продати» — ще не скупник
  assert.deepEqual(scene('MAZEBANK Gold\nБаланс на рахунку: $3 162 623\nПоповнити Зняти'), { kind: 'bank', title: 'Банкомат' });
  assert.equal(scene('Маркетплейс · Авто').kind, 'market');
  assert.equal(scene('просто вулиця, Del Perro'), null);
});

test('категорія: за підтвердженням гри, потім за місцем', () => {
  assert.equal(category('out', { kind: 'shop' }, '299$ сплачено готівкою!'), 'Інше');
  assert.equal(category('out', { kind: 'clothes' }, ''), 'Одяг');
  assert.equal(category('out', null, 'Сплачено податок на майно'), 'Податки');
  assert.equal(category('in', null, 'Зарплата: 5000$'), 'Робота');
  assert.equal(category('in', { kind: 'buyer' }, ''), 'Продаж фарму');
});

test('записи: «−1000 · Магазин 24/7 #32», переказ, зняття з комісією банкомата', () => {
  const shop = { kind: 'shop', title: 'Магазин 24/7 #32' };
  assert.deepEqual(records([{ kind: 'tx', type: 'out', amount: 1000, account: 'cash' }], shop, '1000$ сплачено готівкою!'),
    [{ kind: 'tx', type: 'out', amount: 1000, account: 'cash', category: 'Інше', note: 'Магазин 24/7 #32 · оплата готівкою' }]);
  assert.deepEqual(records([{ kind: 'transfer', from: 'cash', to: 'card', amount: 100 }], { kind: 'bank', title: 'Банкомат' }, ''),
    [{ kind: 'transfer', from: 'cash', to: 'card', amount: 100 }]);
  assert.deepEqual(records([{ kind: 'tx', type: 'in', amount: 10000, account: 'cash' }, { kind: 'tx', type: 'out', amount: 10180, account: 'card' }], { kind: 'bank', title: 'Банкомат' }, ''),
    [{ kind: 'transfer', from: 'card', to: 'cash', amount: 10000 }, { kind: 'tx', type: 'out', amount: 180, account: 'card', category: 'Інше', note: 'Комісія банкомата' }]);
  assert.deepEqual(records([{ kind: 'tx', type: 'in', amount: 30000, account: 'card' }], null, ''),
    [{ kind: 'tx', type: 'in', amount: 30000, account: 'card', category: 'Інше', note: 'з гри' }]);
});

test('підтвердження гри: з шумного OCR — лише зрозумілі фрази', () => {
  assert.equal(phrase('I TEE vp ——— fy EQ успішно ~ гою сплачено готівкою o Py ООН НН а'), 'оплата готівкою');
  assert.equal(phrase('Bn ек успішно Банк поповнено на 1005. Баланс: о 31627235. Зараховано: 1005.'), 'поповнення банку, зарахування');
  assert.equal(phrase('Зарплата: 5000$'), 'зарплата');
  assert.equal(phrase('мутний шум'), '');
});
