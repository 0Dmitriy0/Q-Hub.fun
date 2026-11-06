import { describe, expect, it } from 'vitest';

/* specs/061 SC-003: на екранах панелі немає технічних слів. Перевіряємо лише текст, який бачить людина:
   рядки й JSX-текст з кирилицею; коментарі, ідентифікатори й службові рядки (ролі, назви таблиць) не чіпаємо.
   Файли беремо через import.meta.glob (Vite), без node:fs — збірка сайту перевіряє типи без типів Node */
const FORBIDDEN = ['specs/', 'міграц', '.sql', 'QH0', 'RLS', 'moderator', 'editor', 'admin', 'Supabase'];
const files = import.meta.glob(['../pages/Panel.tsx', './panel.ts', '../components/panel/*.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function visibleTexts(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`|>([^<>{}]+)</g)) {
    const t = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    if (/[А-Яа-яІіЇїЄєҐґ]/.test(t)) out.push(t);
  }
  return out;
}

describe('тексти панелі без технічних слів', () => {
  it('знаходить текст у рядках і JSX, пропускає коментарі', () => {
    const t = visibleTexts("/* specs/061 */ const a = 'Привіт'; <b>Черга admin</b> role === 'admin'");
    expect(t).toEqual(['Привіт', 'Черга admin']);
  });
  it('файли панелі знайдено', () => {
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(7);
  });
  for (const [name, src] of Object.entries(files)) {
    it(name, () => {
      const bad = visibleTexts(src).filter(t => FORBIDDEN.some(w => t.toLowerCase().includes(w.toLowerCase())));
      expect(bad).toEqual([]);
    });
  }
});
