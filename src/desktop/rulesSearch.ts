/* Пошук по правилах сервера й законах штату (знімок rules-sync або вбудована src/data/rules.json, specs/010) — без ШІ, у плашці Alt+Q по Enter.
   Слова запиту зрізаються до основи («зеленій» → «зелен»), пункт підходить, коли якесь його слово з неї починається;
   рідкісні слова важать більше, пункт, де збіглися всі слова, — вище. Ці ж пункти йдуть помічнику по Shift+Enter. */
export type RuleKind = 'rules' | 'law' | 'order' | 'info';
export interface RuleItem { n: string; h: string; s: string }
/* kind немає в старій вбудованій копії — тоді це правила сервера */
export interface RuleTopic { title: string; section: string; url: string; kind?: RuleKind; items: RuleItem[] }
export interface RuleHit { topic: string; url: string; kind: RuleKind; n: string; h: string; s: string; score: number }
/* правила сервера карає адміністрація, закони штату — гра (FR-003, FR-006); довідка (F.A.Q.) — пояснення, не заборона */
export const KIND: Record<RuleKind, string> = { rules: 'Правила сервера', law: 'Закон штату', order: 'Наказ організації', info: 'Довідка' };
/* номер пункту: у законах — стаття, у правилах — пункт */
export const numLabel = (kind: RuleKind, n: string) => (n ? `${kind === 'rules' || kind === 'info' ? 'п.' : 'ст.'} ${n}` : '');

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`ʼ]/g, '');
const words = (s: string) => norm(s).match(/[\p{L}\d]+/gu) ?? [];
/* службові слова, з яких складаються питання, а не правила */
const STOP = new Set('що як чи де коли хто чому таке такий така можна треба мені мене мій моя ми ви ти він вона воно вони це той та ті і й а але або на за по до від під над при про для без із зі з в у о не ні так якщо щоб бо же ж ли би б є буде було яка який які яке скільки правило правила пункт має мають може можуть потрібно потрібна потрібен потрібні'.split(' '));
const stem = (w: string) => (w.length >= 7 ? w.slice(0, w.length - 3) : w.length >= 4 ? w.slice(0, Math.max(3, w.length - 2)) : w);
/* у правилах терміни латиницею (DM, PG…), а гравці пишуть як чують */
const ALIAS: Record<string, string[]> = {
  дм: ['dm'], пг: ['pg'], мг: ['mg'], рк: ['rk'], нрд: ['nrd'], ск: ['sk'], дб: ['db'], зз: ['зелен'],
  метагеймінг: ['mg', 'metag'], павергеймінг: ['pg', 'powerg'], дезматч: ['dm', 'deathm'], ревендж: ['rk', 'reveng'],
  dm: ['дм'], pg: ['пг'], mg: ['мг'], rk: ['рк'], tk: ['тк'], деморган: ['demorg'], ганбан: ['gunban'], варн: ['warn'],
  /* розмовні назви кодексів (FR-008): шукають і в назві документа */
  кк: ['кримінальн'], ак: ['адміністративн'], пдр: ['дорожн'], дк: ['дорожн'], пк: ['процесуальн'], тк: ['tk', 'трудов'],
};
/* сленг гравців — за початком слова, у будь-якому відмінку («капті», «машиною», «мстити») */
const SLANG: [string, string[]][] = [
  ['капт', ['захоплен']], ['мст', ['помст', 'revenge', 'rk']], ['помст', ['revenge', 'rk']],
  ['машин', ['транспорт', 'т/с', 'автомоб']], ['тачк', ['транспорт', 'т/с', 'автомоб']], ['авто', ['транспорт', 'т/с']],
  ['нацгвард', ['ng', 'national', 'національн']], ['поновл', ['відновл']], ['бізвар', ['бізнес']],
  /* «забити бізвар / капт» — запланувати війну; «стріляти з машини» — DriveBy */
  ['забит', ['заплан']], ['забив', ['заплан']], ['стріля', ['стрільб', 'db', 'driveby']],
  /* питання ШІ, на які він «не знав» (історія 2026-11-14): угон — викрадення, каф — наручники, арешт — затримання */
  ['угон', ['викрад']], ['угн', ['викрад']], ['каф', ['наручн', 'затрим']], ['арешт', ['затрим', 'адвокат']], ['заарешт', ['затрим']], ['зірк', ['розшук']],
];
const PREFIX = ['по', 'за', 'роз', 'ви', 'пере', 'від', 'при', 'на', 'у', 'в'];
const slang = (w: string) => SLANG.filter(([p]) => w.startsWith(p)).flatMap(([, v]) => v);
/* «покарання за вбивство»: у законах пишуть «Карається…» — слово не шукаємо, а закони піднімаємо */
const PENALTY = /^(покаран|покарат|караєт|карают)/;
/* «скільки», «коли», «о котрій» — відповідь з числом: пункти з цифрами трохи вище */
const NUMQ = /(^|\s)(скільки|коли|котрій|кількість|термін)(\s|$)/u, QTY = /кількіст|мінімальн|максимальн|не більше|не менше|щонайменше/;

/* скорочення назви документа за першими літерами: «Загальні правила» → ЗП, «Кримінальний кодекс штату Quant» → КК,
   «Загальні правила Кримінальних структур» → ЗПКС і ПКС, «Закон "Про федеральне бюро розслідувань" [FIB]» → ФБР і FIB.
   Службові слова й «штату Quant» не рахуються; перше «Загальні», «Правила» можна пропустити, «Закон» — пропускається завжди;
   слова великими (FIB, ВЗГ) — самі скорочення. Нові документи з rules-sync отримують скорочення самі, вписувати нічого не треба */
const ABBR_SKIP = new Set('штату штат quant про та і й для в у на за з із міста округу'.split(' '));
const ABBR_LEAD = new Set(['загальні', 'загальна', 'правила', 'закон']);
export function abbrsOf(title: string): string[] {
  const ws = words(title.replace(/\[[^\]]*\]/g, ' ')).filter(w => !ABBR_SKIP.has(w));
  const init = (a: string[]) => a.map(w => w[0]).join('');
  /* «Закон про …» з «З» на початку не скорочують — інакше «ЗП» Загальних правил збігається з «Законом про Прокуратуру» */
  const out = ws[0] === 'закон' ? [] : [init(ws)];
  for (let i = 0; i < ws.length - 1 && ABBR_LEAD.has(ws[i]); i++) out.push(init(ws.slice(i + 1)));
  for (const w of title.match(/[\p{L}]+/gu) ?? []) if (w.length >= 2 && w === w.toUpperCase() && w !== w.toLowerCase()) out.push(norm(w));
  return [...new Set(out.filter(a => a.length >= 2))];
}
/* скорочення → документи. Скорочення розділу («ПКО» — Правила кримінальних організацій) — лише коли жоден документ так не скорочується */
function abbrIndex(topics: RuleTopic[]) {
  const own = new Map<string, Set<RuleTopic>>(), sec = new Map<string, Set<RuleTopic>>();
  const add = (m: Map<string, Set<RuleTopic>>, a: string, t: RuleTopic) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(t); };
  for (const t of topics) { for (const a of abbrsOf(t.title)) add(own, a, t); for (const a of abbrsOf(t.section)) add(sec, a, t); }
  for (const [a, ts] of sec) if (!own.has(a)) own.set(a, ts);
  return own;
}

interface Doc { topic: RuleTopic; item: RuleItem; low: string; words: string[]; lead: string[]; head: string[] }
let cache: { src: RuleTopic[]; docs: Doc[]; vocab: string[]; abbr: Map<string, Set<RuleTopic>> } | null = null;
function index(topics: RuleTopic[]) {
  if (cache?.src === topics) return cache;
  const docs = topics.flatMap(topic => topic.items.map(item => ({ topic, item, low: norm(item.s), words: [...new Set(words(item.s))], lead: words(item.s).slice(0, 4), head: words(`${topic.title} ${item.h}`) })));
  /* усі різні слова бази: збіг слова запиту рахується по них один раз, а не в кожному пункті (SC-006) */
  const vocab = [...new Set(docs.flatMap(d => [...d.words, ...d.head]))];
  cache = { src: topics, docs, vocab, abbr: abbrIndex(topics) };
  return cache;
}

const LOOKALIKE: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };

/* ---------- нормалізація запиту (specs/092) ----------
   Роздільник між двома цифрами — крапка: «3/3», «3,3», «3-3», «3 3», а також «3ю3», «3б3» (клавіші «.» і «,», коли не перемкнули
   розкладку). Не між цифрами («кк/пдр», «зелена-зона») — не чіпається, щоб не з'явилось хибних збігів */
export const QUERY_SEP = /(\d)(?:\s*[/\\,\-_.юб]\s*|\s+)(?=\d)/g;
export function normalizeQuery(query: string): string {
  let q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== q;) { prev = q; q = q.replace(QUERY_SEP, '$1.'); }
  return q;
}

/* розкладки Windows: та сама клавіша в англійській (США), українській і російській */
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const UA_KEYS = "йцукенгшщзхїфівапролджєячсмитьбю'";
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const pairs = (from: string, to: string) => Object.freeze(Object.fromEntries([...from].map((k, i) => [k, to[i]]))) as Readonly<Record<string, string>>;
export const LAYOUT_UA = pairs(EN_KEYS, UA_KEYS);
export const LAYOUT_RU = pairs(EN_KEYS, RU_KEYS);
/* правила українською: російський варіант після переведення зводимо до українських літер, інакше він нічого б не знайшов */
export const RU_TO_UA: Readonly<Record<string, string>> = Object.freeze({ ы: 'и', э: 'е', ё: 'е', ъ: '' });
/* кирилиця → латинська клавіша (з обох розкладок) */
const TO_EN: Readonly<Record<string, string>> = Object.freeze({ ...pairs(RU_KEYS, EN_KEYS), ...pairs(UA_KEYS, EN_KEYS) });
/* з Shift розділові клавіші дають інші символи: «:» — та сама клавіша, що «;» (ж) */
const SHIFTED: Record<string, string> = { '{': '[', '}': ']', ':': ';', '"': "'", '<': ',', '>': '.', '~': '`' };

