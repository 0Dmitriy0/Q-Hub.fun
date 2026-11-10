const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createNotifier } = require('./notify.cjs');

/* фальшивий Notification Electron: запам'ятовує показані */
function fake(supported = true) {
  const shown = [];
  class N extends EventEmitter {
    constructor(o) { super(); this.o = o; }
    show() { shown.push(this); }
    static isSupported() { return supported; }
  }
  return { N, shown };
}

test('сповіщення показується з назвою, текстом та іконкою; клік викликає обробник і відпускає об\'єкт', () => {
  const { N, shown } = fake(), box = createNotifier({ Notification: N, icon: 'icon.png' });
  let clicks = 0;
  assert.equal(box.notify({ title: 'НЛО — через 10 хв', body: 'Початок о 17:15 за Києвом.' }, () => { clicks++; }), true);
  assert.deepEqual(shown[0].o, { title: 'НЛО — через 10 хв', body: 'Початок о 17:15 за Києвом.', icon: 'icon.png' });
  assert.equal(box.size(), 1);   // тримаємо, поки не закрили: інакше клік губиться
  shown[0].emit('click');
  assert.equal(clicks, 1);
  assert.equal(box.size(), 0);
});

test('закрите чи невдале сповіщення не лишається в пам\'яті; і те, яке ніхто не чіпав, — теж', async () => {
  const { N, shown } = fake(), box = createNotifier({ Notification: N, icon: '', hold: 20 });
  box.notify({ title: 'a', body: '' }); box.notify({ title: 'b', body: '' }); box.notify({ title: 'c', body: '' });
  shown[0].emit('close'); shown[1].emit('failed');
  assert.equal(box.size(), 1);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(box.size(), 0);
});

test('Windows без сповіщень або порожнє сповіщення — нічого не показуємо', () => {
  const off = fake(false), a = createNotifier({ Notification: off.N, icon: '' });
  assert.equal(a.notify({ title: 'a', body: '' }), false);
  const on = fake(), b = createNotifier({ Notification: on.N, icon: '' });
  assert.equal(b.notify(null), false);
  assert.equal(off.shown.length + on.shown.length, 0);
});

test('обробник кліку впав — програма не падає', () => {
  const { N, shown } = fake(), box = createNotifier({ Notification: N, icon: '' });
  box.notify({ title: 'a', body: '' }, () => { throw new Error('вікно закрите'); });
  assert.doesNotThrow(() => shown[0].emit('click'));
});
