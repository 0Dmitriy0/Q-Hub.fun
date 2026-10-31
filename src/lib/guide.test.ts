import { describe, expect, it } from 'vitest';
import { guide, joinTiles, pieces, splitTiles, steps, tileError, version } from './guide';

describe('кроки інструкції', () => {
  it('кроки — через порожній рядок, «Знімок:» — картинка до кроку', () => {
    expect(steps('Встанови OpenIV.\n\nВідкрий теку гри.\nЗнімок: https://x.supabase.co/a.webp\n\n\n')).toEqual([
      { text: 'Встанови OpenIV.', image: null, warn: false },
      { text: 'Відкрий теку гри.', image: 'https://x.supabase.co/a.webp', warn: false },
    ]);
  });
  it('порожній текст — нуль кроків; посилання не https — лишається текстом', () => {
    expect(steps('  \n\n ')).toEqual([]);
    expect(steps('Знімок: http://x/a.png')).toEqual([{ text: 'Знімок: http://x/a.png', image: null, warn: false }]);
  });
  it('«Важливо:» — попередження, саме слово не показується', () => {
    expect(steps('Важливо: зроби копію update.rpf.')).toEqual([{ text: 'зроби копію update.rpf.', image: null, warn: true }]);
  });
});

describe('«Як поставити» з плитками й етапами (specs/027)', () => {
  const text = [
    'Потрібно: OpenIV | відкриває файли гри | https://openiv.com/',
    'Потрібно: Карта для гри | архів з сайту | /mapa?game=1',
    "Потрібно: mapzoomdata.meta | віддалити мінікарту | https://www.gta5-mods.com/x | необов'язково",
    'Потрібно: Зламана | без посилання | ftp://x',
    '',
    'Етап: Підготовка',
    'Встанови OpenIV.',
    '',
    'Запусти OpenIV.',
    '',
    'Етап: Резервна копія',
    '',
    'Важливо: скопіюй update.rpf.',
  ].join('\n');
  it('плитки — з «Потрібно:», зламана відкидається; зовнішня чи сторінка сайту', () => {
    const { tiles } = guide(text);
    expect(tiles.map(t => [t.name, t.external, t.optional])).toEqual([['OpenIV', true, false], ['Карта для гри', false, false], ['mapzoomdata.meta', true, true]]);
  });
  it('етапи за «Етап:», номери кроків наскрізні', () => {
    const { stages } = guide(text);
    expect(stages.map(s => [s.title, s.first, s.steps.map(x => x.text)])).toEqual([
      ['Підготовка', 1, ['Встанови OpenIV.', 'Запусти OpenIV.']],
      ['Резервна копія', 3, ['скопіюй update.rpf.']],
    ]);
    expect(stages[1].steps[0].warn).toBe(true);
  });
  it('без етапів і плиток — один список, як раніше', () => {
    const { tiles, stages } = guide('Крок 1.\n\nКрок 2.');
    expect(tiles).toEqual([]);
    expect(stages).toEqual([{ title: '', first: 1, steps: steps('Крок 1.\n\nКрок 2.') }]);
  });
  it('форма адміна: плитки окремо й назад без втрат', () => {
    const { tiles, rest } = splitTiles(text);
    expect(tiles.split('\n')[0]).toBe('OpenIV | відкриває файли гри | https://openiv.com/');
    expect(rest.startsWith('Етап: Підготовка')).toBe(true);
    expect(guide(joinTiles(tiles, rest))).toEqual(guide(text));
    expect(joinTiles('', 'Крок.')).toBe('Крок.');
  });
  it('помилка плитки — назва й посилання', () => {
    expect(tileError('OpenIV | x | https://openiv.com/\nКарта | y | /mapa')).toBeNull();
    expect(tileError('OpenIV | x | openiv.com')).toMatch(/OpenIV.*https/);
    expect(tileError(' | x | https://a')).toMatch(/назва/);
  });
  it('версія змінюється разом з кроками, а не з плитками', () => {
    expect(version(text)).toBe(version(text.replace('https://openiv.com/', 'https://openiv.com/x')));
    expect(version(text)).not.toBe(version(text.replace('Запусти', 'Відкрий')));
  });
});

describe('шматки тексту кроку', () => {
  it('шлях з «\\», адреса й [кнопка]; крапка в кінці речення — не частина', () => {
    expect(pieces('Відкрий GTAV\\update\\update.rpf\\x64\\levels\\gta5. Натисни [Редагувати] (https://openiv.com/).')).toEqual([
      { k: 'text', v: 'Відкрий ' }, { k: 'path', v: 'GTAV\\update\\update.rpf\\x64\\levels\\gta5' }, { k: 'text', v: '. Натисни ' },
      { k: 'btn', v: 'Редагувати' }, { k: 'text', v: ' (' }, { k: 'url', v: 'https://openiv.com/' }, { k: 'text', v: ').' },
    ]);
  });
  it('звичайний текст — один шматок', () => {
    expect(pieces('Закрий OpenIV.')).toEqual([{ k: 'text', v: 'Закрий OpenIV.' }]);
  });
});
