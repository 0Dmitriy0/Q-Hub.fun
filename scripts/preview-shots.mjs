// Знімки сторінок нової збірки (SHOT_BASE — запущена тут же vite preview) і, за позначкою [old], живого сайту —
// телефон і ПК, шматками по екрану. Запускає .github/workflows/preview.yml. Позначки — у повідомленні коміту (COMMIT_MSG).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const msg = process.env.COMMIT_MSG || '';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });
const BASE = { new: process.env.SHOT_BASE || 'http://localhost:4173', old: 'https://q-hub.fun' };
const targets = msg.includes('[old]') ? ['old', 'new'] : ['new'];
const themes = msg.includes('[light]') ? ['dark', 'light'] : ['dark'];
const ALL = ['/', '/tsiny', '/wiki/roboty', '/wiki/transport', '/wiki/iventy', '/wiki/gaidy', '/wiki/glosariy',
  '/mapa', '/mapa/v-gru', '/programa', '/programa/instruktsiya', '/kabinet', '/nema-takoi-storinky'];
const only = msg.match(/\[routes:([^\]]+)\]/);
const routes = only ? only[1].split(',').map(s => s.trim()).filter(Boolean) : ALL;
/* телефон — 390 px, щільність 2 (видно дрібний текст); ПК — 1440 px */
const VIEWS = {
  m: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, chunk: 1100, cap: 7700 },
  d: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, chunk: 1000, cap: 6000 }
};
const slug = r => (r === '/' ? 'home' : r.slice(1).replace(/\//g, '_'));

/* [admin] — ще й вигляд адміна (сторінки з кнопками адміна): підроблена сесія в localStorage, роль admin — з перехопленого
   запиту profiles, решта запитів до бази йде з публічним ключем. Нічого не змінює — лише показує розмітку адміна */
const asAdmin = msg.includes('[admin]');
const env = Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => l.trim().split(/=(.*)/s).slice(0, 2)));
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
async function fakeAdmin(ctx) {
  const ref = new URL(SB).hostname.split('.')[0], now = Math.floor(Date.now() / 1000), uid = '00000000-0000-4000-8000-000000000001';
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'preview@q-hub.fun', app_metadata: { provider: 'discord' },
    user_metadata: { full_name: 'Превʼю', name: 'Превʼю', custom_claims: { global_name: 'Превʼю' } }, created_at: new Date().toISOString() };
  const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: now + 7200 })}.x`,
    token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, refresh_token: 'preview', user };
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, [`sb-${ref}-auth-token`, JSON.stringify(session)]);
  await ctx.route(`${SB}/auth/v1/**`, r => r.fulfill({ json: r.request().url().includes('/user') ? user : session }));
  await ctx.route(`${SB}/rest/v1/**`, r => {
    const req = r.request();
    if (req.method() === 'GET' && /\/rest\/v1\/profiles/.test(req.url())) {
      const row = { role: 'admin', nick: 'Превʼю', nick_changed_at: null };
      return r.fulfill({ json: /vnd\.pgrst\.object/.test(req.headers()['accept'] || '') ? row : [row] });
    }
    return r.continue({ headers: { ...req.headers(), authorization: `Bearer ${ANON}` } });
  });
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const report = [];
const runs = [...targets.map(t => ({ t, admin: false })), ...(asAdmin ? [{ t: 'new', admin: true }] : [])];
for (const { t, admin } of runs) for (const theme of themes) for (const [vk, v] of Object.entries(VIEWS)) {
  /* рух увімкнено, як у більшості гравців: знімок робиться після прокрутки, коли все вже з'явилось; [reduce] — зменшений рух */
  const ctx = await browser.newContext({
    viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch,
    locale: 'uk-UA', timezoneId: 'Europe/Kyiv', colorScheme: theme, reducedMotion: msg.includes('[reduce]') ? 'reduce' : 'no-preference'
  });
  await ctx.addInitScript(th => { try { localStorage.setItem('qhub-theme2', th); } catch { /* */ } }, theme);
  if (admin) await fakeAdmin(ctx);
  const tag = admin ? 'adm' : t;
  for (const r of routes) {
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push('JS: ' + e.message.slice(0, 240)));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    const url = BASE[t] + (r === '/' ? '/' : r);
    let status = '';
    try { const res = await pg.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); status = String(res?.status()); }
    catch (e) { status = 'ERR ' + e.message.slice(0, 120); }
    /* прокрутити донизу — щоб підвантажились ліниві картинки й блоки, потім нагору */
    await pg.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 140)); }
      scrollTo(0, 0);
    }).catch(() => {});
    await pg.waitForTimeout(1500);
    const h = await pg.evaluate(() => document.documentElement.scrollHeight).catch(() => v.viewport.height);
    /* що вилазить за правий край екрана (крім вмісту прокручуваних смуг — вкладок, чипів): body обрізає, тож scrollWidth не скаже */
    const over = await pg.evaluate(() => {
      const W = innerWidth; let worst = 0, who = '';
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(); if (!r.width || r.right <= W + 1) continue;
        let p = el.parentElement, inside = false;
        while (p && p !== document.body) { if (getComputedStyle(p).overflowX !== 'visible') { inside = true; break; } p = p.parentElement; }
        if (!inside && r.right - W > worst) { worst = r.right - W; who = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''); }
      }
      return worst > 1 ? `${Math.round(worst)}px (${who})` : '';
    }).catch(() => '');
    const total = Math.min(h, v.cap);
    let n = 0;
    for (let y = 0; y < total; y += v.chunk) {
      const height = Math.min(v.chunk, total - y);
      if (height < 120 && n > 0) break;
      n++;
      await pg.screenshot({ path: `${OUT}/${tag}-${theme}-${vk}-${slug(r)}-${n}.jpg`, type: 'jpeg', quality: 72, fullPage: true,
        clip: { x: 0, y, width: v.viewport.width, height } });
    }
    report.push(`${tag} ${theme} ${vk} ${r} -> ${status}; висота ${h}px${over ? `; ВИЛАЗИТЬ ЗА ЕКРАН +${over}` : ''}; знімків ${n}`);
    for (const e of errs.slice(0, 8)) report.push('    ' + e);
    await pg.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n');
console.log(report.join('\n'));