/* слово, набране не в тій розкладці, — за розташуванням клавіш; регістр не важить */
export function toLayout(word: string, to: 'ua' | 'ru' | 'en'): string {
  const w = [...word.toLowerCase()].map(c => SHIFTED[c] ?? c);
  if (to === 'en') return w.map(c => TO_EN[c] ?? c).join('');
  const table = to === 'ua' ? LAYOUT_UA : LAYOUT_RU;
  const out = w.map(c => table[c] ?? c).join('');
  return to === 'ru' ? [...out].map(c => RU_TO_UA[c] ?? c).join('') : out;
}

/* латинське слово (разом з клавішами, що дають кириличні літери: ; ' [ ] , . `) або кириличне */
const LAYOUT_TOKEN = /[a-z;'[\]{}:"<>~,.`]+|[\p{Script=Cyrillic}']+/gu;

/* виправлені запити: слова, яких як набрано немає (known), переведено в іншу розкладку; цифри й відомі слова — без змін.
   До двох варіантів — український, потім російський — без дублів і без збігу з набраним */
export function layoutVariants(query: string, known: (w: string) => boolean): string[] {
  const base = normalizeQuery(query);
  const out: string[] = [];
  for (const to of ['ua', 'ru'] as const) {
    const v = normalizeQuery(base.replace(LAYOUT_TOKEN, tok => {
      if (/\p{Script=Cyrillic}/u.test(tok)) return known(tok) ? tok : toLayout(tok, 'en');
      /* кома й крапка на краях — розділові знаки, не літери «б» і «ю» */
      const [, lead, core, trail] = /^([,.]*)(.*?)([,.]*)$/.exec(tok)!;
      if (!/[a-z]/.test(core) || known(core)) return tok;
      return lead + toLayout(core, to) + trail;
    }));
    if (v !== base && !out.includes(v)) out.push(v);
  }
  return out;
}

