const test = require('node:test');
const assert = require('node:assert/strict');
const jt = require('./jobtimer.cjs');

const M = 60e3, H = 36e5, T0 = Date.UTC(2026, 10, 14, 10, 0, 0);
const bal = total => ({ cash: total, bank: 0 });
/* вимір, що йшов `min` хвилин і заробив `gain` (баланс з 100 000) */
function measured(min, gain, label = null) {
  const m = jt.create('s:1', T0, 'id' + min + gain);
  jt.update(m, bal(100000), T0);
  jt.update(m, bal(100000 + gain), T0 + min * M - 1000);
  jt.stop(m, T0 + min * M);
  m.label = label;
  return m;
}

/* ---------- US1: вимір ---------- */
test('старт чекає баланс; перше зчитування починає відлік з поточного балансу', () => {
  const m = jt.create('s:1', T0);
  assert.equal(m.state, 'wait');
  assert.equal(jt.runMsAt(m, T0 + 5 * M), 0);
  jt.update(m, { cash: 1000, bank: 500 }, T0 + 2000);
  assert.equal(m.state, 'run');
  assert.equal(m.last, 1500);
  assert.equal(m.gain, 0);
});

test('сума зростань; витрати не віднімаються', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(1000), T0);
  jt.update(m, bal(3000), T0 + 2000);   // +2000
  jt.update(m, bal(2500), T0 + 4000);   // покупка −500 — не віднімається
  jt.update(m, bal(4500), T0 + 6000);   // +2000
  assert.equal(m.gain, 4000);
});

test('стрибок понад max_jump — у заробіток не йде, вимір позначено', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(1000), T0);
  jt.update(m, bal(9000000), T0 + 2000, 5e6);
  jt.update(m, bal(9001000), T0 + 4000, 5e6);
  assert.equal(m.flag, true);
  assert.equal(m.gain, 1000);
});

test('за годину: до 1 хв — null; 20 хв +12 000 $ → 36 000 $/год', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(0), T0);
  jt.update(m, bal(5000), T0 + 30e3);
  assert.equal(jt.perHour(m, T0 + 30e3), null);
  jt.update(m, bal(12000), T0 + 20 * M);
  assert.equal(jt.perHour(m, T0 + 20 * M), 36000);
  jt.stop(m, T0 + 20 * M);
  assert.equal(m.state, 'done');
  assert.equal(m.runMs, 20 * M);
  assert.equal(jt.perHour(m), 36000);   // done — за зафіксованим часом
});

test('стоп до першого балансу — порожній вимір, його не зберігають (U2)', () => {
  const m = jt.create('s:1', T0);
  jt.stop(m, T0 + 3 * M);
  assert.equal(m.state, 'done');
  assert.equal(jt.isEmpty(m), true);
  assert.equal(jt.isEmpty(measured(5, 100)), false);
});

test('стан зберігається й відновлюється; відлік після перезапуску — пауза з позначкою', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(0), T0);
  jt.update(m, bal(6000), T0 + 10 * M);
  jt.touch(m, T0 + 10 * M);
  const r = jt.restore(JSON.parse(JSON.stringify(jt.state(m))), T0 + 10 * M + 5000);
  assert.equal(r.state, 'pause');
  assert.equal(r.interrupted, true);
  assert.equal(r.gain, 6000);
  assert.equal(r.runMs, 10 * M);
});

test('програму закрили на 8 год — час простою не йде в роботу (U1)', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(0), T0);
  jt.update(m, bal(6000), T0 + 10 * M);
  jt.touch(m, T0 + 10 * M);
  const r = jt.restore(jt.state(m), T0 + 8 * H);
  assert.equal(r.runMs, 10 * M);
  assert.equal(jt.perHour(r, T0 + 8 * H), 36000);
});

test('restore: сміття — null; done і пауза — як були', () => {
  assert.equal(jt.restore(null, T0), null);
  assert.equal(jt.restore({ state: 'щось' }, T0), null);
  const d = measured(5, 100);
  assert.equal(jt.restore(jt.state(d), T0 + H).state, 'done');
});

