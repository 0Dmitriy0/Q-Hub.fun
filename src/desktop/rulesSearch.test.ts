import { describe, expect, it } from 'vitest';
import { abbrsOf, fixedSearch, glossaryMatches, knownRuleWord, layoutVariants, normalizeQuery, relatedHits, rulesExcerpt, searchRules, termCards, toLayout, type GlossaryTerm, type RuleTopic } from './rulesSearch';
import RULES from '../data/rules.json';
import GLOSSARY from '../data/glossary.json';

const topics: RuleTopic[] = [
  { title: 'Загальні правила', section: 'Загальні правила', url: 'u1', items: [
    { n: '6.9', h: '', s: 'Заборонено DM (DeathMatch) - вбивство/нанесення шкоди без вагомої IC причини. | Деморган 60 хвилин' },
    { n: '1.3', h: '', s: 'На учасників діють всі правила серверу. Виключення: DM, PG, TK, RK.' },
    { n: '6.7', h: '', s: 'Заборонено PG (PowerGaming) - відсутність страху за своє життя.' },
  ] },
  { title: 'Правила Зелених Зон', section: 'Загальні правила', url: 'u2', items: [
    { n: '1.1', h: '', s: 'Заборонено вбивство або заподіяння шкоди гравцям в ЗЗ (Зеленій Зоні).' },
    { n: '1.5', h: '', s: 'Заборонено вмикати музику в мікрофон.' },
  ] },
];
const first = (q: string) => searchRules(topics, q)[0];

describe('пошук по правилах', () => {
  it('порожньо й лише службові слова — нічого', () => {
    expect(searchRules(topics, '  ')).toEqual([]);
    expect(searchRules(topics, 'що таке')).toEqual([]);
  });
  it('інші відмінки — за основою слова', () => expect(first('чи можна вбивати в зеленій зоні')).toMatchObject({ topic: 'Правила Зелених Зон', n: '1.1' }));
  it('кирилицею про терміни латиницею, розшифровка — першою', () => {
    expect(first('що таке дм')).toMatchObject({ n: '6.9' });
    expect(first('ПГ')).toMatchObject({ n: '6.7' });
  });
  it('назва теми теж рахується', () => expect(first('зелені зони музика')).toMatchObject({ n: '1.5' }));
  it('нічого схожого — порожньо', () => expect(searchRules(topics, 'гелікоптер')).toEqual([]));
  it('уривок для помічника: тема й пункт, не довше межі', () => {
    const hits = searchRules(topics, 'вбивство');
    expect(rulesExcerpt(hits)).toContain('[Правила сервера · Правила Зелених Зон, п. 1.1]');
    expect(rulesExcerpt(hits, 120).length).toBeLessThanOrEqual(120);
  });
  it('справжні правила з форуму: DM знаходиться', () => {
    const t = (RULES as { topics: RuleTopic[] }).topics;
    expect(t.length).toBeGreaterThan(20);
    expect(searchRules(t, 'дм')[0].s).toMatch(/DM \(DeathMatch\)/);
  });
});

