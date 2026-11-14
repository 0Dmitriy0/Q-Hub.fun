import { describe, expect, it } from 'vitest';
import { SYSTEM, checkRefs, clean, context, rulesBlock } from './plan.ts';

describe('помічник Alt+Q без обліку (specs/040)', () => {
  it('у контексті — лише ціни скупників, дорожчі спершу', () => {
    const t = context({ prices: [{ buyer: 'Гриби', item: 'Глива', price: 120, min: 100, max: 200 }, { buyer: 'Ферма', item: 'Глива', price: 150, min: 0, max: 0 }] });
    expect(t).toContain('Глива: Ферма 150');
    expect(t.indexOf('Ферма')).toBeLessThan(t.indexOf('Гриби'));
    expect(t).not.toMatch(/Баланс|Склад|записи обліку/);
  });
  it('відповідь — лише текст, дій-записів немає ніколи', () => {
    expect(clean({ reply: '  Глива — 150 $ у Фермі. ', actions: [{ kind: 'tx', amount: 5 }] })).toEqual({ reply: 'Глива — 150 $ у Фермі.', actions: [] });
    expect(clean(null)).toEqual({ reply: '', actions: [] });
  });
  /* specs/085: відповідь читається з першого погляду — головна думка, список, жирне лише для сум і строків */
  it('підказка: формат відповіді — головна думка, список, мало жирного', () => {
    expect(SYSTEM).toContain('перше речення — головна думка');
    expect(SYSTEM).toContain('кожен пункт з нового рядка з «- »');
    expect(SYSTEM).toContain('не більше трьох на відповідь');
    expect(SYSTEM).toContain('Без заголовків, таблиць і вкладених списків');
    expect(SYSTEM).toContain('до чотирьох пунктів списком');
    expect(SYSTEM).not.toContain('одне-два короткі речення українською');
  });
  it('підказка: облік прибрано — помічник не обіцяє записати', () => {
    expect(SYSTEM).toContain('облік прибрали');
    expect(SYSTEM).not.toContain('actions');
  });
});

describe('пункти правил для помічника', () => {
  it('є пункти — окремий блок перед текстом гравця', () => {
    const r = '[Правила сервера · Правила Зелених Зон, п. 1.1] Заборонено вбивство\n[Закон штату · Кримінальний кодекс штату Quant, ст. 6.5] Викрадення авто';
    expect(rulesBlock(r)).toBe(`Пункти правил сервера й законів штату QuantRP, що можуть стосуватися питання:\n${r}\n\n`);
  });
  /* specs/010: правила сервера й закони штату — різне, номер — з документом, без пунктів — не вигадувати */
  it('підказка: розрізняти правила сервера й закони штату', () => {
    expect(SYSTEM).toContain('«Правила сервера» — порушення карає адміністрація');
    expect(SYSTEM).toContain('«Закон штату» — кара в самій грі');
    expect(SYSTEM).toContain('скажи окремо, що порушено з правил сервера і що з законів штату');
  });
  it('підказка: документ і номер, нічого не вигадувати', () => {
    expect(SYSTEM).toContain('з документом і номером у дужках');
    expect(SYSTEM).toContain('(Кримінальний кодекс, ст. 6.5)');
    expect(SYSTEM).toContain('прямо скажи, що в правилах і законах цього не знайшов');
    expect(SYSTEM).toContain("з пам'яті не вигадуй");
  });
  /* specs/010: «забити бізвар», «запис на капті» — пункт був серед переданих, а ШІ казав «не знайшов» */
  it('підказка: сленг гравців і перечитати пункти перед «не знайшов»', () => {
    expect(SYSTEM).toContain('капт — захоплення території');
    expect(SYSTEM).toContain('забити (бізвар, капт, стрілу) — запланувати чи оголосити');
    expect(SYSTEM).toContain('Перш ніж сказати, що не знайшов, перечитай усі пункти');
  });
  it('порожньо чи не рядок — нічого', () => {
    expect(rulesBlock('  ')).toBe('');
    expect(rulesBlock(undefined)).toBe('');
    expect(rulesBlock({ x: 1 })).toBe('');
  });
  it('задовге — обрізається до 24000', () => expect(rulesBlock('я'.repeat(30000)).length).toBeLessThan(24100));
});