/* ---------- US2: пауза, час без балансу ---------- */
test('пауза: час і гроші за паузу не рахуються; 20 хв +10 000 → 30 000 $/год', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(100000), T0);
  jt.update(m, bal(105000), T0 + 10 * M);        // +5 000 за 10 хв
  jt.pause(m, T0 + 10 * M);
  assert.equal(m.state, 'pause');
  jt.update(m, bal(103000), T0 + 12 * M);        // покупка в паузі
  jt.update(m, bal(104000), T0 + 14 * M);        // і навіть зростання в паузі — не рахується
  assert.equal(m.gain, 5000);
  assert.equal(jt.runMsAt(m, T0 + 15 * M), 10 * M);
  jt.resume(m, T0 + 15 * M);
  assert.equal(m.last, 104000);                  // продовжує з балансу, побаченого в паузі
  jt.update(m, bal(109000), T0 + 25 * M);        // +5 000 за 10 хв
  jt.stop(m, T0 + 25 * M);
  assert.equal(m.runMs, 20 * M);
  assert.equal(m.gain, 10000);
  assert.equal(jt.perHour(m), 30000);
});

test('баланс не видно понад 15 с — рахується в blindMs; blind() показує зараз', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(0), T0);
  assert.equal(jt.blind(m, T0 + 10e3), false);
  assert.equal(jt.blind(m, T0 + 20e3), true);
  jt.update(m, bal(100), T0 + 75e3);             // проміжок 75 с → 60 с без балансу
  assert.equal(m.blindMs, 60e3);
  assert.equal(jt.blind(m, T0 + 76e3), false);
  jt.pause(m, T0 + 80e3);
  assert.equal(jt.blind(m, T0 + 200e3), false);  // у паузі — не «не видно»
  jt.resume(m, T0 + 200e3);
  jt.update(m, bal(200), T0 + 202e3);            // після паузи проміжок рахується від продовження
  assert.equal(m.blindMs, 60e3);
});

/* ---------- US3: підпис і історія ---------- */
test('cleanLabel: робота з рівнем 1–100 чи без; інше — помилка', () => {
  assert.deepEqual(jt.cleanLabel(null), { ok: true, label: null });
  assert.deepEqual(jt.cleanLabel({ kind: 'job', id: 'farm', name: 'Ферма', level: 3 }), { ok: true, label: { kind: 'job', id: 'farm', name: 'Ферма', level: 3, variant: null } });
  assert.equal(jt.cleanLabel({ kind: 'job', id: 'farm', name: 'Ферма', level: null }).label.level, null);
  assert.equal(jt.cleanLabel({ kind: 'job', id: 'farm', name: 'Ферма' }).label.level, null);
  for (const level of [0, 101, 2.5, '3', NaN, -1]) assert.equal(jt.cleanLabel({ kind: 'job', id: 'farm', name: 'Ферма', level }).ok, false, String(level));
  assert.equal(jt.cleanLabel({ kind: 'job', id: '', name: 'Ферма', level: 1 }).ok, false);
});

test('cleanLabel: власний замір — trim, 1–60 знаків, довша обрізається', () => {
  assert.deepEqual(jt.cleanLabel({ kind: 'own', name: '  риболовля на пірсі ' }), { ok: true, label: { kind: 'own', name: 'риболовля на пірсі' } });
  assert.equal(jt.cleanLabel({ kind: 'own', name: '   ' }).ok, false);
  assert.equal(jt.cleanLabel({ kind: 'own', name: 'я'.repeat(80) }).label.name.length, 60);
  assert.equal(jt.cleanLabel({ kind: 'щось' }).ok, false);
});

