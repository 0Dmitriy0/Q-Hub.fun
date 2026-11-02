const test = require('node:test');
const assert = require('node:assert');
const { scene } = require('./scene.cjs');

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
