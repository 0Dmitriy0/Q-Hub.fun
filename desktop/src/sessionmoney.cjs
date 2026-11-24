/* Гроші сеансу з балансу HUD (готівка + картка). Початок — перше стабільне зчитування в цьому сеансі; нова сесія гри
   або інший персонаж — відлік заново.
   • perHour() — «Заробив» за годину поточного сеансу для смужки під Alt+Q (specs/040): сума надходжень ÷ час.
     Витрати її не зменшують (власник 2026-11-16: після покупки смужка показувала −42 тис. замість ≈ +140 тис.).
   • summary() — підсумок сеансу, який програма пише в game_sessions для кабінету (specs/044, конституція V 1.2.0):
     «Заробив» — сума зростань між сусідніми зчитуваннями, «Чистими» — кінець − початок. Окремих зчитувань не зберігаємо.
   Зростання рахує той самий облік, що й таймер роботи (jobtimer.cjs): готівка й картка окремо, цифра, що на мить
   прочиталась неправильно й повернулась (1 538 292 → 3 538 292 → 1 538 292), — не заробіток; велике надходження
   (від 100 тис.) іде в смужку після 90 с перевірки, а в підсумок сеансу — одразу (воно ще може зникнути, якщо повернеться).
   Зміна понад maxJump за одне зчитування неправдоподібна: у «Заробив» не йде, сеанс позначається.
   Окремо від main.cjs, щоб перевірити тестом. */
const jobtimer = require('./jobtimer.cjs');

const MIN_MS = 60e3;          // коротше хвилини рахувати «за годину» ще рано
const MAX_JUMP = 5e6;         // типовий поріг, поки програма не прочитала money_rules

/* облік зростань від цього зчитування: вимір таймера без підпису й історії */
const counter = (key, money, at, maxJump) => jobtimer.update(jobtimer.create(key, at, 'session'), money, at, maxJump);

function sessionMoney(saved = null) {
  /* { key, start, startAt, last, lastAt, gain, flag, base, baseFlag, jt }: jt — облік зростань; base/baseFlag — що нарахував
     старий облік до jt (стан програми до 0.9); gain/flag — підсумок обох */
  let cur = saved && typeof saved.key === 'string' ? { ...saved } : null;
  if (cur) { cur.lastAt ??= cur.startAt; cur.gain ??= 0; cur.flag ??= false; }   // стан 0.6 — без нових полів
  return {
    /* key — «сесія:персонаж»; повертає true, якщо почався новий відлік (варто зберегти) */
    update(key, money, at, maxJump = MAX_JUMP) {
      if (!key || !money) return false;
      const total = (Number(money.cash) || 0) + (Number(money.bank) || 0);
      if (!cur || cur.key !== key) {
        cur = { key, start: total, startAt: at, last: total, lastAt: at, gain: 0, flag: false, base: 0, baseFlag: false, jt: counter(key, money, at, maxJump) };
        return true;
      }
      if (!cur.jt) {
        /* сеанс почала стара програма: цей крок — за старим правилом, далі — новий облік */
        const d = total - cur.last;
        if (Math.abs(d) > maxJump) cur.flag = true;
        else if (d > 0) cur.gain += d;
        Object.assign(cur, { base: cur.gain, baseFlag: cur.flag, jt: counter(key, money, at, maxJump) });
      } else {
        jobtimer.update(cur.jt, money, at, maxJump);
        cur.gain = (cur.base || 0) + cur.jt.gain;
        cur.flag = !!cur.baseFlag || !!cur.jt.flag;
      }
      cur.last = total; cur.lastAt = at;
      return false;
    },
    /* «Заробив» $/год або null — ще немає зчитування в цьому сеансі чи минуло менше хвилини */
    perHour(key, now) {
      if (!cur || cur.key !== key) return null;
      const ms = now - cur.startAt;
      return ms >= MIN_MS ? Math.round(cur.gain / (ms / 36e5)) : null;
    },
    /* поля money_* для game_sessions або null — у цьому ключі ще немає зчитування */
    summary(key) {
      if (!cur || cur.key !== key) return null;
      const gain = cur.gain + (cur.jt ? jobtimer.pending(cur.jt) : 0);
      return {
        money_from: new Date(cur.startAt).toISOString(), money_to: new Date(cur.lastAt).toISOString(),
        money_start: Math.max(0, Math.round(cur.start)), money_end: Math.max(0, Math.round(cur.last)),
        money_gain: Math.max(0, Math.round(gain)), money_flag: !!cur.flag,
      };
    },
    state: () => (cur ? { ...cur } : null),
  };
}
module.exports = { sessionMoney, MIN_MS, MAX_JUMP };
