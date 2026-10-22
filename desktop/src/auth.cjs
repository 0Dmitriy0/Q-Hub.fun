/* Вхід програми: власна сесія Supabase через Discord у системному браузері (OAuth + PKCE, RFC 8252).
   Браузер повертається на http://127.0.0.1:<порт>/auth?code=…, код міняється на сесію.
   Спільна з сайтом сесія не годиться: refresh-токени одноразові, і сайт з програмою викидали б одне одного. */
const http = require('node:http');
const { createClient } = require('@supabase/supabase-js');

const PORTS = [53682, 53683];   // ці адреси мають бути в Supabase → Authentication → Redirect URLs
const TIMEOUT = 5 * 60 * 1000;

const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>Q-Hub</title>
<body style="font:16px system-ui;background:#111214;color:#f4f1ec;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#ff6a1f">${title}</h1><p>${text}</p></div>`;

/* storage — { getItem, setItem, removeItem } (у програмі — зашифрований файл); open — відкрити адресу в браузері */
function makeClient(cfg, storage) {
  return createClient(cfg.url, cfg.key, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= PORTS.length) return reject(new Error('порти 53682 і 53683 зайняті — закрий інші копії програми'));
      const port = PORTS[i++];
      server.once('error', e => (e.code === 'EADDRINUSE' ? next() : reject(e)));
      server.listen(port, '127.0.0.1');
    };
    /* колбек listen() невдалої спроби лишається підписаним — порт беремо з того, де сервер слухає насправді */
    server.once('listening', () => resolve(server.address().port));
    next();
  });
}

async function login(sb, open) {
  const server = http.createServer();
  const port = await listen(server);
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'discord', options: { redirectTo: `http://127.0.0.1:${port}/auth`, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const code = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('вхід не завершено за 5 хвилин')), TIMEOUT);
      server.on('request', (req, res) => {
        const u = new URL(req.url, `http://127.0.0.1:${port}`);
        if (u.pathname !== '/auth') { res.writeHead(404).end(); return; }
        const c = u.searchParams.get('code'), err = u.searchParams.get('error_description');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(c ? page('Готово', 'Вхід виконано — повертайся в програму Q-Hub. Цю вкладку можна закрити.')
                  : page('Не вдалося', err || 'Discord не підтвердив вхід. Спробуй ще раз у програмі.'));
        clearTimeout(t); c ? resolve(c) : reject(new Error(err || 'вхід скасовано'));
      });
      open(data.url);
    });
    const { data: s, error: e2 } = await sb.auth.exchangeCodeForSession(code);
    if (e2) throw e2;
    return s.session;
  } finally {
    server.close();
  }
}

module.exports = { makeClient, login, PORTS };
