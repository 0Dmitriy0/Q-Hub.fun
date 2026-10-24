/* Пошук по правилах сервера (src/data/rules.json, scripts/fetch-rules.mjs) — без ШІ, у плашці Alt+Q по Enter.
   Слова запиту зрізаються до основи («зеленій» → «зелен»), пункт підходить, коли якесь його слово з неї починається;
   рідкісні слова важать більше, пункт, де збіглися всі слова, — вище. Ці ж пункти йдуть помічнику по Shift+Enter. */
export interface RuleItem { n: string; h: string; s: string }
export interface RuleTopic { title: string; section: string; url: string; items: RuleItem[] }
export interface RuleHit { topic: string; url: string; n: string; s: string; score: number }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`ʼ]/g, '');
const words = (s: string) => norm(s).match(/[\p{L}\d]+/gu) ?? [];
/* службові слова, з яких складаються питання, а не правила */
const STOP = new Set('що як чи де коли хто чому таке такий така можна треба мені мене мій моя ми ви ти він вона воно вони це той та ті і й а але або на за по до від під над при про для без із зі з в у о не ні так якщо щоб бо же ж ли би б є буде було яка який які яке скільки правило правила пункт'.split(' '));
const stem = (w: string) => (w.length >= 7 ? w.slice(0, w.length - 3) : w.length >= 4 ? w.slice(0, Math.max(3, w.length - 2)) : w);
/* у правилах терміни латиницею (DM, PG…), а гравці пишуть як чують */
const ALIAS: Record<string, string[]> = {
  дм: ['dm'], пг: ['pg'], мг: ['mg'], рк: ['rk'], тк: ['tk'], нрд: ['nrd'], ск: ['sk'], дб: ['db'], зз: ['зелен'],
  метагеймінг: ['mg', 'metag'], павергеймінг: ['pg', 'powerg'], дезматч: ['dm', 'deathm'], ревендж: ['rk', 'reveng'],
  dm: ['дм'], pg: ['пг'], mg: ['мг'], rk: ['рк'], tk: ['тк'], деморган: ['demorg'], ганбан: ['gunban'], варн: ['warn'],
};

interface Doc { topic: RuleTopic; item: RuleItem; low: string; words: string[]; lead: string[]; head: string[] }
let cache: { src: RuleTopic[]; docs: Doc[] } | null = null;
function index(topics: RuleTopic[]) {
  if (cache?.src === topics) return cache.docs;
  const docs = topics.flatMap(topic => topic.items.map(item => ({ topic, item, low: norm(item.s), words: [...new Set(words(item.s))], lead: words(item.s).slice(0, 4), head: words(`${topic.title} ${item.h}`) })));
  cache = { src: topics, docs };
  return docs;
}

export function searchRules(topics: RuleTopic[], q: string, limit = 8): RuleHit[] {
  /* слово запиту — група варіантів: основа й відповідники з ALIAS */
  const seen = new Set<string>();
  const terms = words(q).filter(w => !STOP.has(w) && !seen.has(w) && seen.add(w)).map(w => [stem(w), ...(ALIAS[w] ?? [])]);
  if (!terms.length) return [];
  const docs = index(topics);
  const has = (ws: string[], t: string[]) => ws.some(w => t.some(x => w.startsWith(x)));
  const idf = terms.map(t => Math.log(1 + docs.length / (1 + docs.filter(d => has(d.words, t)).length)));
  const defs = terms.map(t => new RegExp(`(^|[^\\p{L}])(${t.join('|')})\\p{L}* \\(`, 'u'));
  const hits: RuleHit[] = [];
  for (const d of docs) {
    let score = 0, got = 0;
    terms.forEach((t, i) => {
      const inText = has(d.words, t), inHead = has(d.head, t);
      /* слово на початку пункту («Заборонено DM…») чи з розшифровкою («DM (DeathMatch)») — пункт саме про нього */
      const about = (has(d.lead, t) ? 0.5 : 0) + (defs[i].test(d.low) ? 0.5 : 0);
      if (inText || inHead) { got++; score += idf[i] * ((inText ? 1 : 0.6) + (inHead ? 0.4 : 0) + about); }
    });
    if (!got || !terms.some((t, i) => has(d.words, t) && idf[i] > 0)) continue;
    score *= got / terms.length * (d.item.n ? 1 : 0.75);   // збіглися всі слова — пункт угорі; вступ без номера — нижче пунктів
    hits.push({ topic: d.topic.title, url: d.topic.url, n: d.item.n, s: d.item.s, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.s.length - b.s.length).slice(0, limit);
}

/* знайдені пункти — текстом для помічника: «[Правила Зелених Зон, п. 1.2] …», не довше max символів */
export function rulesExcerpt(hits: RuleHit[], max = 6000): string {
  let out = '';
  for (const h of hits) {
    const line = `[${h.topic}${h.n ? `, п. ${h.n}` : ''}] ${h.s.replace(/\s*\n\s*/g, ' ')}\n`;
    if (out.length + line.length > max) break;
    out += line;
  }
  return out.trim();
}
