const test = require('node:test');
const assert = require('node:assert');
const { parse, CATS } = require('./quick.cjs');

test('швидкий запис: сума в різних записах', () => {
  assert.equal(parse('продав Sultan 450000').amount, 450000);
  assert.equal(parse('продав Sultan 450 000').amount, 450000);
  assert.equal(parse('продав Sultan 450к').amount, 450000);
  assert.equal(parse('зп 1,5кк').amount, 1500000);
  assert.equal(parse('виграв 2.5m').amount, 2500000);
  assert.equal(parse('штраф $300').amount, 300);
  assert.equal(parse('купив 2 машини по 100к').amount, 100000);
  assert.equal(parse('просто текст'), null);
  assert.equal(parse(''), null);
});

test('швидкий запис: прибуток чи витрата, категорія, нотатка', () => {
  assert.deepEqual(parse('продав Sultan 450к'), { type: 'in', amount: 450000, category: 'Інше', note: 'продав Sultan', account: 'cash' });
  assert.equal(parse('продав авто Sultan 450к').category, 'Продаж авто');
  assert.deepEqual(parse('купив тюнінг 120к'), { type: 'out', amount: 120000, category: 'Авто / тюнінг', note: 'купив тюнінг', account: 'cash' });
  assert.deepEqual(parse('-5000 податок'), { type: 'out', amount: 5000, category: 'Податки', note: 'податок', account: 'card' });
  assert.deepEqual(parse('+20к'), { type: 'in', amount: 20000, category: 'Інше', note: '', account: 'cash' });
  assert.deepEqual(parse('Купив яйця 30шт за 30$'), { type: 'out', amount: 30, category: 'Інше', note: 'Купив яйця 30шт', account: 'cash' });
  assert.equal(parse('зарплата 30к').category, 'Робота');
  assert.equal(parse('перекуп машини 300к').category, 'Перекуп');
});

test('швидкий запис: тип можна перемкнути вручну, категорія — з переліку цього типу', () => {
  const r = parse('продав авто Sultan 450к', 'out');
  assert.equal(r.type, 'out');
  assert.equal(r.category, 'Авто / тюнінг');
  for (const s of ['продав авто 1к', 'купив одяг 1к', 'оренда 1к', 'лотерея 1к', 'ліцензія 1к', 'комісія 1к'])
    for (const t of ['in', 'out']) assert.ok(CATS[t].includes(parse(s, t).category), `${s} / ${t}`);
});

test('швидкий запис: готівка чи картка й перекази', () => {
  assert.equal(parse('зарплата 30к').account, 'card');
  assert.equal(parse('продав авто Sultan 450к').account, 'cash');
  assert.equal(parse('продав 10 гливи 1500 на картку').account, 'card');
  assert.equal(parse('податок 5к готівкою').account, 'cash');
  assert.deepEqual(parse('зняв 200к з картки'), { kind: 'transfer', from: 'card', to: 'cash', amount: 200000 });
  assert.deepEqual(parse('поклав на картку 1,5кк'), { kind: 'transfer', from: 'cash', to: 'card', amount: 1500000 });
});