test('ключ і назва групи: робота + рівень, власний без регістру, без підпису', () => {
  assert.equal(jt.groupKey({ kind: 'job', id: 'farm', name: 'Ферма', level: 3 }), 'job:farm:3');
  assert.equal(jt.groupKey({ kind: 'job', id: 'farm', name: 'Ферма', level: null }), 'job:farm:-');
  assert.equal(jt.groupKey({ kind: 'own', name: 'Риболовля На Пірсі' }), jt.groupKey({ kind: 'own', name: 'риболовля на пірсі' }));
  assert.equal(jt.groupKey(null), 'none');
  assert.equal(jt.groupTitle({ kind: 'job', id: 'farm', name: 'Ферма', level: 3 }), 'Ферма · рівень 3');
  assert.equal(jt.groupTitle({ kind: 'job', id: 'farm', name: 'Ферма', level: null }), 'Ферма · рівень не вказано');
  assert.equal(jt.groupTitle({ kind: 'own', name: 'риболовля' }), 'риболовля');
  assert.equal(jt.groupTitle(null), 'Без підпису');
});

test('історія: новіші першими, не більше 200', () => {
  let items = [];
  for (let i = 0; i < 205; i++) items = jt.historyAdd(items, { ...measured(5, 100), id: 'm' + i });
  assert.equal(items.length, 200);
  assert.equal(items[0].id, 'm204');
});

test('групи: рівні не змішуються; середнє Σзаробітку ÷ Σчасу; короткі й сумнівні не входять', () => {
  const f3 = { kind: 'job', id: 'farm', name: 'Ферма', level: 3 }, f1 = { kind: 'job', id: 'farm', name: 'Ферма', level: 1 };
  const bad = measured(30, 50000, f3); bad.flag = true;
  const items = [measured(30, 15000, f3), measured(30, 17000, f3), measured(60, 18000, f1), bad,
    { ...measured(1, 0, f3), runMs: 30e3, id: 'short' }, measured(20, 6000, { kind: 'own', name: 'Риболовля' })];
  const g = jt.historyGroups(items);
  const by = Object.fromEntries(g.map(x => [x.key, x]));
  assert.equal(by['job:farm:3'].perHour, 32000);
  assert.equal(by['job:farm:3'].n, 2);
  assert.equal(by['job:farm:1'].perHour, 18000);
  assert.equal(by['own:риболовля'].perHour, 18000);
  assert.equal(by['own:риболовля'].title, 'Риболовля');
});

test('зміна підпису й видалення; надісланий вимір перепідписати не можна', () => {
  const a = measured(30, 15000), b = { ...measured(20, 9000), id: 'b', sent: { at: T0, proposalId: 'p1' } };
  let items = [a, b];
  const r = jt.historyRelabel(items, a.id, { kind: 'own', name: 'гриби' });
  assert.equal(r.ok, true);
  assert.equal(r.items[0].label.name, 'гриби');
  assert.equal(jt.historyRelabel(items, 'b', null).ok, false);
  assert.equal(jt.historyRelabel(items, a.id, { kind: 'job', id: 'x', name: 'X', level: 0 }).ok, false);
  items = jt.historyRemove(items, 'b');
  assert.deepEqual(items.map(x => x.id), [a.id]);
});

/* ---------- US4: пропозиція в довідник ---------- */
const farm3 = { kind: 'job', id: 'farm', name: 'Ферма', level: 3 };
const ctx = { jobIds: new Set(['farm']), login: true, online: true };

test('canPropose: причини за порядком', () => {
  assert.equal(jt.canPropose(measured(30, 15000, farm3), ctx), '');
  assert.equal(jt.canPropose({ ...measured(30, 15000, farm3), sent: { at: 1 } }, ctx), 'sent');
  assert.equal(jt.canPropose(measured(30, 15000, null), ctx), 'no-label');
  assert.equal(jt.canPropose(measured(30, 15000, { kind: 'own', name: 'x' }), ctx), 'own');
  assert.equal(jt.canPropose(measured(30, 15000, { ...farm3, level: null }), ctx), 'no-level');
  assert.equal(jt.canPropose(measured(30, 15000, farm3), { ...ctx, jobIds: new Set() }), 'gone');
  assert.equal(jt.canPropose(measured(9, 15000, farm3), ctx), 'short');
  assert.equal(jt.canPropose({ ...measured(30, 15000, farm3), flag: true }, ctx), 'flag');
  assert.equal(jt.canPropose(measured(30, 15000, farm3), { ...ctx, login: false }), 'login');
  assert.equal(jt.canPropose(measured(30, 15000, farm3), { ...ctx, online: false }), 'offline');
  const run = jt.create('s:1', T0); run.label = farm3;
  assert.equal(jt.canPropose(run, ctx), 'short');   // ще не завершено
});

