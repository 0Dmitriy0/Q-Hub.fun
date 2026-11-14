const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanHit, empty, addTab, activate, closeTab, fit, fitH, place, MIN_W, MIN_H, DEF_W } = require('./rulewin.cjs');

const hit = (n, at = Number(n) || 0) => cleanHit({ topic: 'Кримінальний кодекс', url: 'https://forum.quant5.com.ua/t/1', kind: 'law', n: String(n), h: '', s: 'Текст | Покарання', score: 3 }, at);
const work = { x: 0, y: 0, width: 1920, height: 1040 };

test('cleanHit: лише потрібні поля, чужі посилання й вид — геть, без тексту — null', () => {
  const t = cleanHit({ topic: 'A', url: 'https://evil.example/', kind: 'hack', n: '1', h: 'H', s: 'x'.repeat(9000), score: 9 }, 5);
  assert.equal(t.url, '');
  assert.equal(t.kind, 'rules');
  assert.equal(t.s.length, 8000);
  assert.equal(t.id, 'A|1|H');
  assert.equal(t.score, undefined);
  assert.equal(cleanHit({ topic: 'A', s: '   ' }), null);
  assert.equal(cleanHit(null), null);
  assert.equal(hit(1).url, 'https://forum.quant5.com.ua/t/1');
});

test('addTab: нова вкладка активна; той самий пункт — без дубля', () => {
  let st = addTab(empty(), hit(1));
  st = addTab(st, hit(2));
  assert.deepEqual(st.tabs.map(t => t.n), ['1', '2']);
  assert.equal(st.active, hit(2).id);
  st = addTab(st, hit(1, 99));
  assert.equal(st.tabs.length, 2);
  assert.equal(st.active, hit(1).id);
});

test('addTab: шостий пункт замінює найстаріший і лишає примітку', () => {
  let st = empty();
  for (const n of [1, 2, 3, 4, 5]) st = addTab(st, hit(n));
  assert.equal(st.note, null);
  st = addTab(st, hit(6));
  assert.deepEqual(st.tabs.map(t => t.n), ['2', '3', '4', '5', '6']);
  assert.match(st.note, /найстаріше/);
  assert.equal(activate(st, hit(3).id).note, null);
});

test('closeTab: активна — сусідня праворуч, крайня — ліворуч, остання — порожньо', () => {
  let st = empty();
  for (const n of [1, 2, 3]) st = addTab(st, hit(n));
  st = activate(st, hit(2).id);
  st = closeTab(st, hit(2).id);
  assert.equal(st.active, hit(3).id);
  st = closeTab(st, hit(3).id);
  assert.equal(st.active, hit(1).id);
  st = closeTab(st, hit(1).id);
  assert.deepEqual(st, { tabs: [], active: null, note: null });
  assert.equal(closeTab(st, 'нема'), st);
});

test('closeTab: неактивна — активна лишається', () => {
  let st = addTab(addTab(empty(), hit(1)), hit(2));
  st = closeTab(st, hit(1).id);
  assert.equal(st.active, hit(2).id);
});

test('place: типове — праворуч біля краю, на рівні плашки', () => {
  const r = place({ work, bar: { x: 600, y: 24, width: 720, height: 150 } });
  assert.equal(r.x + r.width, 1920 - 12);
  assert.equal(r.y, 24);
  const nobar = place({ work });
  assert.equal(nobar.y, Math.round(1040 * 0.15));
});

test('place: збережене місце видно — лишається (ширина стала); поза екраном — типове', () => {
  assert.deepEqual(place({ work, saved: { x: 100, y: 200 }, height: 400 }), { x: 100, y: 200, width: DEF_W, height: 400 });
  const off = place({ work, saved: { x: 3000, y: 200 } });
  assert.equal(off.x + off.width, 1920 - 12);
  /* видно лише смужку 50 пікс — типове */
  assert.notEqual(place({ work, saved: { x: 1870, y: 200 } }).x, 1870);
  assert.equal(place({ work, saved: { x: 'a' } }).width, DEF_W);
});

test('fitH: висота під вміст у межах', () => {
  assert.equal(fitH(10, work), MIN_H);
  assert.equal(fitH(5000, work), 520);
  assert.equal(fitH(333, work), 333);
  assert.equal(place({ work, height: 5000 }).height, 520);
  /* «усі разом» — до 85 % висоти */
  assert.equal(fitH(5000, work, 0.85), 884);
  assert.equal(fit({ x: 0, y: 0, width: 420, height: 884 }, work, 0.85).height, 884);
});

test('fit: мін/макс розмір і рамка в межах робочої області', () => {
  const small = fit({ x: 0, y: 0, width: 10, height: 10 }, work);
  assert.equal(small.width, MIN_W);
  assert.equal(small.height, MIN_H);
  const big = fit({ x: 1800, y: 900, width: 5000, height: 5000 }, work);
  assert.equal(big.width, 960);
  assert.equal(big.height, 520);
  assert.equal(big.x + big.width, 1920);
  assert.equal(big.y + big.height, 1040);
  /* другий монітор праворуч */
  const w2 = { x: 1920, y: 0, width: 1280, height: 984 };
  assert.deepEqual(fit({ x: 2000, y: 100, width: 400, height: 300 }, w2), { x: 2000, y: 100, width: 400, height: 300 });
});