describe('закони штату в пошуку (specs/010)', () => {
  const t = (RULES as { topics: RuleTopic[] }).topics;
  const top = (q: string, n = 3) => searchRules(t, q).slice(0, n);
  it('у вбудованій копії — і правила сервера, і закони штату', () => {
    expect(t.filter(x => x.kind === 'law').length).toBeGreaterThanOrEqual(25);
    expect(t.filter(x => (x.kind ?? 'rules') === 'rules').length).toBeGreaterThanOrEqual(28);
  });
  it('«скільки дають за викрадення авто» — стаття 6.5 Кримінального кодексу серед перших 3, з типом', () => {
    const h = top('скільки дають за викрадення авто').find(x => /Кримінальний/.test(x.topic) && x.n === '6.5');
    expect(h).toMatchObject({ kind: 'law' });
  });
  it('«штраф за перевищення швидкості» — закон штату серед перших 3', () => {
    expect(top('штраф за перевищення швидкості').some(x => x.kind === 'law' && /Адміністративний|Дорожній/.test(x.topic))).toBe(true);
  });
  it('розмовні назви кодексів і номер статті: «КК 6.5», «ак штраф», «пдр обгін»', () => {
    expect(top('КК 6.5', 1)[0]).toMatchObject({ n: '6.5', kind: 'law' });
    expect(top('КК 6.5', 1)[0].topic).toMatch(/Кримінальний/);
    expect(top('ак штраф').some(x => /Адміністративний/.test(x.topic))).toBe(true);
    expect(top('пдр обгін').some(x => /Дорожній/.test(x.topic))).toBe(true);
  });
  it('скорочення назви за першими літерами: «ЗП 1.8», «1.1.1 ПКС», «КК вбивство», «ПКС»', () => {
    expect(abbrsOf('Загальні правила')).toEqual(['зп']);
    expect(abbrsOf('Загальні правила Кримінальних структур')).toEqual(expect.arrayContaining(['зпкс', 'пкс']));
    expect(abbrsOf('Кримінальний кодекс штату Quant')).toEqual(['кк']);
    expect(abbrsOf('Закон "Про федеральне бюро розслідувань" [FIB]')).toEqual(expect.arrayContaining(['фбр', 'fib']));
    expect(abbrsOf('Закон "Про Прокуратуру штату Quant"')).not.toContain('зп');   // інакше збігається із Загальними правилами
    expect(top('ЗП 1.8', 1)[0]).toMatchObject({ topic: 'Загальні правила', n: '1.8' });
    expect(top('1.8 КК', 1)[0]).toMatchObject({ n: '1.8', kind: 'law' });
    expect(top('1.8 КК', 1)[0].topic).toMatch(/Кримінальний/);
    expect(top('1.1.1 ПКС', 1)[0]).toMatchObject({ topic: 'Загальні правила Кримінальних структур', n: '1.1.1' });
    expect(top('КК вбивство').every(x => /Кримінальний кодекс/.test(x.topic))).toBe(true);
    expect(top('ПКС').every(x => x.topic === 'Загальні правила Кримінальних структур')).toBe(true);
    expect(top('тк', 1)[0].topic).toBe('Загальні правила');   // TK (Team Kill) — як і раніше, не лише Трудовий кодекс
  });
  it('самі цифри — номер пункту в правилах: «10.10», «10,10», «5», а не облік', () => {
    const ten = searchRules(t, '10.10');
    expect(ten.length).toBeGreaterThan(0);
    expect(ten.every(h => h.n === '10.10')).toBe(true);
    expect(ten[0].topic).toMatch(/Кримінальний/);
    expect(searchRules(t, '10,10').map(h => h.n)).toEqual(ten.map(h => h.n));
    expect(searchRules(t, '10.10.').map(h => h.n)).toEqual(ten.map(h => h.n));
    /* ціле число — стаття з таким номером у кожному документі, де вона є; їх більше за звичні 8 */
    const five = searchRules(t, '5');
    const all5 = (t as RuleTopic[]).reduce((n, x) => n + x.items.filter(i => i.n === '5').length, 0);
    expect(five.length).toBe(Math.min(all5, 30));
    expect(five.every(h => h.n === '5')).toBe(true);
    /* число серед слів, як і раніше, — слово запиту, а номер з крапкою — номер */
    expect(searchRules(t, 'КК 10.10', 1)[0]).toMatchObject({ n: '10.10' });
  });
  it('номер + документ («6.7 КК», «КК 6.7», латиницею «6.7 KK») — лише ця стаття, без інших статей кодексу', () => {
    for (const q of ['6.7 КК', 'КК 6.7', '6.7 KK', '6,7 кк']) {
      const h = searchRules(t, q);
      expect(h.length, q).toBe(1);
      expect(h[0], q).toMatchObject({ n: '6.7', kind: 'law' });
      expect(h[0].topic, q).toMatch(/Кримінальний/);
    }
    /* номер є, але слово не з цієї статті — звичайний пошук, а не порожньо */
    expect(searchRules(t, '6.7 риба').length).toBeGreaterThan(0);
  });
  it('уривок для помічника: тип джерела й «ст.» у законах', () => {
    const hits = searchRules(t, 'КК 6.5', 1);
    expect(rulesExcerpt(hits)).toMatch(/^\[Закон штату · Кримінальний кодекс штату Quant, ст\. 6\.5\]/);
  });
  it('як питають гравці: сленг, префікси, «покарання», «скільки»', () => {
    const own: RuleTopic[] = [
      { title: 'Пограбування', section: 'С', url: 'a', kind: 'rules', items: [
        { n: '1.1', h: '', s: 'Заборонено пограбування на території лікарні.' },
        { n: '1.2', h: '', s: 'Заборонено RK (Revenge kill) - повернення задля помсти.' },
        { n: '1.3', h: '', s: 'Заборонено вбивство в зеленій зоні.' },
        { n: '1.4', h: '', s: 'Учасники захоплення мають бути в голосовому каналі.' },
        { n: '1.5', h: '', s: 'Мінімальна кількість учасників захоплення - 5.' },
      ] },
      { title: 'Кримінальний кодекс', section: 'З', url: 'b', kind: 'law', items: [
        { n: '4.1', h: '', s: '[Р] Вбивство, тобто умисне заподіяння смерті. Карається позбавленням волі.' },
      ] },
    ];
    const one = (q: string) => searchRules(own, q)[0]?.n;
    expect(one('чи можна грабувати біля лікарні')).toBe('1.1');
    expect(one('можна мстити')).toBe('1.2');
    expect(one('покарання за вбивство')).toBe('4.1');
    expect(one('скільки учасників на капті')).toBe('1.5');
  });
  it('стара копія без kind — правила сервера', () => {
    expect(searchRules([{ title: 'Т', section: 'С', url: 'u', items: [{ n: '1.1', h: '', s: 'Заборонено DM.' }] }], 'дм')[0].kind).toBe('rules');
  });
  /* SC-002, правки 2026-10-30 */
  const more: RuleTopic[] = [
    { title: 'Дорожній кодекс', section: 'Закони', url: 'd', kind: 'law', items: [
      { n: '1.11', h: '', s: 'Усі перехрестя в штаті є нерегульованими, перевагу має транспорт праворуч.' },
      { n: '3.2', h: '', s: 'Перевірка документів водія проводиться на вимогу офіцера, водій має право знати причину.' },
    ] },
    { title: 'Війна за бізнес', section: 'Правила', url: 'b', items: [
      { n: '1.8.1', h: '', s: 'Запланувати захоплення бізнесу можна не пізніше ніж за 30 хвилин до початку.' },
      { n: '1.8.3', h: '', s: 'Після початку війни обидві сторони отримують захист від атаки на 30 хвилин.' },
    ] },
    { title: 'Захоплення Територій', section: 'Правила', url: 't', items: [
      { n: '1.4', h: '', s: 'Мінімальна кількість учасників на івенті - 5, максимальна - 15.' },
      { n: '1.11', h: '', s: 'Учасники захоплення території повинні мати відеозапис дій на івенті якістю 720Р, 120 хвилин.' },
    ] },
    { title: 'Закон про полювання та рибальство', section: 'Закони', url: 'p', kind: 'law', items: [
      { n: '6', h: '', s: 'Дозволяється аматорське рибальство. Вилов риби без ліцензії дозволений лише на міських пірсах.' },
      { n: '7.2', h: '', s: 'Рибальство з ліцензією дозволено на всіх водних територіях штату, ліцензія — в Уряді.' },
    ] },
  ];
  const best = (q: string) => searchRules(more, q)[0];
  it('довідка (F.A.Q.): мітка «Довідка», без номерів — не нижче за вступ правил', () => {
    const faq: RuleTopic[] = [
      { title: 'Загальні правила', section: 'П', url: 'r', kind: 'rules', items: [{ n: '', h: '', s: 'Вступ: робота на сервері регулюється цими правилами.' }] },
      { title: '[F.A.Q.] Роботи на сервері', section: 'Новини та інформація', url: 'f', kind: 'info', items: [{ n: '', h: '', s: 'Робота таксиста: телефон, GPS, роботи, таксі.' }] },
    ];
    const h = searchRules(faq, 'робота таксиста')[0];
    expect(h).toMatchObject({ kind: 'info', topic: '[F.A.Q.] Роботи на сервері' });
    expect(rulesExcerpt([h])).toMatch(/^\[Довідка · \[F\.A\.Q\.\] Роботи на сервері\] /);
  });
  it('«має», «можуть» — службові: «перевагу» не тягне до «перевірки»', () => expect(best('хто має перевагу на перехресті')).toMatchObject({ n: '1.11' }));
  it('«забити бізвар» — запланувати захоплення бізнесу', () => expect(best('за скільки треба забити бізвар')).toMatchObject({ n: '1.8.1' }));
  it('«скільки учасників» — пункт «кількість учасників» вище за інші з цифрами', () => expect(best('скільки учасників на захопленні території')).toMatchObject({ n: '1.4' }));
  it('«без ліцензії» — пункт, де так і написано, вище за «з ліцензією»', () => expect(best('чи можна рибалити без ліцензії')).toMatchObject({ n: '6' }));
});

