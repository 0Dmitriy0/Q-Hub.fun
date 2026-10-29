/* нік акаунта в Q-Hub (specs/025) — той самий вираз, що в базі (0038) і в програмі (desktop/src/nick.cjs) */
export const NICK = /^[A-Za-z0-9_]{3,20}$/;

/* null — нік підходить; інакше — текст для гравця. Зайнятість і «раз на 30 днів» перевіряє база */
export function nickError(s: string): string | null {
  return NICK.test(s.trim()) ? null : 'Нік — 3–20 символів: латиниця, цифри й «_», без пробілів. Наприклад, D_VYRX';
}

/* дата, з якої нік можна змінити знову (раз на 30 днів); null — вже можна */
export function nickLockedUntil(changedAt: string | null, now = Date.now()): Date | null {
  if (!changedAt) return null;
  const until = new Date(new Date(changedAt).getTime() + 30 * 864e5);
  return until.getTime() > now ? until : null;
}
