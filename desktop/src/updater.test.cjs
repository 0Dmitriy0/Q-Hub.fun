const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { IDLE, reduce, createUpdater } = require('./updater.cjs');

const run = (...evs) => evs.reduce(reduce, IDLE);

test('нова версія → кнопка, завантаження з відсотками, готово', () => {
  let s = run(['available', { version: '0.2.57' }]);
  assert.equal(s.status, 'available'); assert.equal(s.version, '0.2.57');
  s = reduce(s, ['start']); assert.equal(s.status, 'downloading');
  s = reduce(s, ['progress', { percent: 41.6 }]); assert.equal(s.percent, 42);
  s = reduce(s, ['downloaded', { version: '0.2.57' }]); assert.equal(s.status, 'ready'); assert.equal(s.percent, 100);
});

test('без нової версії нічого не показується, «start» без версії ігнорується', () => {
  assert.equal(run(['none']), IDLE);
  assert.equal(run(['start']), IDLE);
  assert.equal(run(['progress', { percent: 50 }]), IDLE);
});

test('помилка перевірки (немає інтернету) — тихо', () => {
  assert.equal(run(['error']), IDLE);
  const s = run(['available', { version: '1.0.1' }], ['error']);
  assert.equal(s.status, 'available'); assert.equal(s.error, null);
});

test('помилка завантаження — знову кнопка й текст помилки', () => {
  const s = run(['available', { version: '1.0.1' }], ['start'], ['progress', { percent: 30 }], ['error']);
  assert.equal(s.status, 'available'); assert.match(s.error, /Не вдалося/);
  assert.equal(reduce(s, ['start']).error, null);
});

test('відсоток обмежено 0–100', () => {
  const d = run(['available', { version: '1.0.1' }], ['start']);
  assert.equal(reduce(d, ['progress', { percent: 140 }]).percent, 100);
  assert.equal(reduce(d, ['progress', { percent: -3 }]).percent, 0);
});

/* electron-updater підміняється емітером: перевіряємо, що без кнопки нічого не завантажується й не ставиться */
function fake() {
  const u = new EventEmitter();
  u.calls = [];
  u.checkForUpdates = async () => { u.calls.push('check'); };
  u.downloadUpdate = async () => { u.calls.push('download'); };
  u.quitAndInstall = (silent, run) => u.calls.push(`install ${silent} ${run}`);
  return u;
}

test('без натискання — лише перевірка; кнопка → завантаження → встановлення', () => {
  const u = fake(), seen = []; let before = 0;
  const up = createUpdater({ autoUpdater: u, onChange: s => seen.push(s.status), beforeInstall: () => before++ });
  assert.equal(u.autoDownload, false);
  up.check();
  u.emit('update-available', { version: '0.2.57' });
  assert.deepEqual(u.calls, ['check']);
  up.install();
  u.emit('download-progress', { percent: 50 });
  u.emit('update-downloaded', { version: '0.2.57' });
  assert.deepEqual(u.calls, ['check', 'download', 'install true true']);
  assert.equal(before, 1);
  assert.deepEqual(seen, ['available', 'downloading', 'downloading', 'ready']);
});

test('подвійне натискання не запускає два завантаження', () => {
  const u = fake();
  const up = createUpdater({ autoUpdater: u, onChange: () => {}, beforeInstall: () => {} });
  u.emit('update-available', { version: '0.2.57' });
  up.install(); up.install();
  assert.deepEqual(u.calls, ['download']);
});
