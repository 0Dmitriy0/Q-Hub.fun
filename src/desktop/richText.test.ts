import { describe, expect, it } from 'vitest';
import { parseRich, plainText } from './richText';

describe('parseRich (specs/085)', () => {
  it('порожній вхід — без блоків; текст без структури — один абзац', () => {
    expect(parseRich('')).toEqual([]);
    expect(parseRich('   \n\n ')).toEqual([]);
    expect(parseRich('Так, можна.')).toEqual([{ t: 'para', spans: [{ t: 'text', v: 'Так, можна.' }] }]);
  });

  it('порожні рядки поспіль — один розрив, порожніх блоків немає', () => {
    const b = parseRich('Перший.\n\n\n\nДругий.');
    expect(b).toHaveLength(2);
    expect(b.every(x => x.t === 'para')).toBe(true);
  });

  it('рядки підряд без маркера — один абзац з переносом', () => {
    expect(parseRich('Рядок один\nрядок два')).toEqual([{ t: 'para', spans: [{ t: 'text', v: 'Рядок один\nрядок два' }] }]);
  });

  it('маркери «-», «•», «*» — маркований список, змішані — той самий список', () => {
    const b = parseRich('Покарання:\n- варн\n• деморган\n* бан');
    expect(b[0].t).toBe('para');
    expect(b[1]).toEqual({ t: 'list', ordered: false, start: 1, items: [[{ t: 'text', v: 'варн' }], [{ t: 'text', v: 'деморган' }], [{ t: 'text', v: 'бан' }]] });
  });

  it('«1.» і «2)» — нумерований список; тип визначає перший пункт', () => {
    const b = parseRich('1. Затримати\n2) Зачитати права\n- Доставити');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t: 'list', ordered: true });
    if (b[0].t === 'list') expect(b[0].items).toHaveLength(3);
  });

  it('рядок без маркера після пункту закриває список', () => {
    const b = parseRich('- раз\n- два\nПісля списку.');
    expect(b.map(x => x.t)).toEqual(['list', 'para']);
  });

  it('**жирне** — без зірочок; непарні — звичайний текст', () => {
    expect(parseRich('Штраф **5 000 $** і арешт')[0]).toEqual({ t: 'para', spans: [
      { t: 'text', v: 'Штраф ' }, { t: 'bold', v: '5 000 $' }, { t: 'text', v: ' і арешт' }] });
    expect(parseRich('Штраф **5 000 $ і арешт')[0]).toEqual({ t: 'para', spans: [{ t: 'text', v: 'Штраф **5 000 $ і арешт' }] });
  });

  it('«**» на початку рядка — жирне, а не пункт списку', () => {
    const b = parseRich('**Штраф** 500 $');
    expect(b[0]).toEqual({ t: 'para', spans: [{ t: 'bold', v: 'Штраф' }, { t: 'text', v: ' 500 $' }] });
  });

  it('заголовки «#» зрізаються', () => {
    expect(parseRich('## Відповідь\nТак.')[0]).toEqual({ t: 'para', spans: [{ t: 'text', v: 'Відповідь\nТак.' }] });
  });

  it('не кидає на дивному вході', () => {
    for (const s of ['****', '**', '*', '-', '1.', '\r\n\r\n', 'а'.repeat(5000), '- \n- ', '** **']) expect(() => parseRich(s)).not.toThrow();
    expect(parseRich('- \n- ')).toEqual([]);
  });

  it('\\r\\n — як звичайний перенос', () => {
    expect(parseRich('- раз\r\n- два')[0]).toMatchObject({ t: 'list', items: [[{ v: 'раз' }], [{ v: 'два' }]] });
  });
});

describe('plainText (specs/085 FR-006)', () => {
  it('абзаци через порожній рядок, пункти «• » і «N. », жирне без зірочок, посилання лишаються', () => {
    const t = 'Так, **заборонено** (Кримінальний кодекс, ст. 6.5).\n\n- варн\n- бан\n\n1. раз\n2. два';
    expect(plainText(t)).toBe('Так, заборонено (Кримінальний кодекс, ст. 6.5).\n\n• варн\n• бан\n\n1. раз\n2. два');
  });

  it('ніколи не містить «**» з парної розмітки', () => {
    expect(plainText('**а** **б** - **в**')).not.toContain('**');
  });
});

describe('нумерація підпунктів правил', () => {
  it('список з «3.» починається з 3 — і на екрані, і в буфері', () => {
    expect(parseRich('3. раз\n4. два')[0]).toMatchObject({ t: 'list', ordered: true, start: 3 });
    expect(plainText('3. раз\n4. два')).toBe('3. раз\n4. два');
  });
  it('«1.1 Текст» — номер пункту, а не список', () => {
    expect(parseRich('1.1 Заборонено DM')[0].t).toBe('para');
  });
});
