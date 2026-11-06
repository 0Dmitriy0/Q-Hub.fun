import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* specs/061 SC-003: на екранах панелі немає технічних слів. Перевіряємо лише текст, який бачить людина:
   рядки й JSX-текст з кирилицею; коментарі, ідентифікатори й службові рядки (ролі, назви таблиць) не чіпаємо */
const FORBIDDEN = ['specs/', 'міграц', '.sql', 'QH0', 'RLS', 'moderator', 'editor', 'admin', 'Supabase'];
const root = join(__dirname, '..');
const files = [
  join(root, 'pages', 'Panel.tsx'),
  join(root, 'lib', 'panel.ts'),
  ...readdirSync(join(root, 'components', 'panel')).filter(f => f.endsWith('.tsx')).map(f => join(root, 'components', 'panel', f)),
];

export function visibleTexts(src: string): string[] {
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
  for (const f of files) {
    it(f.slice(root.length + 1), () => {
      const bad = visibleTexts(readFileSync(f, 'utf8')).filter(t => FORBIDDEN.some(w => t.toLowerCase().includes(w.toLowerCase())));
      expect(bad).toEqual([]);
    });
  }
});