/* ---------- глосарій RP-термінів (specs/093) ----------
   Терміни — дані (таблиця glossary_terms / src/data/glossary.json), пошук отримує їх параметром: так ця сама копія файлу
   працює й у функції помічника, яка не бачить файлів поза собою (там глосарію немає — лишається ALIAS вище). */
export interface GlossaryTerm { term: string; aliases: string[]; full_name: string; description: string; related_rules: string[] }
const termNames = (g: GlossaryTerm) => [g.term, ...g.aliases, g.full_name].map(n => words(n)).filter(ws => ws.length);
/* слово назви підходить слову запиту: коротке — лише точно («дм», «варн»), довге — за основою («метагеймінгу») */
const nameWordFits = (qw: string, nw: string) => qw === nw || (nw.length >= 4 && stem(qw).startsWith(stem(nw)));
/* терміни в словах запиту: однослівна назва — окреме слово, багатослівна — ті слова підряд; слово з цифрою — ніколи не термін */
function glossarySpans(glossary: GlossaryTerm[], all: string[]) {
  const spans: { start: number; end: number; terms: GlossaryTerm[] }[] = [];
  for (let i = 0; i < all.length;) {
    let best = 0; let found: GlossaryTerm[] = [];
    if (!/\d/.test(all[i])) for (const g of glossary) for (const ws of termNames(g)) {
      if (ws.length < best || i + ws.length > all.length) continue;
      if (!ws.every((nw, k) => nameWordFits(all[i + k], nw))) continue;
      if (ws.length > best) { best = ws.length; found = []; }
      if (!found.includes(g)) found.push(g);
    }
    if (best) { spans.push({ start: i, end: i + best, terms: found }); i += best; } else i++;
  }
  return spans;
}
/* терміни запиту в порядку слів, без дублів — для карток над результатами */
export function glossaryMatches(glossary: GlossaryTerm[], query: string): GlossaryTerm[] {
  const out: GlossaryTerm[] = [];
  for (const s of glossarySpans(glossary, words(normalizeQuery(query)))) for (const g of s.terms) if (!out.includes(g)) out.push(g);
  return out;
}
/* картки над результатами: термін і чи є для нього пункти в правилах (немає — «Окремого пункту в правилах немає»).
   Спільне скорочення (ГМ — God Mode і Головний модератор) перевіряємо за повною назвою, а не за самим скороченням */
