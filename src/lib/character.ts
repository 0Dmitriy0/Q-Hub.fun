/* новий персонаж: Ім'я_Прізвище і статік (specs/025) — та сама перевірка, що в програмі (desktop/src/character.cjs)
   і в базі (0038); тут — щоб гравець побачив помилку одразу, а не після запиту */
export const CHAR_NAME = /^[A-Z][a-zA-Z]{1,14}_[A-Z][a-zA-Z]{1,14}$/;
export const MAX_CHARACTERS = 3;

/* «Jacson _Core», «Jacson Core» → «Jacson_Core»; статік — лише цифри («#162 103» → 162103) */
export function parseCharacter(name: string, stat: string): { name: string; stat: number } | { error: string } {
  const n = name.trim().replace(/\s*_\s*/g, '_').replace(/\s+/g, '_');
  if (!CHAR_NAME.test(n)) return { error: "Ім'я й прізвище персонажа — латиницею через «_», як у грі: Dmitriy_Core" };
  const s = stat.replace(/\D/g, '');
  if (!s || s.length > 9 || Number(s) < 1) return { error: 'Вкажи статік персонажа — число з гри, напр. 162183' };
  return { name: n, stat: Number(s) };
}
