/* Гра в повноекранному режимі: знімок екрана чорний — «зір» нічого не бачить, плашки й таймера поверх гри не видно.
   Вбудовуватися в гру, щоб малювати поверх ексклюзивного повноекранного режиму, не можна (конституція, принцип I),
   тож лише попереджаємо: «постав “Вікно без рамки”». Чорний кадр має триматися HOLD_MS поспіль — короткий
   (екран завантаження) не рахується. Сповіщення Windows — не частіше разу на COOLDOWN_MS; банер у плашці — щоразу.
   feed(black, now) → 'warn' (банер + сповіщення) | 'show' (лише банер) | 'clear' (гру знову видно) | null.
   Окремо від main.cjs, щоб перевірити тестом без Electron. */
const HOLD_MS = 20e3;
const COOLDOWN_MS = 30 * 60e3;

function blackWatch({ hold = HOLD_MS, cooldown = COOLDOWN_MS } = {}) {
  let since = null, shown = false, warnedAt = -Infinity;
  return {
    get black() { return shown; },
    feed(black, now) {
      if (!black) {
        since = null;
        if (!shown) return null;
        shown = false;
        return 'clear';
      }
      since ??= now;
      if (shown || now - since < hold) return null;
      shown = true;
      if (now - warnedAt >= cooldown) { warnedAt = now; return 'warn'; }
      return 'show';
    },
    /* кадрів немає (гру закрито, зір вимкнено) — починаємо заново */
    reset() {
      since = null;
      if (!shown) return null;
      shown = false;
      return 'clear';
    },
  };
}

module.exports = { blackWatch, HOLD_MS, COOLDOWN_MS };