test('текст заробітку: рівень, округлення до сотні, хвилини й дата за Києвом', () => {
  assert.equal(jt.payPart(measured(30, 15049, farm3)), 'Рівень 3: ≈30 000 $/год (вимір 30 хв, 14.11.2026)');
  assert.equal(jt.payPart(measured(60, 8450, farm3)), 'Рівень 3: ≈8 450 $/год (вимір 60 хв, 14.11.2026)');
});

test('mergePay: свій рівень замінюється, новий дописується за порядком, решта лишається', () => {
  const p3 = 'Рівень 3: ≈30 000 $/год (вимір 30 хв, 14.11.2026)';
  assert.deepEqual(jt.mergePay('', 3, p3), { pay: p3, tooLong: false });
  assert.deepEqual(jt.mergePay('Залежить від врожаю · Рівень 1: ≈18 000 $/год', 3, p3),
    { pay: 'Залежить від врожаю · Рівень 1: ≈18 000 $/год · ' + p3, tooLong: false });
  assert.deepEqual(jt.mergePay('Рівень 5: ≈50 000 $/год\nРівень 3: старе', 3, p3),
    { pay: p3 + ' · Рівень 5: ≈50 000 $/год', tooLong: false });
  assert.deepEqual(jt.mergePay('від 500 $ за рейс', 3, p3), { pay: 'від 500 $ за рейс · ' + p3, tooLong: false });
  const long = jt.mergePay('а'.repeat(290), 3, p3);
  assert.deepEqual(long, { pay: p3, tooLong: true });
});

test('примітка джерела: ≤ 300, з рівнем, хвилинами, сумами й id', () => {
  const m = measured(30, 15000, farm3);
  const s = jt.sourceNote(m, false);
  assert.ok(s.length <= 300);
  assert.match(s, /рівень 3/);
  assert.match(s, /30 хв/);
  assert.match(s, /\+15 000 \$/);
  assert.match(s, /30 000 \$\/год/);
  assert.match(s, /сумнівних стрибків немає/);
  assert.ok(s.endsWith('id:' + m.id));
  assert.match(jt.sourceNote(m, true), /звести вручну/);
});

/* ---------- помилки зчитування: коливання, що повертається, — не заробіток ---------- */
test('зчитування «впало й повернулось» за 20 с — повернення не рахується', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(1700000), T0);
  jt.update(m, bal(1637533), T0 + 2000);    // OCR прочитав менше
  jt.update(m, bal(1700000), T0 + 6000);    // повернулось — це не заробіток
  assert.equal(m.gain, 0);
  jt.update(m, bal(1701000), T0 + 30000);   // справжнє зростання — рахується
  assert.equal(m.gain, 1000);
});

test('зчитування «стрибнуло вгору й повернулось» за 20 с — зростання знімається', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(1700000), T0);
  jt.update(m, bal(1762467), T0 + 2000);
  assert.equal(m.gain, 62467);
  jt.update(m, bal(1700000), T0 + 8000);
  assert.equal(m.gain, 0);
  assert.equal(m.fixes, 1);
});

test('справжні витрата й заробіток через довго — як раніше', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(10000), T0);
  jt.update(m, bal(8000), T0 + 2000);       // покупка
  jt.update(m, bal(9500), T0 + 60000);      // заробіток через хвилину — рахується
  jt.update(m, bal(12000), T0 + 62000);
  jt.update(m, bal(9000), T0 + 200000);     // ще покупка через довго
  assert.equal(m.gain, 4000);
});

test('покупка й одразу заробіток іншої суми — заробіток рахується повністю (FR-006)', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(10000), T0);
  jt.update(m, bal(9000), T0 + 2000);       // покупка −1000
  jt.update(m, bal(11500), T0 + 6000);      // +2500 — не та сама сума, отже не помилка зчитування
  assert.equal(m.gain, 2500);
  assert.equal(m.fixes ?? 0, 0);
});

