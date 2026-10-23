const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { makeClient, login, PORTS } = require('./auth.cjs');
const { fileStorage } = require('./store.cjs');

const get = (url, o = {}) => new Promise((res, rej) => http.get(url, o, r => { let b = ''; r.on('data', d => (b += d)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } }; };
const cfg = { url: 'https://example.supabase.co', key: 'test-key' };

test('вхід: адреса Discord з PKCE і поверненням на 127.0.0.1, код з браузера йде на обмін', async () => {
  const sb = makeClient(cfg, mem());
  let opened, exchanged;
  sb.auth.exchangeCodeForSession = async code => { exchanged = code; return { data: { session: { user: { id: 'u1' } } }, error: null }; };
  const p = login(sb, url => { opened = url; });
  while (!opened) await new Promise(r => setTimeout(r, 20));
  const u = new URL(opened);
  assert.equal(u.searchParams.get('provider'), 'discord');
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  assert.match(u.searchParams.get('redirect_to'), /^http:\/\/127\.0\.0\.1:5368[23]\/auth$/);
  assert.equal((await get(u.searchParams.get('redirect_to').replace('/auth', '/zzz'))).status, 404);
  const r = await get(u.searchParams.get('redirect_to') + '?code=abc123');
  assert.equal(r.status, 200); assert.match(r.body, /Готово/);
  assert.deepEqual(await p, { user: { id: 'u1' } });
  assert.equal(exchanged, 'abc123');
});

test('вхід: відмова в браузері — зрозуміла помилка, сервер закривається', async () => {
  const sb = makeClient(cfg, mem());
  let opened;
  const p = login(sb, url => { opened = url; }); p.catch(() => {});
  while (!opened) await new Promise(r => setTimeout(r, 20));
  const back = new URL(opened).searchParams.get('redirect_to');
  const r = await get(back + '?error=access_denied&error_description=Користувач%20скасував');
  assert.match(r.body, /Не вдалося/);
  await assert.rejects(p, /скасував/);
  await assert.rejects(get(back, { agent: false }), /ECONNREFUSED/);
});

test('вхід: зайнятий перший порт — бере запасний', async () => {
  const busy = http.createServer();
  await new Promise((r, j) => { busy.once('error', j); busy.listen(PORTS[0], '127.0.0.1', r); });
  const sb = makeClient(cfg, mem());
  sb.auth.exchangeCodeForSession = async () => ({ data: { session: {} }, error: null });
  let opened; const p = login(sb, url => { opened = url; });
  while (!opened) await new Promise(r => setTimeout(r, 20));
  const back = new URL(opened).searchParams.get('redirect_to');
  assert.equal(new URL(back).port, String(PORTS[1]));
  await get(back + '?code=x'); await p; busy.close();
});

test('сесія у файлі зашифрована й переживає перезапуск', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qhub-')), 'session.bin');
  const enc = s => Buffer.from(s).map(b => b ^ 0x5a), dec = b => Buffer.from(b).map(x => x ^ 0x5a).toString();
  const a = fileStorage(f, enc, dec); a.setItem('sb-token', '{"refresh_token":"secret"}');
  assert.ok(!fs.readFileSync(f).toString().includes('secret'));
  assert.equal(fileStorage(f, enc, dec).getItem('sb-token'), '{"refresh_token":"secret"}');
  a.removeItem('sb-token'); assert.equal(fileStorage(f, enc, dec).getItem('sb-token'), null);
});
