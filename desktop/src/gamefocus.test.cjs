const test = require('node:test');
const assert = require('node:assert/strict');
const { gameFocus, hwndOf } = require('./gamefocus.cjs');

/* підставний user32: передній план — fg, живі вікна — alive, активовані — у activated */
function fake(fg, alive = [fg]) {
  const activated = [];
  return { activated, api: { foreground: () => fg.value, activate: h => (activated.push(h), true), alive: h => alive.includes(h) || alive.includes('*') } };
}

test('запам\'ятала гру — після hide фокус назад у неї', () => {
  const fg = { value: 500 }, f = fake(fg, ['*']);
  const g = gameFocus({ api: f.api, ours: () => [100] });
  g.remember();
  fg.value = 100;   // наша плашка взяла фокус
  assert.equal(g.giveBack(), true);
  assert.deepEqual(f.activated, [500]);
});

test('на передньому плані наше вікно — не запам\'ятовує його як гру', () => {
  const fg = { value: 100 }, f = fake(fg, ['*']);
  const g = gameFocus({ api: f.api, ours: () => [100] });
  g.remember();
  assert.equal(g.giveBack(), false);
  assert.deepEqual(f.activated, []);
});

test('гру закрили — нікуди не повертає', () => {
  const fg = { value: 500 }, f = fake(fg, []);
  const g = gameFocus({ api: f.api });
  g.remember();
  assert.equal(g.giveBack(), false);
});

test('без user32 (не Windows) — тихо нічого', () => {
  const g = gameFocus({ api: null });
  g.remember();
  assert.equal(g.giveBack(), false);
});

test('HWND з Buffer Electron — числом', () => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(142346918n);
  assert.equal(hwndOf(b), 142346918);
  const s = Buffer.alloc(4); s.writeUInt32LE(77);
  assert.equal(hwndOf(s), 77);
});

/* specs/078: форма мітки закривається — фокус грі лише якщо форма його мала */
const { closeToGame } = require('./gamefocus.cjs');
const spy = (ret) => { const f = () => { f.calls++; if (ret instanceof Error) throw ret; return ret; }; f.calls = 0; return f; };

test('closeToGame: форма мала фокус — ховає й віддає грі', () => {
  const hide = spy(), giveBack = spy(true);
  assert.equal(closeToGame({ hadFocus: true, hide, giveBack }), true);
  assert.equal(hide.calls, 1);
  assert.equal(giveBack.calls, 1);
});

test('closeToGame: гравець пішов в інше вікно — ховає, але не перемикає', () => {
  const hide = spy(), giveBack = spy(true);
  assert.equal(closeToGame({ hadFocus: false, hide, giveBack }), false);
  assert.equal(hide.calls, 1);
  assert.equal(giveBack.calls, 0);
});

test('closeToGame: гру закрили (giveBack — false) — просто false', () => {
  assert.equal(closeToGame({ hadFocus: true, hide: spy(), giveBack: spy(false) }), false);
});

test('closeToGame: збій повернення фокусу — не кидає, вікно все одно сховане', () => {
  const hide = spy();
  assert.equal(closeToGame({ hadFocus: true, hide, giveBack: spy(new Error('user32')) }), false);
  assert.equal(hide.calls, 1);
});
