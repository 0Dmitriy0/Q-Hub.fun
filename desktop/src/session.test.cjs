const test = require('node:test');
const assert = require('node:assert');
const { tracker, BEAT, LEASE, QUEUE_MAX } = require('./session.cjs');

const iso = ms => new Date(ms).toISOString();

/* фальшиві процеси, годинник і база: rows — upsert за id, як у game_sessions (specs/044) */
function setup({ stored = null, started = null, money = () => null, queue = [], character = 'c1' } = {}) {
  const s = { on: false, now: 1_000_000, store: stored, rows: {}, n: 0, changes: 0, online: true, writes: 0, queue, character };
  const tick = tracker({
    running: async () => s.on, started: async () => started, now: () => s.now, character: () => s.character,
    uuid: () => 'r' + ++s.n, money,
    db: {
      write: async r => { if (!s.online) return false; s.writes++; s.rows[r.id] = { ...s.rows[r.id], ...r }; return true; },
      drop: async id => { delete s.rows[id]; },
    },
    load: () => s.store, save: v => { s.store = v; }, changed: () => { s.changes++; },
    loadQueue: () => s.queue, saveQueue: v => { s.queue = v; },
  });
  return { s, tick };
}

test('сесія: гра запустилась → рядок з орендою наперед, раз на хвилину оренда відсувається, гру закрито → кінець зараз', async () => {
  const { s, tick } = setup();
  await tick(); assert.deepEqual(s.rows, {});
  s.on = true; await tick();
  assert.deepEqual(s.rows.r1, { id: 'r1', character_id: 'c1', started_at: iso(1_000_000), ended_at: iso(1_000_000 + LEASE) });
  s.now += 30e3; await tick(); assert.equal(s.rows.r1.ended_at, iso(1_000_000 + LEASE));  // ще не хвилина
  s.now += 40e3; await tick(); assert.equal(s.rows.r1.ended_at, iso(1_070_000 + LEASE));  // оренда відсунулась
  s.now += 10 * 60e3; s.on = false; await tick();
  assert.equal(s.rows.r1.ended_at, iso(s.now));
  assert.equal(s.store, null);
  assert.equal(s.changes, 2);
});

test('сесія: гра вже йшла до старту програми — початок з часу процесу', async () => {
  const { s, tick } = setup({ started: 1_000_000 - 30 * 60e3 });
  s.on = true; await tick();
  assert.equal(s.rows.r1.started_at, iso(1_000_000 - 30 * 60e3));
});

test('сесія: коротша за хвилину (перезапуск лаунчера) — видаляється', async () => {
  const { s, tick } = setup();
  s.on = true; await tick();
  s.now += 20e3; s.on = false; await tick();
  assert.deepEqual(s.rows, {});
});

test('сесія: програму перезапустили під час гри — та сама сесія; гру закрили без програми — кінець на останній відмітці', async () => {
  const stored = { id: 'r9', character: 'c1', started: 0, last: 1_000_000 - 10 * 60e3 };
  const a = setup({ stored }); a.s.rows.r9 = { id: 'r9', ended_at: iso(stored.last) };
  a.s.on = true; await a.tick();
  assert.equal(a.s.n, 0, 'нової сесії не відкрито');
  await a.tick(); assert.equal(a.s.rows.r9.ended_at, iso(a.s.now + LEASE));

  const b = setup({ stored }); b.s.rows.r9 = { id: 'r9', ended_at: iso(stored.last) };
  b.s.on = false; await b.tick();
  assert.equal(b.s.rows.r9.ended_at, iso(stored.last));
});

test('сесія: стан 0.6 без персонажа — та сама сесія, персонаж — обраний зараз', async () => {
  const { s, tick } = setup({ stored: { id: 'old', started: 0, last: 1_000_000 } });
  s.on = true; await tick();
  assert.equal(s.n, 0);
  assert.equal(s.rows.old.character_id, 'c1');
  assert.equal(s.rows.old.id, 'old', 'рядок 0.6 оновлюється за його id — без дубля');
});

