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

const { scenePacer } = require('./scene.cjs');

test('16:9: один непрочитаний кадр HUD читання екрана не запускає', () => {
  const p = scenePacer();
  p.hud(false, 10000);
  assert.equal(p.due(10000, 0, true), false);
  p.hud(false, 11400);
  assert.equal(p.due(11400, 0, true), false);
  p.hud(false, 11500);
  assert.equal(p.due(11500, 0, true), true);           // HUD не видно 1,5 с поспіль — це меню
});

test('16:9: кадр з HUD обнуляє відлік непрочитаного', () => {
  const p = scenePacer();
  p.hud(false, 10000);
  p.hud(true, 10700);
  p.hud(false, 11400);
  assert.equal(p.due(12000, 0, true), false);
  assert.equal(p.due(12900, 0, true), true);
});

test('16:9: після читання без скупника — рідше вдвічі, до 30 с', () => {
  const p = scenePacer();
  p.hud(false, 0);
  const gaps = [];
  for (let i = 0; i < 5; i++) { p.done(i % 2 ? 'bank' : null, true); gaps.push(p.gap); }
  assert.deepEqual(gaps, [8000, 16000, 30000, 30000, 30000]);
  assert.equal(p.due(100000, 80000, true), false);     // 20 с від минулого читання — ще рано
  assert.equal(p.due(110001, 80000, true), true);
});

test('16:9: скупник і закрите меню повертають звичайний крок', () => {
  const p = scenePacer();
  p.hud(false, 0);
  p.done(null, true); p.done(null, true);
  p.done('buyer', true);
  assert.equal(p.gap, 4000);
  p.done(null, true); p.done(null, true);
  p.hud(true, 1000); p.hud(true, 1700); p.hud(true, 20999);
  assert.equal(p.gap, 16000);                           // HUD видно менше 20 с — меню закрили на мить
  p.hud(false, 21500); p.hud(true, 22000); p.hud(true, 41999);
  assert.equal(p.gap, 16000);                           // непрочитаний кадр починає відлік заново
  p.hud(true, 42000);
  assert.equal(p.gap, 4000);
});

test('інший формат екрана — як раніше: раз на 4 с, без очікування й без розрідження', () => {
  const p = scenePacer();
  p.hud(false, 10000);
  assert.equal(p.due(10000, 5000, false), true);
  assert.equal(p.due(10000, 6001, false), false);
  p.done(null, false); p.done(null, false);
  assert.equal(p.gap, 4000);
  assert.equal(p.due(20000, 15999, false), true);
});

const { menuPace } = require('./scene.cjs');

test('крок знімання, поки HUD не видно: спершу часто, далі рідше', () => {
  assert.equal(menuPace(0), 350);
  assert.equal(menuPace(14999), 350);
  assert.equal(menuPace(15000), 700);
  assert.equal(menuPace(59999), 700);
  assert.equal(menuPace(60000), 2000);
  assert.equal(menuPace(3600e3), 2000);
  assert.equal(menuPace(3600e3, true), 350);           // біля списку скупника — кадр за кадром, скільки б HUD не було
});

test('скільки HUD не видно', () => {
  const p = scenePacer();
  assert.equal(p.unreadFor(5000), 0);
  p.hud(false, 1000); p.hud(false, 1350);
  assert.equal(p.unreadFor(5000), 4000);
  p.hud(true, 5350);
  assert.equal(p.unreadFor(6000), 0);
});