export function termCards(topics: RuleTopic[], glossary: GlossaryTerm[], query: string): { term: GlossaryTerm; empty: boolean }[] {
  return glossaryMatches(glossary, query).map(g => {
    const shared = glossary.filter(x => norm(x.term) === norm(g.term)).length > 1;
    const probe = shared && g.full_name ? g.full_name : g.term;
    const empty = !relatedHits(topics, g).length && !searchRules(topics, probe, 1, shared ? glossary : [g]).length;
    return { term: g, empty };
  });
}
/* пункти за related_rules терміну: «ЗП 6.9» — документ за скороченням назви + номер пункту; не знайдене — пропускається */
export function relatedHits(topics: RuleTopic[], g: GlossaryTerm): RuleHit[] {
  const { abbr } = index(topics);
  const out: RuleHit[] = [];
  for (const r of g.related_rules) {
    const m = /^(.+?)\s+(\d+(?:\.\d+)*)\.?$/.exec(r.trim());
    if (!m) continue;
    const ts = abbr.get(norm(m[1]).replace(/\s+/g, ''));
    for (const t of ts ?? []) for (const it of t.items) if (it.n === m[2] && !out.some(h => h.topic === t.title && h.n === it.n))
      out.push({ topic: t.title, url: t.url, kind: t.kind ?? 'rules', n: it.n, h: it.h, s: it.s, score: 0 });
  }
  return out;
}

