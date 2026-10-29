/* Розбір тем форуму QuantRP (IPS) на пункти правил і статті законів (specs/010). Без залежностей середовища:
   той самий модуль бере функція rules-sync (Deno) і scripts/fetch-rules.mjs (Node) для вбудованої копії в програмі */
export type Kind = 'rules' | 'law' | 'order';
export interface Item { n: string; h: string; s: string }
export interface Topic { title: string; section: string; url: string; kind: Kind; items: Item[] }

export const FORUM = 'https://forum.quant5.com.ua/';

export const ent = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

/* посилання на розділи (kind = 'forum') чи теми ('topic') на сторінці форуму — відносні, без повторів */
export const links = (h: string, kind: 'forum' | 'topic') => [...new Set([...h.matchAll(new RegExp(`index\\.php\\?/${kind}/(\\d+)-[^"'/]*`, 'g'))].map(m => m[0]))];
/* номер розділу чи теми з адреси: «index.php?/topic/153-…» → 153 */
export const numOf = (u: string) => Number((u.match(/\/(?:forum|topic)\/(\d+)/) || [])[1] || 0);
export const pageTitle = (h: string) => ent((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
export const heading = (h: string) => ent((h.match(/<h1[^>]*>([^<]+)</) || [])[1] || '').trim();

/* текст першого поста теми (IPS: data-role='commentContent'); у кількох темах автор продовжує правила наступними постами — їх теж */
export function postText(h: string): string[] {
  const author = (h.match(/data-commentID="\d+"[^>]*data-quoteData='[^']*?&quot;username&quot;:&quot;([^&]*)&quot;/) || [])[1];
  const parts = h.split(/(?=<div id='comment-\d+_wrap')/).slice(1);
  const own = parts.filter((p, i) => i === 0 || (author && p.includes(`&quot;username&quot;:&quot;${author}&quot;`)));
  return own.map(p => {
    const c = (p.split("data-role='commentContent'")[1] || '').split(/cPostShareMenu|<\/article>/)[0];
    return ent(c.replace(/^[^>]*>/, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/(p|div|li|h\d|tr)>/g, '\n').replace(/<[^>]+>/g, ''));
  }).join('\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && l !== '•' && !/^<div/.test(l) && !/^\d{1,2}$/.test(l));   // «3» — номери картинок, не текст
}

/* пункти: «1.4 Заборонено…», «6.5 [Р] Викрадення…» — окремо, рядки під ними («Покарання: штраф $20 000») — у пункт;
   заголовок («2. Основні поняття», «Стаття 6. Злочини проти власності», «РОЗДІЛ 2. …», «Розділ I. …») — у h;
   решта абзаців — шматками до ~700 символів */
const PUNKT = /^(\d+(?:\.\d+)+)\.?\s+/, HEAD = /^\d+\.\s+\S.{0,80}$/;
const LAW_HEAD = /^(Стаття|СТАТТЯ|Розділ|РОЗДІЛ|Глава|ГЛАВА|Частина|ЧАСТИНА)\s+[\dIVXLC]+\.?(\s+\S.{0,110})?$/;
export function chunks(lines: string[]): Item[] {
  const out: Item[] = []; let head = '', cur: Item | null = null;
  const flush = () => { if (cur && cur.s.trim()) out.push({ ...cur, s: cur.s.trim() }); cur = null; };
  for (const l of lines) {
    const m = l.match(PUNKT);
    if (m) { flush(); cur = { n: m[1], h: head, s: l.slice(m[0].length) }; continue; }
    if (LAW_HEAD.test(l)) { flush(); head = l.replace(/:$/, ''); continue; }
    if (HEAD.test(l)) { flush(); head = l.replace(/^\d+\.\s+/, '').replace(/:$/, ''); continue; }
    if (!cur || (!cur.n && cur.s.length > 700)) { flush(); cur = { n: '', h: head, s: '' }; }
    cur.s += (cur.s ? '\n' : '') + l;
  }
  flush();
  return out;
}

/* назва теми: «Кримінальний кодекс штату Quant - Законодавча база Штату - QuantRP» → без розділу й сайту */
export const topicTitle = (h: string, section: string) => pageTitle(h).replace(/ - [^-]*$/, '').replace(' - ' + section, '').trim();

/* підрозділи розділу — рядки списку (ipsDataItem_title), а не «хлібні крихти», де теж є посилання на розділи */
export const subforums = (h: string) => [...new Set([...h.matchAll(/ipsDataItem_title[^>]*>\s*<a href=["'][^"']*?(index\.php\?\/forum\/\d+-[^"'/]*)/g)].map(m => m[1]))];
/* скільки сторінок у списку тем розділу: IPS дає по 25 тем на сторінку */
export const pages = (h: string) => Math.max(1, ...[...h.matchAll(/index\.php\?\/forum\/\d+-[^"'/]*\/page\/(\d+)/g)].map(m => Number(m[1])));

export type Get = (path: string) => Promise<string>;
/* теми розділу з підрозділами й усіма сторінками; спершу підрозділи — їхні теми розділ показує ще й «останнім повідомленням»,
   а розділ у теми має бути справжній */
export async function forumTopics(get: Get, url: string, seen = new Set<string>()): Promise<{ url: string; section: string }[]> {
  const base = url.replace(/\/+$/, '') + '/';
  const h = await get(base), section = heading(h), out: { url: string; section: string }[] = [];
  for (const f of subforums(h)) if (!seen.has(f)) { seen.add(f); out.push(...await forumTopics(get, f, seen)); }
  const all = [h];
  for (let p = 2; p <= pages(h); p++) all.push(await get(`${base}page/${p}/`));
  for (const ph of all) for (const t of links(ph, 'topic')) if (!out.some(o => o.url === t)) out.push({ url: t, section });
  return out;
}
/* тема → пункти */
export async function readTopic(get: Get, url: string, section: string, kind: Kind): Promise<Topic> {
  const th = await get(url.replace(/\/+$/, '') + '/');
  return { title: topicTitle(th, section), section, url: FORUM + url.replace(/^https:\/\/forum\.quant5\.com\.ua\//, '').replace(/\/+$/, '') + '/', kind, items: chunks(postText(th)) };
}

/* джерела за замовчуванням (FR-001, FR-002): правила сервера й закони штату; накази організацій адмін додає сам */
export const DEFAULT_SOURCES: { url: string; kind: Kind }[] = [
  { url: 'index.php?/forum/10-правила-серверу', kind: 'rules' },
  { url: 'index.php?/forum/36-законодавча-база-штату', kind: 'law' },
];
