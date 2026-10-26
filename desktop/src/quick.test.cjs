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

const { parseDeal } = require('./quick.cjs');
const CAT = [{ name: 'Глива', best: 1500 }, { name: 'Мідна руда', best: 1850 }, { name: 'Роздерта шкура кролика', best: 280 },
  { name: 'Ціла шкура кролика', best: 400 }, { name: 'Мак', best: 1267 }];

test('угода одним рядком: нафармив / купив / продав → склад', () => {
  assert.deepEqual(parseDeal('нафармив 20 гливи', CAT), { kind: 'deal', op: 'farm', item: 'Глива', qty: 20, unit: 'шт', price: 0 });
  assert.deepEqual(parseDeal('купив 10 гливи по 300', CAT), { kind: 'deal', op: 'buy', item: 'Глива', qty: 10, unit: 'шт', price: 300 });
  assert.deepEqual(parseDeal('продав 10 гливи по 1500', CAT), { kind: 'deal', op: 'sell', item: 'Глива', qty: 10, unit: 'шт', price: 1500 });
  assert.deepEqual(parseDeal('продав 5 мідної руди за 9к', CAT), { kind: 'deal', op: 'sell', item: 'Мідна руда', qty: 5, unit: 'шт', price: 1800 });
  assert.deepEqual(parseDeal('здав 40 мідної руди', CAT), { kind: 'deal', op: 'sell', item: 'Мідна руда', qty: 40, unit: 'шт', price: 1850 });   // ціна найкращого скупника
  assert.deepEqual(parseDeal('купив гливи 15 за 4500$', CAT), { kind: 'deal', op: 'buy', item: 'Глива', qty: 15, unit: 'шт', price: 300 });
  assert.deepEqual(parseDeal('купив 10 гливи', CAT), { kind: 'deal', op: 'buy', item: 'Глива', qty: 10, unit: 'шт', price: null });   // ціну треба вписати
  assert.deepEqual(parseDeal('нафармив 3 роздертих шкури кролика', CAT), { kind: 'deal', op: 'farm', item: 'Роздерта шкура кролика', qty: 3, unit: 'шт', price: 0 });
});

test('не угода: невідомий товар, без кількості, неоднозначно', () => {
  assert.equal(parseDeal('продав Sultan 450к', CAT), null);            // авто — звичайний запис грошей
  assert.equal(parseDeal('купив ремкомплект 2500', CAT), null);
  assert.equal(parseDeal('продав гливу', CAT), null);                  // без кількості
  assert.equal(parseDeal('нафармив 5 шкур кролика', CAT), null);       // яких саме — роздертих чи цілих?
  assert.equal(parseDeal('зп 1,5кк', CAT), null);
});

test('риба: гра рахує штуками, скупник платить за кг — 1000 шт = 1 кг', () => {
  const FISH = [...CAT, { name: 'Окунь', best: 900, unit: 'кг' }];
  assert.deepEqual(parseDeal('наловив 2500 окуня', FISH), { kind: 'deal', op: 'farm', item: 'Окунь', qty: 2.5, unit: 'кг', price: 0 });
  assert.deepEqual(parseDeal('продав 1500 окуня', FISH), { kind: 'deal', op: 'sell', item: 'Окунь', qty: 1.5, unit: 'кг', price: 900 });
  assert.deepEqual(parseDeal('продав 2000 шт окуня за 2к', FISH), { kind: 'deal', op: 'sell', item: 'Окунь', qty: 2, unit: 'кг', price: 1000 });   // «за все» ділиться на кг
  assert.deepEqual(parseDeal('купив 3 кг окуня по 800', FISH), { kind: 'deal', op: 'buy', item: 'Окунь', qty: 3, unit: 'кг', price: 800 });       // явні кг — як є
  assert.deepEqual(parseDeal('купив 1,5кг окуня по 800', FISH), { kind: 'deal', op: 'buy', item: 'Окунь', qty: 1.5, unit: 'кг', price: 800 });
  assert.equal(parseDeal('наловив 3 окуня', FISH).qty, 0.01);   // 3 г — менше за крок обліку, але не нуль
});
