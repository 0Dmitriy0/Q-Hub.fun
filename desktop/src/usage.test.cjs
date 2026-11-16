const test = require('node:test');
const assert = require('node:assert');
const { BUDGET, SOFT, HARD, sample, createMeter, createGuard, line, stateOf } = require('./usage.cjs');

const proc = (cpu, privMb, wsMb = privMb) => ({ cpu: { percentCPUUsage: cpu }, memory: { privateBytes: privMb * 1024, workingSetSize: wsMb * 1024 } });
const s = (at, cpu, mem = 500, state = 'background') => ({ at, state, cpu, mem, ws: mem + 100, procs: 6 });

test('замір сумує всі процеси програми', () => {
  const r = sample([proc(1.5, 200, 260), proc(0.5, 100, 140), proc(2, 300, 320)], 'background', 1000);
  assert.deepEqual(r, { at: 1000, state: 'background', cpu: 4, mem: 600, ws: 720, procs: 3 });
});

test('замір ділить процесор, якщо метрика рахується від одного ядра', () => {
  assert.equal(sample([proc(24, 100), proc(12, 100)], 'idle', 0, 12).cpu, 3);
});

test("без privateBytes пам'яттю вважається робочий набір",() => {
  assert.equal(sample([{ cpu: { percentCPUUsage: 0 }, memory: { workingSetSize: 51200 } }], 'idle', 0).mem, 50);
});

test('перший замір після запуску відкидається', () => {
  const m = createMeter();
  assert.deepEqual(m.feed(s(0, 0, 9999)), { minute: null, over: [] });   // і пам'ять з нього перевищенням не стає
});

test('хвилинний запис: середнє, найбільше й стан, що тривав найдовше', () => {
  const m = createMeter();
  m.feed(s(0, 0));
  for (let i = 1; i <= 12; i++) assert.equal(m.feed(s(i * 5000 - 1, i <= 8 ? 2 : 8, 400 + i, i <= 8 ? 'background' : 'active')).minute, null);
  const { minute } = m.feed(s(60000, 1, 300));
  assert.equal(minute.type, 'MIN');
  assert.equal(minute.state, 'background');
  assert.equal(minute.cpu, 4);          // (8×2 + 4×8) / 12
  assert.equal(minute.cpuMax, 8);
  assert.equal(minute.mem, 412);
  assert.equal(minute.ws, 512);
  assert.equal(minute.procs, 6);
});

test("перевищення пам'яті — одразу, але не частіше разу на хвилину",() => {
  const m = createMeter();
  m.feed(s(0, 0));
  assert.deepEqual(m.feed(s(5000, 1, 1500)).over, []);                    // рівно межа — ще не перевищення
  const [o] = m.feed(s(10000, 1, 1532)).over;
  assert.deepEqual(o, { type: 'OVER', at: 10000, kind: 'mem', value: 1532, limit: 1500 });
  assert.deepEqual(m.feed(s(15000, 1, 1600)).over, []);
  assert.equal(m.feed(s(70000, 1, 1600)).over.length, 1);
});

test('середнє процесора рахується лише за повне вікно в одному стані', () => {
  const m = createMeter();
  m.feed(s(0, 0));
  let over = [];
  for (let t = 5000; t < 10 * 60e3; t += 5000) over = over.concat(m.feed(s(t, 7)).over);
  assert.deepEqual(over, []);                                              // 10 хв фону ще не минуло
  const [o] = m.feed(s(10 * 60e3 + 5000, 7)).over;
  assert.equal(o.kind, 'cpu-background');
  assert.equal(o.limit, 5);
  assert.equal(o.window, '10m');
  assert.ok(Math.abs(o.value - 7) < 1e-9);
});

test('зміна стану починає вікно середнього заново', () => {
  const m = createMeter();
  m.feed(s(0, 0));
  let over = [];
  for (let t = 5000; t <= 9 * 60e3; t += 5000) over = over.concat(m.feed(s(t, 7)).over);
  for (let t = 9 * 60e3 + 5000; t <= 18 * 60e3; t += 5000) over = over.concat(m.feed(s(t, 7, 500, 'active')).over);
  assert.deepEqual(over, []);                                              // 7 % під час користування — у межах
});

test('простій: середнє за 5 хв понад 1 %', () => {
  const m = createMeter();
  m.feed(s(0, 0, 500, 'idle'));
  let over = [];
  for (let t = 5000; t <= 5 * 60e3 + 5000; t += 5000) over = over.concat(m.feed(s(t, 1.4, 500, 'idle')).over);
  assert.equal(over.length, 1);
  assert.equal(over[0].kind, 'cpu-idle');
  assert.equal(over[0].window, '5m');
});

test('сплеск видно лише в режимі заміру', () => {
  const quiet = createMeter(), m = createMeter(BUDGET, { trace: true });
  quiet.feed(s(0, 0)); m.feed(s(0, 0));
  assert.deepEqual(quiet.feed(s(1000, 40)).over, []);
  assert.deepEqual(m.feed(s(1000, 40)).over.map(o => [o.kind, o.limit]), [['spike', 25]]);
});

test('сплеск: вище 10 % довше 5 с поспіль', () => {
  const m = createMeter(BUDGET, { trace: true });
  m.feed(s(0, 0, 500, 'active'));
  let over = [];
  for (let t = 1000; t <= 6000; t += 1000) over = over.concat(m.feed(s(t, 15, 500, 'active')).over);
  assert.deepEqual(over, []);                                              // рівно 5 с — ще ні
  const [o] = m.feed(s(7000, 15, 500, 'active')).over;
  assert.deepEqual([o.kind, o.limit, o.window], ['spike', 10, '6s']);
});