describe('normalizeQuery: роздільник між цифрами — крапка (specs/092)', () => {
  it('усі роздільники зі специфікації → «3.3»', () => {
    for (const q of ['3/3', '3,3', '3ю3', '3б3', '3 3', '3-3', '3_3', '3\\3', '3 / 3', '3  -  3', '3Ю3', '3.3'])
      expect(normalizeQuery(q), q).toBe('3.3');
  });
  it('вкладені номери → «3.3.1»', () => {
    for (const q of ['3/3/1', '3-3/1', '3ю3ю1', '3.3.1', '3 3 1']) expect(normalizeQuery(q), q).toBe('3.3.1');
  });
  it('номер серед слів; регістр', () => {
    expect(normalizeQuery('КК 6/7')).toBe('кк 6.7');
    expect(normalizeQuery('  ЗЕЛЕНА   ЗОНА ')).toBe('зелена зона');
  });
  it('роздільник не між цифрами — не змінюється', () => {
    for (const q of ['кк/пдр', '3/', '/3', 'зелена-зона', 'бізнес-вар', 'кк, 6']) expect(normalizeQuery(q), q).toBe(q);
  });
  it('ідемпотентна', () => {
    for (const q of ['3/3', '3 / 3 /1', 'КК 6/7', 'кк/пдр', '3ю3 lr']) expect(normalizeQuery(normalizeQuery(q))).toBe(normalizeQuery(q));
  });
  it('пошук: кожен роздільник знаходить те саме, що «3.3 дк»; «КК 6/7» = «КК 6.7»', () => {
    const t = (RULES as { topics: RuleTopic[] }).topics;
    const key = (q: string) => searchRules(t, q).map(h => `${h.topic} ${h.n}`);
    const want = key('3.3 дк');
    expect(want.length).toBeGreaterThan(0);
    expect(want.every(k => k.endsWith(' 3.3'))).toBe(true);
    for (const q of ['3/3 дк', '3,3 дк', '3ю3 дк', '3б3 дк', '3 3 дк', '3-3 дк', 'ДК 3/3']) expect(key(q), q).toEqual(want);
    expect(key('КК 6/7')).toEqual(key('КК 6.7'));
  });
});

