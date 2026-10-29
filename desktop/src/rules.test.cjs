const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRules } = require('./rules.cjs');

const snap = (n = 1) => ({ fetched: '2026-10-29T10:00:00.000Z', topics: Array.from({ length: n }, (_, i) => ({ title: 'T' + i, section: 'S', url: 'u' + i, kind: 'law', items: [{ n: '6.5', h: '', s: 'Викрадення' }] })) });
const res = (status, body, etag) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => (k.toLowerCase() === 'etag' ? etag ?? null : null) }, text: async () => body });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qhub-rules-'));

test('свіжий знімок — у кеш разом з ETag; current() — він', async () => {
  const dir = tmp();
  const r = createRules({ dir, url: 'x', fetch: async () => res(200, JSON.stringify(snap(2)), '"e1"') });
  assert.equal(await r.refresh(), true);
  assert.equal(r.current().topics.length, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'rules.json.etag'), 'utf8'), '"e1"');
});

test('304 — кеш лишається, If-None-Match з ETag надіслано', async () => {
  const dir = tmp();
  await createRules({ dir, url: 'x', fetch: async () => res(200, JSON.stringify(snap(3)), '"e1"') }).refresh();
  let sent = null;
  const r = createRules({ dir, url: 'x', fetch: async (_u, o) => { sent = o.headers['If-None-Match']; return res(304, ''); } });
  assert.equal(await r.refresh(), false);
  assert.equal(sent, '"e1"');
  assert.equal(r.current().topics.length, 3);
});

test('без мережі — кеш; без кешу й мережі — null (плашка бере вбудовану копію)', async () => {
  const dir = tmp();
  const off = async () => { throw new Error('offline'); };
  assert.equal(await createRules({ dir, url: 'x', fetch: off }).refresh(), false);
  assert.equal(createRules({ dir, url: 'x', fetch: off }).current(), null);
  await createRules({ dir, url: 'x', fetch: async () => res(200, JSON.stringify(snap(1)), '"e1"') }).refresh();
  const r = createRules({ dir, url: 'x', fetch: off });
  assert.equal(await r.refresh(), false);
  assert.equal(r.current().topics.length, 1);
});

test('битий JSON, порожній знімок, помилка сервера — кеш не затирається', async () => {
  const dir = tmp();
  await createRules({ dir, url: 'x', fetch: async () => res(200, JSON.stringify(snap(4)), '"e1"') }).refresh();
  for (const bad of [res(200, '{ битий', '"e2"'), res(200, JSON.stringify({ fetched: 'x', topics: [] }), '"e3"'), res(500, 'oops')]) {
    const r = createRules({ dir, url: 'x', fetch: async () => bad });
    assert.equal(await r.refresh(), false);
    assert.equal(r.current().topics.length, 4);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'rules.json.etag'), 'utf8'), '"e1"', 'ETag битого знімка записано');
});
