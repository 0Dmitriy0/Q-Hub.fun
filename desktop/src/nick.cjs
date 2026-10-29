/* нік акаунта в Q-Hub (specs/025): гравець вибирає сам; той самий вираз — у базі (0038) і на сайті (src/lib/nick.ts) */
const NICK = /^[A-Za-z0-9_]{3,20}$/;

/* { nick } або { error } — текст для гравця; зайнятість і «раз на 30 днів» перевіряє база */
function parseNick(s) {
  const nick = typeof s === 'string' ? s.trim() : '';
  if (!NICK.test(nick)) return { error: 'Нік — 3–20 символів: латиниця, цифри й «_», без пробілів. Наприклад, D_VYRX' };
  return { nick };
}

module.exports = { parseNick, NICK };