describe('не та розкладка (specs/092)', () => {
  const t = (RULES as { topics: RuleTopic[] }).topics;
  const known = (w: string) => knownRuleWord(t, w);
  const run = (q: string) => searchRules(t, q);
  const fix = (q: string) => fixedSearch(q, run, h => !h.length, known);
  const key = (hs: { topic: string; n: string }[]) => hs.map(h => `${h.topic} ${h.n}`);

  it('переведення за клавішами, регістр не важить', () => {
    expect(toLayout('lr', 'ua')).toBe('дк');
    expect(toLayout('ghfdbkf', 'ua')).toBe('правила');
    expect(toLayout('GHFDBKF', 'ua')).toBe('правила');
    expect(toLayout('GhFdBkF', 'ua')).toBe('правила');
    expect(toLayout('ufhf;', 'ua')).toBe('гараж');
    expect(toLayout('ptktyj]', 'ua')).toBe('зеленої');
    expect(toLayout('вь', 'en')).toBe('dm');
    expect(toLayout('ВЬ', 'en')).toBe('dm');
    /* російська — з приведенням до українських літер: ы→и, э→е */
    expect(toLayout("'ktrnhjyysq", 'ru')).toBe('електронний');
    expect(toLayout("'ktrnhjyysq", 'ua')).toBe('єлектронній');
  });
  it('варіанти: відоме слово лишається, цифри не чіпаються, без дублів', () => {
    expect(layoutVariants('dm ptktyf', w => w === 'dm')[0]).toBe('dm зелена');
    expect(layoutVariants('3/3 lr', () => false)[0]).toBe('3.3 дк');
    expect(layoutVariants('вь', () => false)).toEqual(['dm']);
    const v = layoutVariants("'ktrnhjyysq", () => false);
    expect(v).toEqual(['єлектронній', 'електронний']);
    expect(layoutVariants('lr', () => false)).toEqual(['дк']);   // українська й російська однакові — один варіант
    expect(layoutVariants('3.3', () => false)).toEqual([]);   // нічого переводити
  });
  it('«3/3 lr» — те саме, що «3.3 дк», з підказкою', () => {
    const r = fix('3/3 lr');
    expect(r.shown).toBe('3.3 дк');
    expect(key(r.result)).toEqual(key(run('3.3 дк')));
    expect(r.result.length).toBeGreaterThan(0);
  });
  it('«lr» — те саме, що «дк»; «ptktyf pjyf» — що «зелена зона»', () => {
    expect(fix('lr')).toMatchObject({ shown: 'дк' });
    expect(key(fix('lr').result)).toEqual(key(run('дк')));
    const z = fix('ptktyf pjyf');
    expect(z.shown).toBe('зелена зона');
    expect(key(z.result)).toEqual(key(run('зелена зона')));
  });
  it('«ghfdbkf» — те саме, що «правила» (службове слово — як і правильний запит, нічого)', () => {
    expect(key(fix('ghfdbkf').result)).toEqual(key(run('правила')));
  });
  it('кирилиця замість латиниці: «вь» → «dm»', () => {
    const r = fix('вь');
    expect(r.shown).toBe('dm');
    expect(key(r.result)).toEqual(key(run('dm')));
  });
  it('коректний запит — як раніше, без підказки і без другого пошуку', () => {
    for (const q of ['dm', 'кк 6.5', 'зелена зона', '3.3 дк', 'КК 6/7']) {
      let calls = 0;
      const r = fixedSearch(q, x => { calls++; return run(x); }, h => !h.length, known);
      expect(r.shown, q).toBeNull();
      expect(calls, q).toBe(1);
      expect(key(r.result)).toEqual(key(run(q)));
    }
  });
  it('нічого не знайдено ні так, ні так — без підказки', () => {
    const r = fix('qzqzqz');
    expect(r.shown).toBeNull();
    expect(r.result).toEqual([]);
  });
  it('український варіант перед російським; береться той, що знайшов', () => {
    const runFake = (q: string) => (q === 'електронний' ? ['x'] : []);
    expect(fixedSearch("'ktrnhjyysq", runFake, r => !r.length, () => false)).toEqual({ result: ['x'], shown: 'електронний' });
    const both = (q: string) => (q === 'єлектронній' || q === 'електронний' ? [q] : []);
    expect(fixedSearch("'ktrnhjyysq", both, r => !r.length, () => false).shown).toBe('єлектронній');
  });
});

