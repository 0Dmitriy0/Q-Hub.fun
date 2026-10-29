/* новий персонаж з плашки входу: перевірка того, що ввів гравець (main.cjs → char-add) */

/* Ім'я_Прізвище, як у грі (RAGE MP): латиниця, по 2–15 літер, обидві частини з великої */
const CHAR_NAME = /^[A-Z][a-zA-Z]{1,14}_[A-Z][a-zA-Z]{1,14}$/;

/* статік і баланс — лише цифри: «#162183», «6 544 000 $» теж підходять */
const digits = v => String(v ?? '').replace(/\D/g, '');

/* { name, stat, start } або { error } — текст для гравця */
function parseCharacter(p) {
  /* «Jacson _Core», «Jacson Core» → «Jacson_Core»: пробіли довкола «_» і замість нього — типова помилка, не відмова */
  const name = typeof p?.name === 'string' ? p.name.trim().replace(/\s*_\s*/g, '_').replace(/\s+/g, '_') : '';
  if (!CHAR_NAME.test(name)) return { error: "Ім'я й прізвище персонажа — латиницею через «_», як у грі: Dmitriy_Core" };
  const s = digits(p?.static);
  const stat = Number(s);
  if (!s || s.length > 9 || stat < 1) return { error: 'Вкажи статік персонажа — число з гри, напр. 162183' };
  const start = Number(digits(p?.start).slice(0, 15)) || 0;
  return { name, stat, start };
}

module.exports = { parseCharacter, CHAR_NAME };