test('сесія: не вдалося перевірити процеси — нічого не змінюється', async () => {
  const { s, tick } = setup({ stored: { id: 'r1', character: 'c1', started: 0, last: 1_000_000 } });
  s.on = null; await tick();
  assert.deepEqual(s.store, { id: 'r1', character: 'c1', started: 0, last: 1_000_000 });
});

test('гроші (specs/044): кожен запис несе підсумок money_* персонажа сесії; без зчитування — без полів', async () => {
  let m = null;
  const asked = [];
  const { s, tick } = setup({ money: c => { asked.push(c); return m; } });
  s.on = true; await tick();
  assert.equal('money_gain' in s.rows.r1, false, 'до першого зчитування money_* не передаються');
  m = { money_from: iso(1_000_000), money_to: iso(1_060_000), money_start: 10, money_end: 30, money_gain: 25, money_flag: false };
  s.now += BEAT; await tick();
  assert.equal(s.rows.r1.money_gain, 25);
  s.now += 5 * 60e3; s.on = false; await tick();
  assert.equal(s.rows.r1.money_end, 30);
  assert.ok(asked.every(c => c === 'c1'), 'гроші питаються для персонажа сесії');
});

test('гроші: персонаж змінився посеред сеансу — сесія лишається за першим, гроші питаються для нього', async () => {
  const asked = [];
  const { s, tick } = setup({ money: c => { asked.push(c); return null; } });
  s.on = true; await tick();
  s.character = 'c2'; s.now += BEAT; await tick();
  assert.equal(s.rows.r1.character_id, 'c1');
  assert.ok(asked.every(c => c === 'c1'));
});

test('без зв\'язку: сесія відкривається й так; повтор того самого id — один рядок; фінальний запис не вдався → черга → відправлено пізніше', async () => {
  const { s, tick } = setup();
  s.online = false; s.on = true; await tick();
  assert.equal(s.store.id, 'r1', 'сесія відкрита локально');
  assert.deepEqual(s.rows, {});
  s.online = true; await tick();
  assert.ok(s.rows.r1, 'запис повторено, щойно з\'явився зв\'язок');
  s.now += BEAT; await tick(); s.now += BEAT; await tick();
  assert.equal(Object.keys(s.rows).length, 1, 'повтори не дають дубля');
  s.now += 10 * 60e3; s.online = false; s.on = false; await tick();
  assert.equal(s.queue.length, 1);
  assert.equal(s.queue[0].ended_at, iso(s.now));
  await tick(); assert.equal(s.queue.length, 1, 'без зв\'язку лишається в черзі');
  s.online = true; await tick();
  assert.deepEqual(s.queue, []);
  assert.equal(s.rows.r1.ended_at, iso(s.now - 0));
});

test('черга: не більше QUEUE_MAX — найстаріші відкидаються', async () => {
  const old = Array.from({ length: QUEUE_MAX }, (_, i) => ({ id: 'q' + i }));
  const { s, tick } = setup({ queue: old });
  s.online = false; s.on = true; await tick();
  s.now += 10 * 60e3; s.on = false; await tick();
  assert.equal(s.queue.length, QUEUE_MAX);
  assert.equal(s.queue[0].id, 'q1');
  assert.equal(s.queue.at(-1).id, 'r1');
});

test('помилка бази (виняток) — як відсутність зв\'язку, таймер не падає', async () => {
  const { s, tick } = setup();
  s.on = true; await tick();
  const t = tracker({
    running: async () => true, started: async () => null, now: () => 1, character: () => 'c', uuid: () => 'x', money: () => null,
    db: { write: async () => { throw new Error('мережа'); }, drop: async () => {} },
    load: () => null, save: () => {}, changed: () => {}, loadQueue: () => [], saveQueue: () => {},
  });
  assert.equal((await t()).id, 'x');
});

test('база без 0049: рядок сесії без полів money_*', () => {
  const { withoutMoney } = require('./session.cjs');
  assert.deepEqual(withoutMoney({ id: 'r1', character_id: 'c1', started_at: 'a', ended_at: 'b', money_gain: 5, money_flag: false }),
    { id: 'r1', character_id: 'c1', started_at: 'a', ended_at: 'b' });
});