/* слово відоме пошуку: службове, розмовна назва чи сленг, назва терміну глосарію, скорочення документа або є в тексті правил */
export function knownRuleWord(topics: RuleTopic[], w: string, glossary: GlossaryTerm[] = []): boolean {
  const x = norm(w);
  if (!x) return false;
  if (STOP.has(x) || ALIAS[x] || slang(x).length) return true;
  if (glossary.some(g => termNames(g).some(ws => ws.length === 1 && nameWordFits(x, ws[0])))) return true;
  const { vocab, abbr } = index(topics);
  if (abbr.has(x) || (/^[a-z]+$/.test(x) && abbr.has([...x].map(c => LOOKALIKE[c] ?? c).join('')))) return true;
  const s = stem(x);
  return s.length <= 2 ? vocab.includes(s) : vocab.some(v => v.startsWith(s));
}

/* шукати як набрано; нічого — по черзі виправлені варіанти (FR-004). shown — виправлений запит для підказки, null — показано набране */
export interface FixedSearch<T> { result: T; shown: string | null }
export function fixedSearch<T>(query: string, run: (q: string) => T, isEmpty: (r: T) => boolean, known: (w: string) => boolean): FixedSearch<T> {
  const first = run(query);
  if (!isEmpty(first)) return { result: first, shown: null };
  for (const v of layoutVariants(query, known)) {
    const r = run(v);
    if (!isEmpty(r)) return { result: r, shown: v };
  }
  return { result: first, shown: null };
}

