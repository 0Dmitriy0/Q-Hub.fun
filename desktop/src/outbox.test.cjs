const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { outbox, pinKeyConflict } = require('./outbox.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qhub-drafts-'));
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test('put пише знімок і опис з id', () => {
  const box = outbox(tmp(), async () => 'ok');
  const id = box.put({ taken_at: '2026-10-24T12:00:00Z', x: null, y: null, match: {} }, jpg);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(box.dir, id + '.json'), 'utf8')), { taken_at: '2026-10-24T12:00:00Z', x: null, y: null, match: {}, id });
  assert.deepEqual(fs.readFileSync(path.join(box.dir, id + '.jpg')), jpg);
  assert.equal(box.size(), 1);
});

test('ok — прибирає, retry — лишає, denied — прибирає й рахує', async () => {
  let answer = 'retry';
  const seen = [];
  const box = outbox(tmp(), async (d, j) => { seen.push([d.id, j.length]); return answer; });
  const id = box.put({ taken_at: 't' }, jpg);
  assert.deepEqual(await box.flush(), { sent: 0, denied: 0, left: 1 });
  assert.equal(box.size(), 1);
  answer = 'ok';
  assert.deepEqual(await box.flush(), { sent: 1, denied: 0, left: 0 });
  assert.equal(box.size(), 0);
  assert.deepEqual(seen, [[id, 4], [id, 4]]);
  box.put({ taken_at: 't' }, jpg); answer = 'denied';
  assert.deepEqual(await box.flush(), { sent: 0, denied: 1, left: 0 });
  assert.equal(fs.readdirSync(box.dir).length, 0);
});

test('помилка мережі (виняток) — як retry', async () => {
  const box = outbox(tmp(), async () => { throw new Error('offline'); });
  box.put({ taken_at: 't' }, jpg);
  assert.deepEqual(await box.flush(), { sent: 0, denied: 0, left: 1 });
});

test('два flush поспіль не шлють ту саму чернетку двічі', async () => {
  let calls = 0;
  const box = outbox(tmp(), async () => { calls++; await new Promise(r => setTimeout(r, 20)); return 'ok'; });
  box.put({ taken_at: 't' }, jpg);
  const [a, b] = await Promise.all([box.flush(), box.flush()]);
  assert.equal(calls, 1);
  assert.equal(a, b);
});

test('пошкоджений опис прибирається, а не блокує чергу', async () => {
  const box = outbox(tmp(), async () => 'ok');
  fs.writeFileSync(path.join(box.dir, 'bad.json'), '{не json');
  box.put({ taken_at: 't' }, jpg);
  assert.deepEqual(await box.flush(), { sent: 1, denied: 0, left: 0 });
  assert.equal(fs.readdirSync(box.dir).length, 0);
});

test('клавіша мітки не збігається з плашкою й знімком', () => {
  assert.equal(pinKeyConflict('F9', 'Alt+Q', 'Alt+S'), null);
  assert.match(pinKeyConflict('alt+q', 'Alt+Q', 'Alt+S'), /плашку/);
  assert.match(pinKeyConflict('Alt+S', 'Alt+Q', 'Alt+S'), /навчальний знімок/);
  assert.match(pinKeyConflict('', 'Alt+Q', 'Alt+S'), /Оберіть/);
});
