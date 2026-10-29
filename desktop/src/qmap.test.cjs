const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createQmap } = require('./qmap.cjs');

/* сайт-заглушка: лічильник запитів і відповіді за шляхом */
function site(files) {
  const calls = [];
  const get = async url => {
    calls.push(url);
    if (files === 'offline') throw new Error('немає мережі');
    const p = new URL(url).pathname, f = files[p];
    if (!f) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response(f, { status: 200, headers: { 'content-type': 'image/webp', 'last-modified': 'Thu, 22 Oct 2026 21:55:47 GMT' } });
  };
  return { calls, get };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qmap-'));
const req = url => new Request(url);

test('файл мапи: перший раз — із сайту й на диск, з тим самим ?v= — з диска без мережі', async () => {
  const dir = tmp(), s = site({ '/map/5/15/20.webp': 'TILE' });
  const q = createQmap({ site: 'https://q-hub.fun', dir, fetch: s.get });
  const r1 = await q.handle(req('qmap://site/map/5/15/20.webp?v=A'));
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.headers.get('content-type'), 'image/webp');
  assert.strictEqual(await r1.text(), 'TILE');
  assert.deepStrictEqual(s.calls, ['https://q-hub.fun/map/5/15/20.webp?v=A']);
  const r2 = await q.handle(req('qmap://site/map/5/15/20.webp?v=A'));
  assert.strictEqual(await r2.text(), 'TILE');
  assert.strictEqual(s.calls.length, 1);
});

test('нова версія мапи (інший ?v=) — перезавантажити; без мережі — старий файл; нема ні файлу, ні мережі — 404', async () => {
  const dir = tmp();
  await createQmap({ site: 'https://q-hub.fun', dir, fetch: site({ '/map/v/index.json': 'OLD' }).get }).handle(req('qmap://site/map/v/index.json?v=A'));
  const s = site({ '/map/v/index.json': 'NEW' });
  const r = await createQmap({ site: 'https://q-hub.fun', dir, fetch: s.get }).handle(req('qmap://site/map/v/index.json?v=B'));
  assert.strictEqual(await r.text(), 'NEW');
  assert.strictEqual(r.headers.get('content-type'), 'application/json');
  const off = createQmap({ site: 'https://q-hub.fun', dir, fetch: site('offline').get });
  assert.strictEqual(await (await off.handle(req('qmap://site/map/v/index.json?v=C'))).text(), 'NEW');
  assert.strictEqual((await off.handle(req('qmap://site/map/v/1_2.bin?v=C'))).status, 404);
});

test('немає такого файлу на сайті (сайт віддає index.html) — 404 і нічого не записано', async () => {
  const dir = tmp();
  const r = await createQmap({ site: 'https://q-hub.fun', dir, fetch: site({}).get }).handle(req('qmap://site/map/6/0/0.webp?v=A'));
  assert.strictEqual(r.status, 404);
  assert.ok(!fs.existsSync(path.join(dir, 'map', '6', '0', '0.webp')));
});

test('лише /map/… і без виходу з теки кешу — інакше 400 без запиту до сайту', async () => {
  const s = site({}), q = createQmap({ site: 'https://q-hub.fun', dir: tmp(), fetch: s.get });
  for (const u of ['qmap://site/index.html', 'qmap://site/map/../settings.json', 'qmap://site/map/%2e%2e/x.json', 'qmap://site/map/a b.webp'])
    assert.strictEqual((await q.handle(req(u))).status, 400, u);
  assert.strictEqual(s.calls.length, 0);
});

test('тип за розширенням: .bin — octet-stream', async () => {
  const q = createQmap({ site: 'https://q-hub.fun', dir: tmp(), fetch: site({ '/map/game/names.bin': 'B' }).get });
  assert.strictEqual((await q.handle(req('qmap://site/map/game/names.bin?v=A'))).headers.get('content-type'), 'application/octet-stream');
});
