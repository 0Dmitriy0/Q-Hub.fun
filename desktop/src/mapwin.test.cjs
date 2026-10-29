const test = require('node:test');
const assert = require('node:assert');
const { place, mapKeyConflict } = require('./mapwin.cjs');

const work = { x: 0, y: 0, width: 1920, height: 1040 };   // 1080p без панелі завдань
const bar = { x: 550, y: 24, width: 820, height: 150 };
const hist = { x: 12, y: 24, width: 420, height: 640 };

test('під плашкою, від лівого краю, до правого й нижнього — з відступом 12 px', () => {
  assert.deepStrictEqual(place({ work, bar }), { x: 12, y: 186, width: 1896, height: 842 });
});

test('відкрита «Історія» — мапа праворуч від неї й не перекриває', () => {
  const r = place({ work, bar, hist });
  assert.strictEqual(r.x, 12 + 420 + 12);
  assert.ok(r.x >= hist.x + hist.width && r.y >= bar.y + bar.height);
  assert.strictEqual(r.x + r.width, 1908);
});

test('без плашки (клавішею) — ≈80 % робочої області по центру', () => {
  assert.deepStrictEqual(place({ work }), { x: 192, y: 104, width: 1536, height: 832 });
});

test('1366×768: мапа не менша за 640×420, навіть якщо перекриває край історії', () => {
  const w = { x: 0, y: 0, width: 1366, height: 728 }, b = { x: 273, y: 24, width: 820, height: 260 };
  const r = place({ work: w, bar: b, hist: { x: 12, y: 24, width: 420, height: 640 } });
  assert.ok(r.width >= 640 && r.height >= 420, JSON.stringify(r));
  assert.ok(r.x + r.width <= 1354 && r.y + r.height <= 716);
  const k = place({ work: w });
  assert.ok(k.width >= 640 && k.height >= 420);
});

test('другий монітор праворуч — координати від його робочої області', () => {
  const r = place({ work: { x: 1920, y: 0, width: 1920, height: 1040 }, bar: { ...bar, x: 2470 } });
  assert.strictEqual(r.x, 1932);
});

test('клавіша мапи: не та сама, що плашки, мітки чи знімка (без різниці регістру)', () => {
  const keys = { hotkey: 'Alt+Q', pinKey: 'Alt+F9', shotKey: 'Alt+S' };
  assert.strictEqual(mapKeyConflict('Alt+M', keys), null);
  assert.match(mapKeyConflict('alt+q', keys), /відкриває плашку/);
  assert.match(mapKeyConflict('Alt+F9', keys), /ставить мітку/);
  assert.match(mapKeyConflict('Alt+S', keys), /навчальний знімок/);
  assert.strictEqual(mapKeyConflict('', keys), 'Оберіть клавішу.');
});
