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
    expect(rulesExcerpt(hits)).toContain('[Правила Зелених Зон, п. 1.1]');
    expect(rulesExcerpt(hits, 120).length).toBeLessThanOrEqual(120);
  });
  it('справжні правила з форуму: DM знаходиться', () => {
    const t = (RULES as { topics: RuleTopic[] }).topics;
    expect(t.length).toBeGreaterThan(20);
    expect(searchRules(t, 'дм')[0].s).toMatch(/DM \(DeathMatch\)/);
  });
});
