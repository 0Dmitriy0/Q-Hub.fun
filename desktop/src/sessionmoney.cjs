/* Прибуток за годину сеансу (specs/040): з балансу HUD (готівка + картка), лише для показу в смужці під Alt+Q.
   Початок — перше стабільне зчитування в цьому сеансі; нова сесія гри або інший персонаж — відлік заново.
   Нічого не пишеться в базу: облік програма більше не веде. Окремо від main.cjs, щоб перевірити тестом. */
const MIN_MS = 60e3;   // коротше хвилини рахувати «за годину» ще рано

function sessionMoney(saved = null) {
  let cur = saved && typeof saved.key === 'string' ? { ...saved } : null;   // { key, start, startAt, last }
  return {
    /* key — «сесія:персонаж»; повертає true, якщо почався новий відлік (варто зберегти) */
    update(key, money, at) {
      if (!key || !money) return false;
      const total = (Number(money.cash) || 0) + (Number(money.bank) || 0);
      if (!cur || cur.key !== key) { cur = { key, start: total, startAt: at, last: total }; return true; }
      cur.last = total;
      return false;
    },
    /* $/год або null — ще немає зчитування в цьому сеансі чи минуло менше хвилини */
    perHour(key, now) {
      if (!cur || cur.key !== key) return null;
      const ms = now - cur.startAt;
      return ms >= MIN_MS ? Math.round((cur.last - cur.start) / (ms / 36e5)) : null;
    },
    state: () => (cur ? { ...cur } : null),
  };
}
module.exports = { sessionMoney, MIN_MS };
