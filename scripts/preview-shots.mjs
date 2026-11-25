// Знімки сторінок нової збірки (SHOT_BASE — запущена тут же vite preview) і, за позначкою [old], живого сайту —
// телефон і ПК, шматками по екрану. Запускає .github/workflows/preview.yml. Позначки — у повідомленні коміту (COMMIT_MSG).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

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

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const report = [];
for (const t of targets) for (const theme of themes) for (const [vk, v] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext({
    viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch,
    locale: 'uk-UA', timezoneId: 'Europe/Kyiv', colorScheme: theme, reducedMotion: 'reduce'
  });
  await ctx.addInitScript(th => { try { localStorage.setItem('qhub-theme2', th); } catch { /* */ } }, theme);
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
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0);
    const total = Math.min(h, v.cap);
    let n = 0;
    for (let y = 0; y < total; y += v.chunk) {
      const height = Math.min(v.chunk, total - y);
      if (height < 120 && n > 0) break;
      n++;
      await pg.screenshot({ path: `${OUT}/${t}-${theme}-${vk}-${slug(r)}-${n}.jpg`, type: 'jpeg', quality: 72, fullPage: true,
        clip: { x: 0, y, width: v.viewport.width, height } });
    }
    report.push(`${t} ${theme} ${vk} ${r} -> ${status}; висота ${h}px${over > 0 ? `; ГОРИЗОНТАЛЬНА ПРОКРУТКА +${over}px` : ''}; знімків ${n}`);
    for (const e of errs.slice(0, 8)) report.push('    ' + e);
    await pg.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n');
console.log(report.join('\n'));
