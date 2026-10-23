const test = require('node:test');
const assert = require('node:assert');
const { tracker, BEAT, LEASE } = require('./session.cjs');

/* фальшиві процеси, годинник і база */
function setup({ stored = null, started = null } = {}) {
  const s = { on: false, now: 1_000_000, store: stored, rows: {}, n: 0, changes: 0 };
  const tick = tracker({
    running: async () => s.on, started: async () => started, now: () => s.now, character: () => 'c1',
    db: {
      start: async (c, at, end) => { const id = 'r' + ++s.n; s.rows[id] = { c, started: at, ended: end }; return id; },
      beat: async (id, at) => { s.rows[id].ended = at; },
      drop: async id => { delete s.rows[id]; },
    },
    load: () => s.store, save: v => { s.store = v; }, changed: () => { s.changes++; },
  });
  return { s, tick };
}

test('сесія: гра запустилась → рядок з орендою наперед, раз на хвилину оренда відсувається, гру закрито → кінець зараз', async () => {
  const { s, tick } = setup();
  await tick(); assert.deepEqual(s.rows, {});
  s.on = true; await tick();
  assert.deepEqual(s.rows.r1, { c: 'c1', started: 1_000_000, ended: 1_000_000 + LEASE });
  s.now += 30e3; await tick(); assert.equal(s.rows.r1.ended, 1_000_000 + LEASE);  // ще не хвилина
  s.now += 40e3; await tick(); assert.equal(s.rows.r1.ended, 1_070_000 + LEASE);  // оренда відсунулась
  s.now += 10 * 60e3; s.on = false; await tick();
  assert.equal(s.rows.r1.ended, s.now);
  assert.equal(s.store, null);
  assert.equal(s.changes, 2);
});

test('сесія: гра вже йшла до старту програми — початок з часу процесу', async () => {
  const { s, tick } = setup({ started: 1_000_000 - 30 * 60e3 });
  s.on = true; await tick();
  assert.equal(s.rows.r1.started, 1_000_000 - 30 * 60e3);
});

test('сесія: коротша за хвилину (перезапуск лаунчера) — видаляється', async () => {
  const { s, tick } = setup();
  s.on = true; await tick();
  s.now += 20e3; s.on = false; await tick();
  assert.deepEqual(s.rows, {});
});

test('сесія: програму перезапустили під час гри — та сама сесія; гру закрили без програми — кінець на останній відмітці', async () => {
  const stored = { id: 'r9', started: 0, last: 1_000_000 - 10 * 60e3 };
  const a = setup({ stored }); a.s.rows.r9 = { c: 'c1', started: 0, ended: stored.last };
  a.s.on = true; await a.tick();
  assert.equal(a.s.n, 0, 'нової сесії не відкрито');
  a.s.now += BEAT; await a.tick(); assert.equal(a.s.rows.r9.ended, a.s.now + LEASE);

  const b = setup({ stored }); b.s.rows.r9 = { c: 'c1', started: 0, ended: stored.last };
  b.s.on = false; await b.tick();
  assert.equal(b.s.rows.r9.ended, stored.last);
});

test('сесія: не вдалося перевірити процеси — нічого не змінюється', async () => {
  const { s, tick } = setup({ stored: { id: 'r1', started: 0, last: 1_000_000 } });
  s.on = null; await tick();
  assert.deepEqual(s.store, { id: 'r1', started: 0, last: 1_000_000 });
});