test('сплеск коротший за 5 с — не перевищення', () => {
  const m = createMeter(BUDGET, { trace: true });
  m.feed(s(0, 0));
  let over = [];
  for (let t = 1000; t <= 4000; t += 1000) over = over.concat(m.feed(s(t, 20)).over);
  over = over.concat(m.feed(s(5000, 3)).over);
  for (let t = 6000; t <= 9000; t += 1000) over = over.concat(m.feed(s(t, 20)).over);
  assert.deepEqual(over, []);
});

test("сторож: м'який і жорсткий пороги",() => {
  const g = createGuard();
  assert.deepEqual(g.feed(900, 0), { level: 'ok', changed: false, actions: [] });
  assert.deepEqual(g.feed(1200, 1000), { level: 'soft', changed: true, actions: SOFT });
  assert.deepEqual(g.feed(1400, 2000), { level: 'hard', changed: true, actions: HARD });
  assert.deepEqual(SOFT, ['lists', 'map', 'timer', 'rule', 'locator']);
  assert.deepEqual(HARD, ['lists', 'map', 'timer', 'rule', 'locator', 'ocr', 'grab']);
});

test('сторож: та сама дія не частіше разу на 2 хв', () => {
  const g = createGuard();
  assert.equal(g.feed(1250, 0).actions.length, 5);
  assert.deepEqual(g.feed(1260, 60e3).actions, []);
  assert.deepEqual(g.feed(1260, 119e3).actions, []);
  assert.equal(g.feed(1260, 120e3).actions.length, 5);
  assert.equal(g.feed(1450, 121e3).actions.length, 7);                     // жорсткий поріг паузи м'якого не чекає
  assert.deepEqual(g.feed(1450, 180e3).actions, []);
  assert.deepEqual(g.feed(1300, 200e3).actions, []);                       // жорсткий щойно зробив і м'які дії
});

test('сторож: назад в ok лише нижче 1100 МБ', () => {
  const g = createGuard();
  g.feed(1250, 0);
  assert.deepEqual(g.feed(1150, 5000), { level: 'soft', changed: false, actions: [] });
  assert.deepEqual(g.feed(1099, 10000), { level: 'ok', changed: true, actions: [] });
  g.feed(1450, 20000);
  assert.equal(g.feed(1250, 25000).level, 'hard');                         // з жорсткого теж — лише через ok
  assert.equal(g.feed(1000, 30000).level, 'ok');
});

test('сторож: пороги можна задати свої (перевірка на малих числах)', () => {
  const g = createGuard({ ...BUDGET, memSoft: 300, memHard: 400, memOk: 250 });
  assert.equal(g.feed(310, 0).level, 'soft');
  assert.equal(g.feed(420, 1).level, 'hard');
  assert.equal(g.feed(240, 2).level, 'ok');
});

test('рядки журналу — як у contracts/usage-log.md', () => {
  const at = Date.parse('2026-11-16T18:42:00.000Z');
  assert.equal(line({ type: 'START', at, v: '0.9.4', cores: 12, ram: 16 }), '2026-11-16T18:42:00.000Z START v=0.9.4 cores=12 ram=16');
  assert.equal(line({ type: 'MIN', at, state: 'background', cpu: 3.14, cpuMax: 7.449, mem: 612.4, ws: 839.6, procs: 7 }),
    '2026-11-16T18:42:00.000Z MIN state=background cpu=3.1 cpuMax=7.4 mem=612 ws=840 procs=7');
  assert.equal(line({ type: 'S', at, state: 'active', cpu: 11.94, mem: 701.2 }), '2026-11-16T18:42:00.000Z S state=active cpu=11.9 mem=701');
  assert.equal(line({ type: 'T', at, kind: 'buyer-frame', ms: 497.3 }), '2026-11-16T18:42:00.000Z T kind=buyer-frame ms=497');
  assert.equal(line({ type: 'OVER', at, kind: 'cpu-background', value: 6.81, limit: 5, window: '10m' }), '2026-11-16T18:42:00.000Z OVER kind=cpu-background value=6.8 limit=5 window=10m');
  assert.equal(line({ type: 'OVER', at, kind: 'mem', value: 1532.2, limit: 1500 }), '2026-11-16T18:42:00.000Z OVER kind=mem value=1532 limit=1500');
  assert.equal(line({ type: 'PRESSURE', at, level: 'soft', before: 1214, after: 905, did: ['lists', 'map', 'locator'] }),
    '2026-11-16T18:42:00.000Z PRESSURE level=soft before=1214 after=905 did=lists,map,locator');
});

test('стан програми для заміру', () => {
  assert.equal(stateOf({ session: null, windowShown: true, listsAt: 0, now: 1e6 }), 'idle');
  assert.equal(stateOf({ session: {}, windowShown: false, listsAt: 0, now: 1e6 }), 'background');
  assert.equal(stateOf({ session: {}, windowShown: true, listsAt: 0, now: 1e6 }), 'active');
  assert.equal(stateOf({ session: {}, windowShown: false, listsAt: 1e6 - 9000, now: 1e6 }), 'active');
  assert.equal(stateOf({ session: {}, windowShown: false, listsAt: 1e6 - 11000, now: 1e6 }), 'background');
});
