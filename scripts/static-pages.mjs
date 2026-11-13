// Статичні сторінки для пошуковиків. Сайт — один index.html, а заголовок і текст сторінки малює JavaScript, тож усі адреси
// віддавали Google байт-у-байт однаковий файл з порожнім тілом: він бачив 17 «дублікатів» головної (Search Console, 2026-11-13).
// Після `vite build` для кожної адреси з public/sitemap.xml (+ гайди з бази) кладемо dist/_p/<адреса>.html: та сама оболонка
// застосунку, але свій <title>, опис, canonical, og:url і текст сторінки в #root (React його одразу замінює — гравець різниці не
// бачить). public/.htaccess віддає цей файл замість index.html, якщо він є. dist/sitemap.xml — з гайдами з бази.
// Без бази збірка не падає: сторінки виходять без списків з бази. Запуск: node scripts/static-pages.mjs (після vite build).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const SITE = 'https://q-hub.fun';
const PAGES = JSON.parse(readFileSync('src/data/pages.json', 'utf8'));
const shell = readFileSync('dist/index.html', 'utf8');
const env = { ...(existsSync('.env.production') ? Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => l.trim().split(/=(.*)/s).slice(0, 2))) : {}), ...process.env };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function rest(path) {
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/* блоки гайду (src/data/guides.ts → GuideBlock) у простий HTML */
function blocks(list = []) {
  return list.map(b => {
    switch (b.k) {
      case 'p': return `<p>${esc(b.text)}</p>`;
      case 'h': return `<h2>${esc(b.text)}</h2>`;
      case 'tip': case 'warn': return `<p><b>${b.k === 'tip' ? 'Порада' : 'Увага'}:</b> ${esc(b.text)}</p>`;
      case 'list': { const t = b.ordered ? 'ol' : 'ul'; return `<${t}>${(b.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</${t}>`; }
      case 'table': return `<table><thead><tr>${(b.head || []).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      case 'links': return `<ul>${(b.items || []).map(l => `<li><a href="${esc(l.to)}">${esc(l.label)}</a></li>`).join('')}</ul>`;
      default: return '';
    }
  }).join('\n');
}

const titleOf = p => p === '/' ? PAGES.home : `${PAGES.titles[p] ?? 'Q-Hub'} · Q-Hub`;
const descOf = p => PAGES.descriptions[p] ?? null;

function page(path, { title, desc, h1, body }) {
  const url = SITE + (path === '/' ? '/' : path);
  let h = shell.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  if (desc) h = h.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace('</head>', `  <link rel="canonical" href="${esc(url)}" />\n  </head>`);
  const nav = ['/', '/tsiny', '/wiki', '/wiki/roboty', '/wiki/transport', '/wiki/iventy', '/wiki/gaidy', '/mapa', '/programa']
    .map(p => `<a href="${p}">${esc(p === '/' ? 'Головна' : PAGES.titles[p])}</a>`).join(' · ');
  const html = `<div class="page"><nav>${nav}</nav><main><h1>${esc(h1)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}\n${body || ''}</main></div>`;
  return h.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
}

const routes = [...readFileSync('public/sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/q-hub\.fun([^<]*)<\/loc>/g)].map(m => m[1] || '/');
const [guidesDb, jobsDb] = await Promise.all([
  rest('wiki_guides?select=id,name,summary,blocks,updated_at,hidden&hidden=eq.false&order=sort,name'),
  rest('jobs?select=id,name,description,level,legal,pay&hidden=eq.false&order=name'),
]);
const guides = guidesDb ?? [];
const snap = existsSync('public/snapshot/prices.json') ? JSON.parse(readFileSync('public/snapshot/prices.json', 'utf8')) : null;

const extra = {
  '/wiki/gaidy': () => guides.length ? `<ul>${guides.map(g => `<li><a href="/wiki/gaidy/${esc(g.id)}">${esc(g.name)}</a> — ${esc(g.summary)}</li>`).join('')}</ul>` : '',
  '/wiki': () => guides.length ? `<h2>Гайди</h2><ul>${guides.map(g => `<li><a href="/wiki/gaidy/${esc(g.id)}">${esc(g.name)}</a></li>`).join('')}</ul>` : '',
  '/wiki/roboty': () => jobsDb?.length ? `<ul>${jobsDb.map(j => `<li><a href="/wiki/roboty?job=${esc(j.id)}">${esc(j.name)}</a> — з ${esc(j.level)} рівня, ${j.legal ? 'легальна' : 'нелегальна'}${j.pay ? `. Оплата: ${esc(j.pay)}` : ''}${j.description ? `. ${esc(j.description)}` : ''}</li>`).join('')}</ul>` : '',
  '/tsiny': () => snap?.buyers?.length ? `<h2>Скупники</h2><ul>${snap.buyers.map(b => {
    const items = (snap.rows || []).filter(r => r.buyer_id === b.id).map(r => r.items?.name).filter(Boolean);
    return `<li><b>${esc(b.name)}</b>${items.length ? `: ${esc(items.join(', '))}` : ''}</li>`;
  }).join('')}</ul>` : '',
};

let n = 0;
const write = (path, html) => {
  const f = `dist/_p${path === '/' ? '/index' : path.replace(/\/$/, '')}.html`;
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); n++;
};
for (const p of routes) {
  if (p.startsWith('/wiki/gaidy/')) continue;   // статті — нижче, з бази
  write(p, page(p, { title: titleOf(p), desc: descOf(p), h1: p === '/' ? 'Q-Hub — усе для Quant RP' : PAGES.titles[p] ?? 'Q-Hub', body: extra[p]?.() }));
}
for (const g of guides) {
  const p = `/wiki/gaidy/${g.id}`;
  write(p, page(p, { title: `${g.name} — гайди · Q-Hub`, desc: g.summary || descOf('/wiki/gaidy'), h1: g.name, body: blocks(g.blocks) }));
}

/* sitemap: статичні розділи + усі гайди з бази (новий гайд потрапляє в пошук сам, без правки файлу) */
const all = [...new Set([...routes.filter(p => !p.startsWith('/wiki/gaidy/') || !guidesDb), ...guides.map(g => `/wiki/gaidy/${g.id}`)])];
const last = Object.fromEntries(guides.map(g => [`/wiki/gaidy/${g.id}`, g.updated_at?.slice(0, 10)]));
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all.map(p => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc>${last[p] ? `<lastmod>${last[p]}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
console.log(`static pages: ${n} (гайдів з бази: ${guidesDb ? guides.length : 'немає зв’язку'}, робіт: ${jobsDb?.length ?? 'немає зв’язку'}), sitemap: ${all.length}`);
