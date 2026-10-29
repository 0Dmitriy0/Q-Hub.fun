import { describe, expect, it } from 'vitest';
import { rulesExcerpt, searchRules, type RuleTopic } from './rulesSearch';
import RULES from '../data/rules.json';

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
});
