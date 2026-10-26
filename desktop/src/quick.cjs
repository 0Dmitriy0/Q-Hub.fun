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

/* ---------- угоди одним рядком: «нафармив 20 гливи», «купив 10 гливи по 300», «продав 5 мідної руди за 9к» ----------
   Товар має збігтися з відомим (товари скупників і склад персонажа) — інакше це звичайний запис грошей («продав Sultan 450к»).
   catalog: [{ name, best, unit }] — best — найвища ціна скупника (для «продав» без ціни). Повертає null, якщо це не угода.
   Рибу гра рахує штуками, а скупник платить за кг: 1000 шт = 1 кг. Тож для товарів «кг» число — штуки, якщо не дописано «кг» */
const DEAL_OPS = [['farm', /(^|\s)(на)?фарм|(^|\s)(зібра|накопа|наловив|наловила|добу[вл]|нарубав|нарубала|назбира)/],
  ['buy', /(^|\s)(купи|скупи|прикупи)/], ['sell', /(^|\s)(прода|зда[вл]|здала|збув)/]];
const NUM = '(\\d{1,3}(?:[  ]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s?(кк|kk|к|k|тис)?';
const words = s => s.toLowerCase().replace(/[^a-zа-яіїєґ'’ ]/g, ' ').split(/\s+/).filter(Boolean);
/* основа слова без закінчення: «гливи» → «глив», «мідної» → «мідн», «руди» → «руд» */
const stem = w => (w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);
const SKIP = new Set(['по', 'за', 'шт', 'штук', 'кг', 'од', 'на', 'у', 'в', 'з', 'і', 'та', 'скупнику', 'скупника', 'гравцю', 'гравця']);

function matchItem(query, catalog) {
  const qs = words(query).filter(w => w.length >= 3 && !SKIP.has(w)).map(stem);
  if (!qs.length) return null;
  let best = null, tie = false;
  for (const c of catalog) {
    const nw = words(c.name);
    const hit = qs.filter(q => nw.some(n => n.startsWith(q))).length;
    if (!hit) continue;
    /* усі слова назви мають бути названі (крім одного в довгих назвах), а зайвих слів у запиті — не більше одного */
    if (hit < nw.length - (nw.length > 2 ? 1 : 0) || qs.length - hit > 1) continue;
    const sc = hit * 10 - (nw.length - hit);
    if (!best || sc > best.sc) { best = { c, sc }; tie = false; } else if (sc === best.sc) tie = true;
  }
  return best && !tie ? best.c : null;   // «шкури кролика» при кількох шкурах кролика — неоднозначно, хай уточнить
}

function parseDeal(text, catalog = []) {
  const t = String(text || '').trim(), low = t.toLowerCase();
  const op = (DEAL_OPS.find(([, re]) => re.test(low)) || [])[0];
  if (!op) return null;
  let rest = ' ' + low + ' ', price = null, total = null;
  /* «по 300» — за штуку; «за 9к» / «9000$» — за все */
  const per = rest.match(new RegExp('\\sпо\\s*\\$?\\s*' + NUM + '\\$?(?=\\s)'));
  const all = rest.match(new RegExp('\\sза\\s*\\$?\\s*' + NUM + '\\$?(?=\\s)')) || rest.match(new RegExp('\\s\\$\\s*' + NUM + '(?=\\s)')) || rest.match(new RegExp('\\s' + NUM + '\\s?\\$(?=\\s)'));
  if (per) { price = amountOf(per[1], per[2]); rest = rest.replace(per[0], ' '); }
  else if (all) { total = amountOf(all[1], all[2]); rest = rest.replace(all[0], ' '); }
  const q = rest.match(/\s(\d+(?:[.,]\d+)?)\s?(кг|шт)?(?=\s)/);
  if (!q) return null;
  let qty = parseFloat(q[1].replace(',', '.'));
  if (!(qty > 0)) return null;
  rest = rest.replace(q[0], ' ').replace(DEAL_OPS.find(([o]) => o === op)[1], ' ');
  const item = matchItem(rest, catalog);
  if (!item) return null;
  const unit = item.unit || 'шт';
  if (unit === 'кг' && q[2] !== 'кг') qty /= 1000;
  qty = Math.max(0.01, Math.round(qty * 100) / 100);   // в базі — 2 знаки: для риби крок 10 г, менше — не нуль, а 10 г
  if (op === 'farm') price = 0;
  else if (price === null && total !== null) price = Math.round(total / qty);
  else if (price === null && op === 'sell' && item.best > 0) price = item.best;   // продав без ціни — за найкращим скупником
  return { kind: 'deal', op, item: item.name, qty, unit, price: price ?? null };
}

module.exports = { parse, parseDeal, CATS };
