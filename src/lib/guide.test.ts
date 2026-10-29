import { describe, expect, it } from 'vitest';
import { steps } from './guide';

describe('кроки інструкції', () => {
  it('кроки — через порожній рядок, «Знімок:» — картинка до кроку', () => {
    expect(steps('Встанови OpenIV.\n\nВідкрий теку гри.\nЗнімок: https://x.supabase.co/a.webp\n\n\n')).toEqual([
      { text: 'Встанови OpenIV.', image: null },
      { text: 'Відкрий теку гри.', image: 'https://x.supabase.co/a.webp' },
    ]);
  });
  it('порожній текст — нуль кроків; посилання не https — лишається текстом', () => {
    expect(steps('  \n\n ')).toEqual([]);
    expect(steps('Знімок: http://x/a.png')).toEqual([{ text: 'Знімок: http://x/a.png', image: null }]);
  });
});
