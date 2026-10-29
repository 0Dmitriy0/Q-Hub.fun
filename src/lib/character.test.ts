import { describe, expect, it } from 'vitest';
import { parseCharacter } from './character';

describe('новий персонаж', () => {
  it('звичайний і з пробілами довкола «_» чи замість нього', () => {
    expect(parseCharacter('Luigi_Core', '162103')).toEqual({ name: 'Luigi_Core', stat: 162103 });
    for (const n of ['Jacson _Core', 'Jacson_ Core', 'Jacson Core']) expect(parseCharacter(n, '1')).toEqual({ name: 'Jacson_Core', stat: 1 });
  });
  it('статік так, як його копіюють: «#162 103»', () => {
    expect(parseCharacter('Luigi_Core', '#162 103')).toEqual({ name: 'Luigi_Core', stat: 162103 });
  });
  it("ім'я не як у грі — відмова", () => {
    for (const n of ['saha_23', 'luigi_core', 'Luigi', 'Луїджі_Коре', '']) expect(parseCharacter(n, '1')).toHaveProperty('error');
  });
  it('статік: порожній, без цифр, нуль, задовгий — відмова', () => {
    for (const s of ['', 'abc', '0', '1234567890']) expect(parseCharacter('Luigi_Core', s)).toHaveProperty('error');
  });
});
