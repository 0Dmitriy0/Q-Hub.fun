/* Гроші сеансу з балансу HUD (готівка + картка). Початок — перше стабільне зчитування в цьому сеансі; нова сесія гри
   або інший персонаж — відлік заново.
   • perHour() — прибуток за годину поточного сеансу для смужки під Alt+Q (specs/040).
   • summary() — підсумок сеансу, який програма пише в game_sessions для кабінету (specs/044, конституція V 1.2.0):
     «Заробив» — сума зростань між сусідніми зчитуваннями, «Чистими» — кінець − початок. Окремих зчитувань не зберігаємо.
   Зміна понад maxJump за одне зчитування неправдоподібна (OCR переплутав цифру): у «Заробив» не йде, сеанс позначається.
   Окремо від main.cjs, щоб перевірити тестом. */
const MIN_MS = 60e3;          // коротше хвилини рахувати «за годину» ще рано
const MAX_JUMP = 5e6;         // типовий поріг, поки програма не прочитала money_rules

function sessionMoney(saved = null) {
  let cur = saved && typeof saved.key === 'string' ? { ...saved } : null;   // { key, start, startAt, last, lastAt, gain, flag }
  if (cur) { cur.lastAt ??= cur.startAt; cur.gain ??= 0; cur.flag ??= false; }   // стан 0.6 — без нових полів
  return {
    /* key — «сесія:персонаж»; повертає true, якщо почався новий відлік (варто зберегти) */
    update(key, money, at, maxJump = MAX_JUMP) {
      if (!key || !money) return false;
      const total = (Number(money.cash) || 0) + (Number(money.bank) || 0);
      if (!cur || cur.key !== key) { cur = { key, start: total, startAt: at, last: total, lastAt: at, gain: 0, flag: false }; return true; }
      const d = total - cur.last;
      if (Math.abs(d) > maxJump) cur.flag = true;
      else if (d > 0) cur.gain += d;
      cur.last = total; cur.lastAt = at;
      return false;
    },
    /* $/год або null — ще немає зчитування в цьому сеансі чи минуло менше хвилини */
    perHour(key, now) {
      if (!cur || cur.key !== key) return null;
      const ms = now - cur.startAt;
      return ms >= MIN_MS ? Math.round((cur.last - cur.start) / (ms / 36e5)) : null;
    },
    /* поля money_* для game_sessions або null — у цьому ключі ще немає зчитування */
    summary(key) {
      if (!cur || cur.key !== key) return null;
      return {
        money_from: new Date(cur.startAt).toISOString(), money_to: new Date(cur.lastAt).toISOString(),
        money_start: Math.max(0, Math.round(cur.start)), money_end: Math.max(0, Math.round(cur.last)),
        money_gain: Math.max(0, Math.round(cur.gain)), money_flag: !!cur.flag,
      };
    },
    state: () => (cur ? { ...cur } : null),
  };
}
module.exports = { sessionMoney, MIN_MS, MAX_JUMP };
