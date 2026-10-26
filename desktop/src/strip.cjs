/* Нижня смужка під плашкою Alt+Q (design: Downloads/Group 3.png): тривалість ігрової сесії й чистий прибуток за годину гри.
   Чистий = надходження − витрати за сесію без переказів між готівкою й карткою — так само, як «Чистий за годину гри» в обліку
   (src/lib/ledgerStats.ts, src/lib/sessions.ts). Окремо від main.cjs, щоб перевірити тестом. */
function netOf(rows) {
  let n = 0;
  for (const r of rows || []) {
    if (r.source === 'transfer') continue;
    const a = Number(r.amount) || 0;
    n += r.type === 'in' ? a : -a;
  }
  return n;
}

/* null — сесія коротша за хвилину, рахувати «за годину» ще рано */
const perHour = (net, ms) => (ms >= 60e3 ? Math.round(net / (ms / 36e5)) : null);

/* ціль персонажа (кабінет → ціль і сума цілі): баланс = старт + усі записи, як «Баланс» на сайті (src/lib/ledger.ts);
   переказ між готівкою й карткою — пара записів, баланс разом не змінює. null — цілі немає */
function goalOf(c, rows) {
  const goal = Number(c?.goal) || 0;
  if (!(goal > 0)) return null;
  const bal = (Number(c.start_balance) || 0) + netOf(rows);
  return { name: String(c.goal_name || '').trim() || 'Ціль', pct: Math.max(0, Math.min(100, Math.floor(bal / goal * 100))), left: Math.max(0, Math.round(goal - bal)) };
}

module.exports = { netOf, perHour, goalOf };
