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

module.exports = { netOf, perHour };
