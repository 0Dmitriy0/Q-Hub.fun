// Відкриває живий сайт у справжньому Chrome (на сервері GitHub) і показує помилки JavaScript на кожній сторінці.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const path of ['/', '/tsiny', '/transport', '/kabinet', '/programa']) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('JS: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  pg.on('requestfailed', r => errs.push('request failed: ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')));
  let status = '';
  try { const res = await pg.goto('https://q-hub.fun' + path, { waitUntil: 'networkidle', timeout: 30000 }); status = String(res?.status()); }
  catch (e) { status = 'ERROR ' + e.message.slice(0, 200); }
  await pg.waitForTimeout(1500);
  const text = (await pg.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log(`== ${path} -> ${status}; text ${text.length} chars: ${text.slice(0, 160)}`);
  for (const e of errs.slice(0, 12)) console.log('   ' + e);
  await pg.close();
}
await b.close();
