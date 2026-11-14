const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanHit, empty, addRule, activate, closeGroup, removeRule, move, fit, fitH, place, MIN_W, MIN_H, DEF_W } = require('./rulewin.cjs');

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

/* стан для тестів: n — номери пунктів, кожен у своїй вкладці (вкладка = g<номер>) */
const open = (...ns) => ns.reduce((st, n) => addRule(st, hit(n), n), empty());
const g = (st, n) => st.groups.find(x => x.rules.some(r => r.n === String(n))).id;
const layout = st => st.groups.map(x => x.rules.map(r => r.n).join(','));

test('addRule: нова вкладка активна; той самий пункт — без дубля, його вкладка активна', () => {
  let st = open(1, 2);
  assert.deepEqual(layout(st), ['1', '2']);
  assert.equal(st.active, g(st, 2));
  st = addRule(st, hit(1, 99), 99);
  assert.equal(st.groups.length, 2);
  assert.equal(st.active, g(st, 1));
});

test('addRule: шоста вкладка замінює найстарішу й лишає примітку', () => {
  let st = open(1, 2, 3, 4, 5);
  assert.equal(st.note, null);
  st = addRule(st, hit(6), 6);
  assert.deepEqual(layout(st), ['2', '3', '4', '5', '6']);
  assert.match(st.note, /найстарішу/);
  assert.equal(activate(st, g(st, 3)).note, null);
});

test('move: правило на вкладку — у кінець тієї вкладки, порожня вкладка зникає', () => {
  let st = open(1, 2, 3);
  st = move(st, { rule: hit(3).id }, { group: g(st, 1) });
  assert.deepEqual(layout(st), ['1,3', '2']);
  assert.equal(st.active, g(st, 1));
});

test('move: вище чи нижче правила', () => {
  let st = open(1, 2, 3);
  st = move(st, { rule: hit(2).id }, { group: g(st, 1) });
  st = move(st, { rule: hit(3).id }, { group: g(st, 1), anchor: hit(1).id, pos: 'before' });
  assert.deepEqual(layout(st), ['3,1,2']);
  st = move(st, { rule: hit(3).id }, { group: g(st, 1), anchor: hit(1).id, pos: 'after' });
  assert.deepEqual(layout(st), ['1,3,2']);
});

test('move: уся вкладка на іншу — правила зливаються', () => {
  let st = open(1, 2, 3);
  st = move(st, { rule: hit(2).id }, { group: g(st, 1) });
  st = move(st, { group: g(st, 3) }, { group: g(st, 1), anchor: hit(1).id, pos: 'after' });
  assert.deepEqual(layout(st), ['1,3,2']);
});

test('move: більше 5 правил у вкладці — нічого не міняється, примітка', () => {
  let st = open(1, 2, 3, 4, 5);
  for (const n of [2, 3, 4, 5]) st = move(st, { rule: hit(n).id }, { group: g(st, 1) });
  st = addRule(st, hit(6), 6);
  const before = layout(st);
  st = move(st, { rule: hit(6).id }, { group: g(st, 1) });
  assert.deepEqual(layout(st), before);
  assert.match(st.note, /до 5 правил/);
});

test('move: правило в нову вкладку; шостої не буде; вкладку саму в себе — без змін', () => {
  let st = open(1, 2);
  st = move(st, { rule: hit(2).id }, { group: g(st, 1) });
  st = move(st, { rule: hit(2).id }, { newGroup: true }, 50);
  assert.deepEqual(layout(st), ['1', '2']);
  const one = open(1);
  assert.equal(move(one, { rule: hit(1).id }, { newGroup: true }), one);
  let full = open(1, 2, 3, 4, 5);
  full = move(full, { rule: hit(2).id }, { group: g(full, 1) });
  full = addRule(full, hit(6), 6);
  const r = move(full, { rule: hit(2).id }, { newGroup: true });
  assert.match(r.note, /Уже 5 вкладок/);
});

test('closeGroup і removeRule: активна — сусідня, остання — порожньо', () => {
  let st = open(1, 2, 3);
  st = activate(st, g(st, 2));
  st = closeGroup(st, g(st, 2));
  assert.equal(st.active, g(st, 3));
  st = move(st, { rule: hit(3).id }, { group: g(st, 1) });
  st = removeRule(st, hit(1).id);
  assert.deepEqual(layout(st), ['3']);
  st = removeRule(st, hit(3).id);
  assert.deepEqual(st, { groups: [], active: null, note: null });
  assert.equal(closeGroup(st, 'нема'), st);
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
