/* Правила сервера QuantRP з форуму → src/data/rules.json (для пошуку в плашці Alt+Q і для помічника).
   Обходить розділ «Правила сервера» з підрозділами, з кожної теми бере перший пост і ріже на пункти.
   Правила на форумі змінюються — запускати знову: node scripts/fetch-rules.mjs */
import { writeFileSync } from 'node:fs';

const BASE = 'https://forum.quant5.com.ua/';
const ROOT = 'index.php?/forum/10-правила-серверу/';
const get = async u => { const r = await fetch(new URL(u, BASE), { headers: { 'User-Agent': 'Mozilla/5.0 Q-Hub rules sync' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };
const links = (h, kind) => [...new Set([...h.matchAll(new RegExp(`index\\.php\\?/${kind}/(\\d+)-[^"'/]*`, 'g'))].map(m => m[0]))];
const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

/* текст першого поста теми (IPS: data-role='commentContent'); у кількох темах автор продовжує правила наступними постами — їх теж */
function postText(h) {
  const author = (h.match(/data-commentID="\d+"[^>]*data-quoteData='[^']*?&quot;username&quot;:&quot;([^&]*)&quot;/) || [])[1];
  const parts = h.split(/(?=<div id='comment-\d+_wrap')/).slice(1);
  const own = parts.filter((p, i) => i === 0 || (author && p.includes(`&quot;username&quot;:&quot;${author}&quot;`)));
  return own.map(p => {
    const c = (p.split("data-role='commentContent'")[1] || '').split(/cPostShareMenu|<\/article>/)[0];
    return ent(c.replace(/^[^>]*>/, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/(p|div|li|h\d|tr)>/g, '\n').replace(/<[^>]+>/g, ''));
  }).join('\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && l !== '•' && !/^<div/.test(l) && !/^\d{1,2}$/.test(l));   // «3» — номери картинок, не текст
}

/* пункти: «1.4 Заборонено…» — окремо; заголовок розділу («2. Основні поняття») — в h; решта абзаців — шматками до ~700 символів */
const PUNKT = /^(\d+(?:\.\d+)+)\.?\s+/, HEAD = /^\d+\.\s+\S.{0,80}$/;
function chunks(lines) {
  const out = []; let head = '', cur = null;
  const flush = () => { if (cur && cur.s.trim()) out.push({ ...cur, s: cur.s.trim() }); cur = null; };
  for (const l of lines) {
    const m = l.match(PUNKT);
    if (m) { flush(); cur = { n: m[1], h: head, s: l.slice(m[0].length) }; continue; }
    if (HEAD.test(l) && !PUNKT.test(l)) { flush(); head = l.replace(/^\d+\.\s+/, '').replace(/:$/, ''); continue; }
    if (!cur || (!cur.n && cur.s.length > 700)) { flush(); cur = { n: '', h: head, s: '' }; }
    cur.s += (cur.s ? '\n' : '') + l;
  }
  flush();
  return out;
}

const topics = [];
const root = await get(ROOT);
/* корінь — останнім: його теми закріплені з підрозділів, а розділ у них має бути справжній */
const forums = [...links(root, 'forum').filter(u => !/forum\/(9|10)-/.test(u)), ROOT];
for (const f of forums) {
  const h = f === ROOT ? root : await get(f + '/');
  const section = ent((h.match(/<h1[^>]*>([^<]+)</) || [])[1] || '').trim();
  for (const t of links(h, 'topic')) {
    if (topics.some(x => x.url === BASE + t + '/')) continue;
    const th = await get(t + '/');
    const title = ent((th.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/ - [^-]*$/, '').replace(' - ' + section, '').trim();
    const items = chunks(postText(th));
    topics.push({ title, section, url: BASE + t + '/', items });
    console.log(`${items.length.toString().padStart(4)}  ${section} / ${title}`);
  }
}
writeFileSync('src/data/rules.json', JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), topics }, null, 0) + '\n');
console.log(`Тем: ${topics.length}, пунктів: ${topics.reduce((s, t) => s + t.items.length, 0)} → src/data/rules.json`);