describe('номери пунктів у відповіді — лише справжні (specs/010, SC-003)', () => {
  const rules = `[Правила сервера · Захоплення Територій, п. 1.4] Мінімальна кількість учасників на івенті - 5, максимальна - 15.
[Закон штату · Кримінальний кодекс штату Quant, ст. 6.5] Викрадення людини. Карається позбавленням волі.
[Правила сервера · Правила івентів, п. 1.1] Під час івенту діють всі правила серверу. Виняток: DM, TK, RK та пункт 6.31 Загальних Правил.
[Закон штату · Закон про полювання] Вступ без номера.`;
  it('справжній номер лишається', () => {
    const r = 'На капті від 5 до 15 учасників (Захоплення Територій, п. 1.4).';
    expect(checkRefs(r, rules)).toBe(r);
  });
  it('вигаданий номер зникає разом із комою, документ лишається', () => {
    expect(checkRefs('Викрадення авто карається штрафом (Кримінальний кодекс, ст. 9.9).', rules)).toBe('Викрадення авто карається штрафом (Кримінальний кодекс).');
    expect(checkRefs('Це заборонено (п. 7.7).', rules)).toBe('Це заборонено.');
  });
  it('у переліку — лишаються лише справжні', () => {
    expect(checkRefs('Дивись (Кримінальний кодекс, ст. 6.5, 6.9).', rules)).toBe('Дивись (Кримінальний кодекс, ст. 6.5).');
  });
  it('номер, згаданий у тексті пункту («пункт 6.31»), — справжній', () => {
    expect(checkRefs('Виняток — п. 6.31 Загальних правил.', rules)).toBe('Виняток — п. 6.31 Загальних правил.');
  });
  it('без витягу (питання про ціни) — відповідь як є', () => {
    expect(checkRefs('Записав 500 $ за ст. 3 (жарт).', '')).toBe('Записав 500 $ за ст. 3 (жарт).');
    expect(checkRefs('Записав', undefined)).toBe('Записав');
  });
});

describe('довідка (F.A.Q.) у витягу (specs/010, 2026-10-30)', () => {
  it('стара програма пише «[undefined · …]» — помічник бачить «Довідка»', () => {
    expect(rulesBlock('[undefined · [F.A.Q.] Роботи на сервері] Таксі: телефон, GPS.')).toContain('[Довідка · [F.A.Q.] Роботи на сервері] Таксі');
  });
  it('підказка: довідка — пояснення, а не заборона', () => expect(SYSTEM).toMatch(/«Довідка» — F\.A\.Q\..*не заборона/));
});

/* пошук по правилах у функції — копія пошуку програми: розійшлися — помічник шукав би інакше, ніж Enter у плашці */
import { SEARCH_TOOL } from './plan.ts';
import { searchRules } from './rulesSearch.ts';
import RULES from '../../../src/data/rules.json';
const raw = import.meta.glob(['./rulesSearch.ts', '../../../src/desktop/rulesSearch.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('пошук помічника по правилах (search_rules)', () => {
  it('копія rulesSearch.ts у функції — така сама, як у програмі (окрім шапки)', () => {
    const copy = raw['./rulesSearch.ts'].replace(/\r\n/g, '\n'), src = raw['../../../src/desktop/rulesSearch.ts'].replace(/\r\n/g, '\n');
    expect(copy.slice(copy.indexOf('/* Пошук по правилах'))).toBe(src);
  });
  it('інструмент — один рядок запиту, строга схема', () => {
    expect(SEARCH_TOOL.name).toBe('search_rules');
    expect(SEARCH_TOOL.input_schema.required).toEqual(['query']);
  });
  it('у промпті — коли й як шукати самому', () => {
    expect(SYSTEM).toContain('search_rules');
    expect(SYSTEM).not.toMatch(/JSON за схемою/);
  });
  const topics = (RULES as { topics: Parameters<typeof searchRules>[0] }).topics;
  it.each([
    ['угон авто', /викрад/i],
    ['кафи', /наручн|затрим/i],
    ['права при арешті', /затрим|адвокат/i],
  ])('сленг «%s» знаходить офіційні пункти', (q, re) => {
    expect(searchRules(topics, q, 20).some(h => re.test(h.s))).toBe(true);
  });
});
