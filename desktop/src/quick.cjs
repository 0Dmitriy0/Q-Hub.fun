/* Швидкий запис (Alt+Q): «продав Sultan 450к» → +450 000 $, категорія «Продаж авто», нотатка «продав Sultan».
   Категорії — ті самі, що в «Обліку» сайту (src/lib/cats.ts). */
const CATS = {
  in: ['Робота', "Квести сім'ї", 'Продаж авто', 'Оренда', 'Бізнес', 'Казино / ставки', 'Перекуп', 'Продаж фарму', 'Інше'],
  out: ['Авто / тюнінг', 'Ліцензії', 'Податки', 'Одяг', 'Бізнес', 'Перекуп', 'Комісія маркету', 'Оренда', 'Інше'],
};
/* рахунок — як у src/lib/cats.ts: сказав сам («з картки», «готівкою») або за категорією */
const CARD_CATS = new Set(['Робота', "Квести сім'ї", 'Оренда', 'Бізнес', 'Податки', 'Ліцензії', 'Комісія маркету']);
const CARD_WORDS = /картк|карт[аиіу]|банк|безгот/, CASH_WORDS = /готів|кеш|налич/;
/* переказ між рахунками: «зняв 200к з картки», «поклав 100к на картку» */
const WITHDRAW = /зня[вл]|зняти|вивів|вивести|банкомат/, DEPOSIT = /поклав|покласти|вніс|внести|поповни/;
const OUT = /^[-−]|купи|витрат|заплат|оплат|відда|подат|штраф|тюн|ліценз|коміс|ремонт|заправ/;
const GUESS = {
  in: [['Робота', /робот|зарплат|зп\b|змін/], ["Квести сім'ї", /квест|сім/], ['Перекуп', /перекуп/], ['Продаж фарму', /фарм|ресурс/],
    ['Продаж авто', /авто|машин|тачк|мот/], ['Оренда', /оренд/], ['Бізнес', /бізнес/], ['Казино / ставки', /казино|ставк|виграв|лотер/]],
  out: [['Ліцензії', /ліценз|прав[аи]/], ['Податки', /подат|штраф/], ['Комісія маркету', /коміс|маркет/], ['Перекуп', /перекуп/],
    ['Авто / тюнінг', /авто|машин|тачк|мот|тюн|ремонт|бенз|заправ/], ['Одяг', /одяг|шмот/], ['Оренда', /оренд/], ['Бізнес', /бізнес/]],
};
/* сума: «450000», «450 000», «450к», «1,5кк», «2.5m», «$300» — береться остання в рядку */
const MONEY = /(^|\s)[+\-−]?\$?(\d{1,3}(?:[  ]\d{3})+|\d+(?:[.,]\d+)?)\s?(кк|kk|млн|m|к|k|тис)?\$?(?=\s|$)/gi;

function amountOf(num, suf) {
  const v = parseFloat(num.replace(/[  ]/g, '').replace(',', '.'));
  const s = (suf || '').toLowerCase();
  return Math.round(v * (['кк', 'kk', 'm', 'млн'].includes(s) ? 1e6 : s ? 1e3 : 1));
}

/* type — примусово ('in' | 'out'), інакше вгадується зі слів; null — у тексті немає суми */
function parse(text, type) {
  const t = String(text || '').trim();
  const all = [...t.matchAll(MONEY)];
  if (!all.length) return null;
  const m = all[all.length - 1];
  const amount = amountOf(m[2], m[3]);
  if (!(amount > 0)) return null;
  const low = t.toLowerCase();
  if (!type && CARD_WORDS.test(low) && (WITHDRAW.test(low) || DEPOSIT.test(low)))
    return WITHDRAW.test(low) ? { kind: 'transfer', from: 'card', to: 'cash', amount } : { kind: 'transfer', from: 'cash', to: 'card', amount };
  const kind = type || (OUT.test(low) ? 'out' : 'in');
  const category = (GUESS[kind].find(([, re]) => re.test(low)) || ['Інше'])[0];
  const account = CARD_WORDS.test(low) ? 'card' : CASH_WORDS.test(low) ? 'cash' : CARD_CATS.has(category) ? 'card' : 'cash';
  const note = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/^[+\-−]\s*/, '').replace(/\s+/g, ' ').trim()
    .replace(/\s+(за|по|на)$/i, '').slice(0, 200);   // «купив яйця за 30$» → «купив яйця»
  return { type: kind, amount, category, note, account };
}

module.exports = { parse, CATS };