test('останні зміни балансу — у вимірі, не більше 12', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(0), T0);
  for (let i = 1; i <= 15; i++) jt.update(m, bal(i * 100), T0 + i * 30000);
  assert.equal(m.log.length, 12);
  assert.deepEqual(m.log[m.log.length - 1], { at: T0 + 15 * 30000, acc: 'cash', d: 100, add: 100, kind: 'gain' });
});

/* ---------- справжній випадок з timer.log (2026-11-14): OCR прочитав банк 1 538 292 як 3 538 292 на 22 с ---------- */
test('банк «1→3» на 22 с, а готівка в ту ж мить росте — враховано лише готівку', () => {
  const t = s => Date.parse('2026-11-14T13:' + s + 'Z');
  const m = jt.create('s:1', t('42:00.000'));
  jt.update(m, { cash: 226833, bank: 1538292 }, t('42:00.000'));
  jt.update(m, { cash: 228544, bank: 1538292 }, t('42:46.920'));
  jt.update(m, { cash: 230180, bank: 1538292 }, t('43:49.609'));
  jt.update(m, { cash: 231889, bank: 1538292 }, t('45:12.677'));
  jt.update(m, { cash: 233436, bank: 1538292 }, t('46:07.818'));
  jt.update(m, { cash: 233436, bank: 3538292 }, t('46:52.938'));   // помилка OCR
  assert.equal(m.gain, 6603);                                      // +2 000 000 не врахований — чекає підтвердження
  assert.equal(jt.pending(m), 2000000);
  jt.update(m, { cash: 234939, bank: 1538292 }, t('47:14.775'));   // банк повернувся, готівка +1 503
  assert.equal(m.gain, 6603 + 1503);
  assert.equal(jt.pending(m), 0);
  assert.equal(m.fixes, 1);
  assert.equal(m.flag, false);
});

test('справжнє велике зростання — враховується після 90 с', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, { cash: 1000, bank: 500000 }, T0);
  jt.update(m, { cash: 1000, bank: 750000 }, T0 + 10e3);           // +250 000 — чекає
  assert.equal(m.gain, 0);
  jt.update(m, { cash: 1500, bank: 750000 }, T0 + 60e3);
  assert.equal(m.gain, 500);
  jt.update(m, { cash: 1500, bank: 750000 }, T0 + 101e3);          // минуло 90 с — підтверджено
  jt.update(m, { cash: 2000, bank: 750000 }, T0 + 102e3);
  assert.equal(m.gain, 250000 + 500 + 500);
  assert.equal(jt.pending(m), 0);
});

test('стоп, поки велике зростання не підтверджене, — не враховано, вимір сумнівний', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, { cash: 1000, bank: 0 }, T0);
  jt.update(m, { cash: 301000, bank: 0 }, T0 + 5e3);
  jt.stop(m, T0 + 20e3);
  assert.equal(m.gain, 0);
  assert.equal(m.flag, true);
  const m2 = jt.create('s:1', T0);
  jt.update(m2, { cash: 1000, bank: 0 }, T0);
  jt.update(m2, { cash: 301000, bank: 0 }, T0 + 5e3);
  jt.stop(m2, T0 + 200e3);                                         // на стопі вже минуло 90 с — підтверджено
  assert.equal(m2.gain, 300000);
  assert.equal(m2.flag, false);
});

test('стан з непідтвердженим стрибком переживає збереження й відновлення', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, { cash: 1000, bank: 0 }, T0);
  jt.update(m, { cash: 201000, bank: 0 }, T0 + 5e3);
  const r = jt.restore(JSON.parse(JSON.stringify(jt.state(m))), T0 + 10e3);
  assert.equal(jt.pending(r), 200000);
  jt.resume(r, T0 + 20e3);
  jt.update(r, { cash: 1000, bank: 0 }, T0 + 25e3);               // повернулось — не заробіток
  assert.equal(r.gain, 0);
});