describe('глосарій у пошуку (specs/093)', () => {
  const t = (RULES as { topics: RuleTopic[] }).topics;
  const G = (GLOSSARY as { terms: GlossaryTerm[] }).terms;
  const run = (q: string) => searchRules(t, q, 8, G);
  const fix = (q: string) => fixedSearch(q, run, h => !h.length, w => knownRuleWord(t, w, G));
  /* God Mode і Bunny Hop у правилах QuantRP не згадуються; «ГМ» у правилах — Головний модератор (окремий термін) */
  const NO_RULES = new Set(['God Mode', 'Bunny Hop']);

  it('кожен термін: кириличне скорочення, перша інша назва й не та розкладка знаходять пункти', () => {
    expect(run('бх')).toEqual([]);
    expect(run('bunny hop')).toEqual([]);
    expect(run('god mode')).toEqual([]);
    for (const g of G) {
      const name = `${g.term}${g.full_name ? ` (${g.full_name})` : ''}`;
      if (NO_RULES.has(g.full_name)) continue;
      expect(run(g.term).length, `${name}: скорочення`).toBeGreaterThan(0);
      if (g.aliases[0]) expect(run(g.aliases[0]).length, `${name}: ${g.aliases[0]}`).toBeGreaterThan(0);
      const wrong = toLayout(g.term, 'en');
      expect(fix(wrong).result.length, `${name}: не та розкладка «${wrong}»`).toBeGreaterThan(0);
    }
  });
  it('пов\'язані пункти існують у правилах і йдуть першими', () => {
    for (const g of G) for (const r of g.related_rules) expect(relatedHits(t, { ...g, related_rules: [r] }).length, `${g.term}: ${r}`).toBe(1);
    const dm = G.find(g => g.term === 'ДМ')!;
    const main = relatedHits(t, dm)[0];
    for (const q of ['дм', 'DM', 'Дм', 'DeathMatch', 'lv']) {
      const first = (q === 'lv' ? fix(q).result : run(q))[0];
      expect({ topic: first.topic, n: first.n }, q).toEqual({ topic: main.topic, n: main.n });
    }
  });
  it('синонім фразою: «дм» знаходить пункти зі словами «вбивство … без … причини»', () => {
    expect(run('дм').some(h => /вбивств/i.test(h.s) && /причин/i.test(h.s))).toBe(true);
  });
  it('«33» — номер пункту, а «зз» і «pp» — зелена зона', () => {
    const n33 = run('33');
    expect(n33.every(h => h.n === '33')).toBe(true);
    expect(n33.some(h => /зелен/i.test(h.s))).toBe(false);
    expect(glossaryMatches(G, '33')).toEqual([]);
    const zz = run('зз');
    expect(zz.length).toBeGreaterThan(0);
    expect(zz.some(h => /зелен|ЗЗ/i.test(h.s))).toBe(true);
    const pp = fix('pp');
    expect(pp.shown).toBe('зз');
    expect(pp.result.map(h => h.topic + h.n)).toEqual(zz.map(h => h.topic + h.n));
  });
  it('два терміни в запиті — обидва розуміються', () => {
    const r = searchRules(t, 'дм у зз', 30, G);
    expect(r.length).toBeGreaterThan(0);
    expect(glossaryMatches(G, 'дм у зз').map(g => g.term)).toEqual(['ДМ', 'ЗЗ']);
  });
  it('картки: порядок слів, без дублів, ТК — двома значеннями, без термінів — нічого', () => {
    expect(glossaryMatches(G, 'зз dm').map(g => g.term)).toEqual(['ЗЗ', 'ДМ']);
    expect(glossaryMatches(G, 'дм DM дезматч').map(g => g.term)).toEqual(['ДМ']);
    expect(glossaryMatches(G, 'тк').map(g => g.full_name)).toEqual(['Team Kill', 'Трудовий кодекс']);
    expect(glossaryMatches(G, 'вбивство в лікарні')).toEqual([]);
    expect(glossaryMatches(G, 'зелена зона').map(g => g.term)).toEqual(['ЗЗ']);
    expect(glossaryMatches(G, 'метагеймінгу').map(g => g.term)).toEqual(['МГ']);
    expect(glossaryMatches(G, 'ГМ').map(g => g.full_name)).toEqual(['God Mode', 'Головний модератор']);
  });
  it('картка «Окремого пункту немає» — для God Mode і Bunny Hop, але не для Головного модератора чи ДМ', () => {
    const empty = (q: string) => termCards(t, G, q).map(c => `${c.term.full_name || c.term.term}:${c.empty}`);
    expect(empty('гм')).toEqual(['God Mode:true', 'Головний модератор:false']);
    expect(empty('бх')).toEqual(['Bunny Hop:true']);
    expect(empty('дм')).toEqual(['DeathMatch:false']);
    expect(empty('варн')).toEqual(['Варн:false']);
  });
  it('без глосарію пошук такий самий, як раніше', () => {
    for (const q of ['дм', 'зелена зона', 'КК 6.5', 'за скільки треба забити бізвар']) expect(searchRules(t, q)).toEqual(searchRules(t, q, 8, []));
  });
});
