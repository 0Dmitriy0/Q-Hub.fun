const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuleSync, ForumBlocked, DAY } = require('./rulesync.cjs');

/* specs/095: правила форуму з ПК адміна. crawl тут — фейк, що читає задані сторінки через get модуля
   (справжній lib/rulecrawl.cjs збирається лише перед dist, а тести програми йдуть раніше) */
const FORUM_PAGE = '<div class="ipsLayout_container"><h1>Правила</h1></div>';
const NOW = Date.parse('2026-11-24T20:00:00Z');

function setup({ role = 'admin', lastOk = null, state = null, pages = {}, invoke = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rulesync-'));
  if (state) fs.writeFileSync(path.join(tmp, 'rulesync.json'), JSON.stringify(state));
  const fetched = [], invoked = [];
  const fetch = async url => {
    fetched.push(url);
    const p = pages[url.replace('https://forum.quant5.com.ua/', '')] ?? { status: 200, body: FORUM_PAGE };
    return { ok: p.status === 200, status: p.status, headers: { get: h => (p.headers || {})[h] ?? null }, text: async () => p.body };
  };
  const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, maybeSingle: async () => ({ data: lastOk, error: null }) };
  const sb = {
    from: t => (t === 'rules_sync_runs'
      ? q
      : { select: () => ({ order: async () => ({ data: [{ id: 1, url: 'https://forum.quant5.com.ua/index.php?/forum/10-x/', kind: 'rules', enabled: true }], error: null }) }) }),
    functions: { invoke: async (name, opts) => { invoked.push({ name, body: opts.body }); return invoke ?? { data: { fetched: 'x', topics: 1, items: 2, changes: 0 }, error: null }; } },
  };
  /* фейковий обхід: дві сторінки; stop — як у crawl.ts */
  const crawl = async (get, sources, stop) => {
    for (const p of ['index.php?/forum/10-x/', 'index.php?/topic/5-dm/']) {
      try { await get(p); } catch (e) { if (stop(e)) throw e; return { fresh: [], errors: new Map([[1, e.message]]), titles: new Map() }; }
    }
    return { fresh: [{ title: 'ДМ', section: 'S', url: 'https://forum.quant5.com.ua/index.php?/topic/5-dm/', kind: 'rules', src: 1, items: [{ n: '1', h: '', s: 'x' }, { n: '2', h: '', s: 'y' }] }], errors: new Map(), titles: new Map([[1, 'Правила']]) };
  };
  const rs = createRuleSync({ dir: () => tmp, fetch, crawl, sb, role: () => role, version: '0.9.0', now: () => NOW, sleep: async () => {} });
  return { rs, fetched, invoked, tmp };
}

test('гравець — форум не читається взагалі', async () => {
  const { rs, fetched, invoked } = setup({ role: 'user' });
  assert.equal((await rs.tick()).result, 'skip');
  assert.equal(fetched.length, 0); assert.equal(invoked.length, 0);
});

test('власна спроба менше доби тому — пропуск (FR-002)', async () => {
  const { rs, fetched } = setup({ state: { lastAttempt: new Date(NOW - DAY + 60e3).toISOString(), lastResult: 'forum' } });
  assert.equal((await rs.tick()).result, 'skip'); assert.equal(fetched.length, 0);
});

test('за базою вже оновлено менше доби тому — пропуск', async () => {
  const { rs, fetched } = setup({ lastOk: { at: new Date(NOW - 3600e3).toISOString(), via: 'server' } });
  const r = await rs.tick();
  assert.equal(r.result, 'skip'); assert.match(r.note, /уже оновлено/); assert.equal(fetched.length, 0);
});

test('пора — читає форум під справжньою назвою й надсилає теми via:app', async () => {
  const { rs, fetched, invoked, tmp } = setup({ lastOk: { at: new Date(NOW - DAY - 60e3).toISOString(), via: 'app' } });
  const r = await rs.tick();
  assert.equal(r.result, 'ok');
  assert.equal(fetched.length, 2);
  assert.equal(invoked[0].name, 'rules-sync');
  assert.equal(invoked[0].body.via, 'app');
  assert.equal(invoked[0].body.fresh.length, 1);
  assert.deepEqual(invoked[0].body.titles, [[1, 'Правила']]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'rulesync.json'), 'utf8')).lastResult, 'ok');
});

for (const [name, page] of [
  ['403', { status: 403, body: '' }],
  ['429', { status: 429, body: '' }],
  ['200 + «Just a moment…»', { status: 200, body: '<title>Just a moment...</title>' }],
  ['200 + cf-mitigated', { status: 200, body: FORUM_PAGE, headers: { 'cf-mitigated': 'challenge' } }],
  ['200, але не форум', { status: 200, body: '<html>щось інше</html>' }],
]) {
  test(`форум блокує (${name}) — зупинка на першій сторінці, нічого не надіслано (US2)`, async () => {
    const { rs, fetched, invoked, tmp } = setup({ pages: { 'index.php?/forum/10-x/': page } });
    const r = await rs.tick();
    assert.equal(r.result, 'forum');
    assert.equal(fetched.length, 1);
    assert.equal(invoked.length, 0);
    const st = JSON.parse(fs.readFileSync(path.join(tmp, 'rulesync.json'), 'utf8'));
    assert.equal(st.lastResult, 'forum');
    /* і наступна спроба — лише через добу */
    assert.equal((await rs.tick()).result, 'skip');
  });
}

test('404 окремої теми — помилка джерела, а не блок: обхід доходить до кінця й надсилає', async () => {
  const { rs, invoked } = setup({ pages: { 'index.php?/topic/5-dm/': { status: 404, body: '' } } });
  const r = await rs.tick();
  assert.equal(invoked.length, 1);
  assert.deepEqual(invoked[0].body.errors, [[1, 'форум відповів 404']]);
  assert.equal(r.result, 'ok');
});

test('сервер відмовив — причина з тіла відповіді', async () => {
  const { rs } = setup({ invoke: { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Програма надіслала неправильні дані: тема 1: …' }) } } } });
  const r = await rs.tick();
  assert.equal(r.result, 'server'); assert.match(r.note, /неправильні дані/);
});

test('get — лише хост форуму', async () => {
  const { rs } = setup();
  await assert.rejects(rs.get('https://evil.example/x'), /не форум сервера/);
});

test('ForumBlocked — окремий тип, щоб crawl зупинявся лише на ньому', () => {
  assert.ok(new ForumBlocked('x') instanceof Error);
});