/* ---------- справжній випадок з timer.log (2026-11-14 13:55): готівка 244 333 прочитана як 24 433 308 на 2 с ---------- */
test('неправдоподібний стрибок, що повернувся, — не сумнівний; заробіток за цей час рахується', () => {
  const t = s => Date.parse('2026-11-14T13:' + s + 'Z');
  const m = jt.create('s:1', t('54:00.000'));
  jt.update(m, { cash: 241210, bank: 1538292 }, t('54:00.000'));
  jt.update(m, { cash: 242844, bank: 1538292 }, t('54:21.927'));   // +1 634
  jt.update(m, { cash: 24433308, bank: 1538292 }, t('55:17.096'), 5e6);
  assert.equal(m.flag, true);
  jt.update(m, { cash: 244333, bank: 1538292 }, t('55:19.197'), 5e6);
  assert.equal(m.flag, false);
  assert.equal(m.gain, 1634 + 1489);                                // справжній заробіток між зчитуваннями
  assert.equal(m.fixes, 1);
});

test('стрибок, що не повернувся, — лишається сумнівним', () => {
  const m = jt.create('s:1', T0);
  jt.update(m, bal(1000), T0);
  jt.update(m, bal(9000000), T0 + 2000, 5e6);
  jt.update(m, bal(9000500), T0 + 90e3, 5e6);
  assert.equal(m.flag, true);
});

/* ---------- варіанти роботи замість рівня: ферма — на чому саме заробив ---------- */
const wheat = { kind: 'job', id: 'farmer', name: 'Фермер', variant: 'Пшениця' };
test('ферма: варіанти зі списку; рівень не потрібен', () => {
  assert.deepEqual(jt.VARIANTS.farmer, ['Пшениця', 'Гарбузи', 'Капуста', 'Яйця', 'Апельсини', 'Молоко']);
  assert.deepEqual(jt.cleanLabel(wheat), { ok: true, label: { kind: 'job', id: 'farmer', name: 'Фермер', level: null, variant: 'Пшениця' } });
  assert.equal(jt.cleanLabel({ ...wheat, variant: 'Кукурудза' }).ok, false);
  assert.equal(jt.cleanLabel({ ...wheat, variant: null }).label.variant, null);
  assert.equal(jt.cleanLabel({ ...wheat, level: 3 }).label.level, null);          // у ферми рівень не пишемо
  assert.equal(jt.cleanLabel({ kind: 'job', id: 'taxi', name: 'Таксі', level: 2, variant: 'Пшениця' }).label.variant, null);   // у інших — без варіантів
});

test('ферма: групи за варіантом; назва групи', () => {
  assert.equal(jt.groupKey(wheat), 'job:farmer:Пшениця');
  assert.equal(jt.groupTitle(wheat), 'Фермер · Пшениця');
  assert.equal(jt.groupTitle({ ...wheat, variant: null }), 'Фермер · що саме — не вказано');
});

test('ферма: пропонувати можна лише з варіантом; текст і зведення за варіантом', () => {
  assert.equal(jt.canPropose(measured(30, 15000, { ...wheat, variant: null, level: null }), ctx2()), 'no-variant');
  const m = measured(30, 15049, { ...wheat, level: null });
  assert.equal(jt.canPropose(m, ctx2()), '');
  assert.equal(jt.payPart(m), 'Пшениця: ≈30 000 $/год (вимір 30 хв, 14.11.2026)');
  const p = jt.payPart(m);
  assert.deepEqual(jt.mergePay('Від 1 500 $ за збір · Гарбузи: ≈25 000 $/год', 'Пшениця', p), { pay: 'Від 1 500 $ за збір · Гарбузи: ≈25 000 $/год · ' + p, tooLong: false });
  assert.deepEqual(jt.mergePay('Пшениця: старе · Гарбузи: ≈25 000 $/год', 'Пшениця', p), { pay: p + ' · Гарбузи: ≈25 000 $/год', tooLong: false });
  assert.match(jt.sourceNote(m, false), /^Таймер Q-Hub: Пшениця, 30 хв/);
});
function ctx2() { return { jobIds: new Set(['farmer', 'farm']), login: true, online: true }; }