export function searchRules(topics: RuleTopic[], query: string, limit = 8, glossary: GlossaryTerm[] = []): RuleHit[] {
  /* «10,10», «3/3», «3 3», «3ю3» — те саме, що «10.10», «3.3»: гравці пишуть номер як звикли (specs/092) */
  const q = normalizeQuery(query);
  /* номер пункту чи статті в запиті («КК 4.1», «10.10») — окремо: такий пункт угорі, а цифри не шукаються як слова.
     Запит із самих цифр — номер у будь-якому документі, і ціле число теж («5» — стаття 5); таких збігів буває багато */
  const onlyNums = /^[\d.\s]+$/.test(q.trim());
  const NUM = onlyNums ? /\d+(?:\.\d+)*/g : /\d+(?:\.\d+)+/g;
  const nums = new Set((q.match(NUM) ?? []).map(n => n.replace(/\.$/, '')));
  if (onlyNums) limit = Math.max(limit, 30);
  /* слово запиту — група варіантів: основа й відповідники з ALIAS */
  const seen = new Set<string>();
  const all = words(q.replace(NUM, ' '));
  const penalty = all.some(w => PENALTY.test(w)), numq = NUMQ.test(norm(q));
  /* термін глосарію (specs/093) — одна група: основи всіх його однослівних назв (+ ALIAS) і фрази з багатослівних
     («вбивство без причини» — пункт підходить, коли в ньому є всі слова фрази за основою) */
  const spans = glossarySpans(glossary, all);
  /* спільне скорочення двох термінів (ТК, ГМ) розширюємо, лише коли гравець набрав саме його: «god mode» — не «ГМ» модератора */
  const termCount = new Map<string, number>();
  for (const g of glossary) { const k = norm(g.term); termCount.set(k, (termCount.get(k) ?? 0) + 1); }
  const qw: string[] = [], terms: string[][] = [], phrases: string[][][] = [], gterms: GlossaryTerm[] = [];
  for (let i = 0; i < all.length; i++) {
    const sp = spans.find(s => s.start === i);
    if (sp) {
      const key = all.slice(sp.start, sp.end).join(' ');
      i = sp.end - 1;
      if (seen.has(key)) continue;
      seen.add(key);
      const names = sp.terms.flatMap(termNames);
      qw.push(all[sp.start]);
      const typed = all[sp.start];
      terms.push([...new Set(names.filter(ws => ws.length === 1 && ((termCount.get(ws[0]) ?? 0) < 2 || ws[0] === typed))
        .flatMap(ws => [stem(ws[0]!), ...(ALIAS[ws[0]!] ?? [])]))]);
      phrases.push(names.filter(ws => ws.length > 1).map(ws => ws.filter(w => !STOP.has(w)).map(stem)).filter(ph => ph.length));
      gterms.push(...sp.terms);
      continue;
    }
    const w = all[i];
    if (STOP.has(w) || PENALTY.test(w) || seen.has(w)) continue;
    seen.add(w);
    qw.push(w); terms.push([stem(w), ...(ALIAS[w] ?? []), ...slang(w)]); phrases.push([]);
  }
  if (!terms.length && !nums.size) return [];
  const { docs, vocab, abbr } = index(topics);
  /* слово запиту — скорочення документа («ЗП», «ПКС»): пункти цього документа рахуються так, ніби слово є в назві */
  /* «KK», «PKC» латиницею (не та розкладка, однакові на вигляд літери) — те саме скорочення */
  const abbrOf = qw.map(w => abbr.get(w) ?? (/^[a-z]+$/.test(w) ? abbr.get([...w].map(c => LOOKALIKE[c] ?? c).join('')) : undefined));
  /* слово в назві документа; для скорочення — лише сам документ («КК вбивство» — не «Правила … Кримінальних Структур») */
  const inHeadOf = (d: Doc, i: number) => (abbrOf[i] ? abbrOf[i].has(d.topic) : has(d.head, i));
  /* «грабувати» — і «пограбування», «почати» — і «розпочати»: основа після префікса (від 4 літер — інакше шуму забагато) */
  /* 1–2 літери — лише ціле слово: «pp» не має знаходити «PPC», «дм» — «дмитро» (specs/093) */
  const fits = (w: string, t: string[]) => t.some(x => (x.length <= 2 ? w === x : w.startsWith(x)) || (x.length >= 4 && PREFIX.some(p => w.startsWith(p + x))));
  const match = terms.map(t => new Set(vocab.filter(w => fits(w, t))));
  /* фраза терміну: для кожного її слова — свої збіги словника; пункт підходить, коли є всі слова фрази */
  const phraseMatch = phrases.map(ps => ps.map(ph => ph.map(st => new Set(vocab.filter(w => fits(w, [st]))))));
  const has = (ws: string[], i: number) => ws.some(w => match[i].has(w)) || phraseMatch[i].some(ph => ph.every(set => ws.some(w => set.has(w))));
  const idf = terms.map((_, i) => Math.log(1 + docs.length / (1 + docs.filter(d => has(d.words, i)).length)));
  const defs = terms.map(t => new RegExp(`(^|[^\\p{L}])(${t.join('|')})\\p{L}* \\(`, 'u'));
  /* «без ліцензії», «без маски»: «без» — службове, але заперечення важливе — пункт, де так і написано, вище */
  const without = [...norm(q).matchAll(/(?:^|\s)без\s+(\p{L}+)/gu)].map(m => new RegExp(`(^|[^\\p{L}])без ${stem(m[1])}`, 'u'));
  /* «скільки учасників»: пункт «кількість учасників» відповідає прямо — вище за будь-який пункт з цифрами */
  const qtyOf = numq && terms.length ? new RegExp(`(кількіст|мінімальн|максимальн)\\p{L}* (${terms.flat().join('|')})`, 'u') : null;
  const hits: RuleHit[] = [];
  /* «6.7 КК»: стаття з цим номером знайшлася — лише вона (і такі ж номери, що підходять під решту слів), інші статті кодексу не потрібні */
  const exact = new Set<RuleHit>();
  for (const d of docs) {
    let score = 0, got = 0;
    terms.forEach((_, i) => {
      const inText = has(d.words, i), inHead = inHeadOf(d, i);
      /* слово на початку пункту («Заборонено DM…») чи з розшифровкою («DM (DeathMatch)») — пункт саме про нього */
      const about = (has(d.lead, i) ? 0.5 : 0) + (inText && defs[i].test(d.low) ? 0.5 : 0);
      if (inText || inHead) { got++; score += idf[i] * ((inText ? 1 : 0.6) + (inHead ? 0.4 : 0) + about); }
    });
    const num = nums.has(d.item.n);
    /* «КК 4.1»: стаття з таким номером; кодекс названо в назві документа — вище, ніж лише згадано в тексті */
    const isExact = num && got === terms.length;
    if (isExact) score += terms.every((_, i) => inHeadOf(d, i)) ? 10 : 4;
    else if (!got || !terms.some((_, i) => has(d.words, i) && idf[i] > 0)) continue;
    else score *= got / terms.length * (d.item.n || d.topic.kind === 'info' ? 1 : 0.75);   // збіглися всі слова — пункт угорі; вступ без номера — нижче пунктів (у довідці номерів немає взагалі)
    if (penalty && d.topic.kind === 'law') score *= 1.5;
    if (numq && /\d/.test(d.item.s)) score *= qtyOf?.test(d.low) ? 2 : QTY.test(d.low) ? 1.6 : 1.3;
    if (without.some(re => re.test(d.low))) score *= 1.5;
    const hit: RuleHit = { topic: d.topic.title, url: d.topic.url, kind: d.topic.kind ?? 'rules', n: d.item.n, h: d.item.h, s: d.item.s, score };
    hits.push(hit);
    if (isExact) exact.add(hit);
  }
  /* specs/093: пов'язані пункти термінів (related_rules) — першими, навіть якщо жодної з назв у них немає */
  if (!exact.size && gterms.length) {
    const top = hits.reduce((m, h) => Math.max(m, h.score), 0);
    for (const g of gterms) for (const r of relatedHits(topics, g)) {
      const h = hits.find(x => x.topic === r.topic && x.n === r.n);
      if (h) h.score += top + 1; else hits.push({ ...r, score: top + 1 });
    }
  }
  if (exact.size) return [...exact].sort((a, b) => b.score - a.score || a.s.length - b.s.length).slice(0, limit);
  /* лише скорочення («ПКС») і нічого не знайшлося — початок документа по порядку */
  if (!hits.length && !nums.size && abbrOf.every(Boolean))
    return docs.filter(d => abbrOf.every(s => s!.has(d.topic))).slice(0, limit)
      .map(d => ({ topic: d.topic.title, url: d.topic.url, kind: d.topic.kind ?? 'rules', n: d.item.n, h: d.item.h, s: d.item.s, score: 0 }));
  return hits.sort((a, b) => b.score - a.score || a.s.length - b.s.length).slice(0, limit);
}

/* знайдені пункти — текстом для помічника: «[Правила сервера · Правила Зелених Зон, п. 1.2] …»,
   «[Закон штату · Кримінальний кодекс штату Quant, ст. 6.5] …» — не довше max символів */
export function rulesExcerpt(hits: RuleHit[], max = 6000): string {
  let out = '';
  for (const h of hits) {
    const line = `[${KIND[h.kind]} · ${h.topic}${h.n ? `, ${numLabel(h.kind, h.n)}` : ''}] ${h.s.replace(/\s*\n\s*/g, ' ')}\n`;
    if (out.length + line.length > max) break;
    out += line;
  }
  return out.trim();
}
