/* «Зір» програми, крок 2: де гравець і на що пішли гроші. Поки HUD закритий меню, програма читає текст екрана (OCR)
   і запам'ятовує місце — магазин 24/7, скупник, банкомат…; коли HUD показав зміну грошей, запис отримує це місце
   й текст підтвердження гри внизу («299$ сплачено готівкою!»). Чиста логіка — перевіряється scene.test.cjs. */

const low = s => String(s || '').toLowerCase().replace(/\s+/g, ' ');

/* текст меню → місце. Порядок важливий: «Купує … Продати» — скупник, навіть якщо десь видно слово «магазин» */
const RULES = [
  ['buyer', /купу[єеє]\s|продати все|за шт\b|ліміт продажу/, t => { const m = t.match(/купу[єе]\s+([\p{L}' ]{3,20})/u); return 'Скупник' + (m ? ': ' + m[1].trim().split(' ')[0] : ''); }],
  ['shop', /магазин\s*24\s*\/?\s*7/, t => { const m = t.match(/магазин\s*24\s*\/?\s*7\s*#?\s*(\d+)/); return 'Магазин 24/7' + (m ? ' #' + m[1] : ''); }],
  ['bank', /mazebank|maze bank|банкомат|поповнити|баланс на рахунку|fleeca/, () => 'Банкомат'],
  ['market', /маркетплейс|marketplace|торговий майданчик/, () => 'Маркетплейс'],
  ['fuel', /заправк|азс|пальне|бензин|літр/, () => 'Заправка'],
  ['tune', /тюнінг|customs|ls customs|покраск/, () => 'Тюнінг'],
  ['clothes', /одяг|binco|suburban|ponsonbys|магазин одягу/, () => 'Магазин одягу'],
  ['license', /ліценз|license/, () => 'Ліцензії'],
];
function scene(text) {
  const t = low(text);
  for (const [kind, re, title] of RULES) if (re.test(t)) return { kind, title: title(t) };
  return null;
}

/* категорія витрати чи доходу за місцем і текстом підтвердження (категорії — як у src/lib/cats.ts) */
const OUT_BY_SCENE = { shop: 'Інше', fuel: 'Авто / тюнінг', tune: 'Авто / тюнінг', clothes: 'Одяг', license: 'Ліцензії', market: 'Перекуп' };
function category(type, sc, toast) {
  const t = low(toast);
  if (type === 'in') {
    if (/зарплат|зп\b|зміну завершено|оплата праці/.test(t)) return 'Робота';
    if (sc?.kind === 'buyer') return 'Продаж фарму';
    if (sc?.kind === 'market') return 'Перекуп';
    if (/виграш|лотере|казино|ставк/.test(t)) return 'Казино / ставки';
    return 'Інше';
  }
  if (/податок|штраф|податк/.test(t)) return 'Податки';
  if (/коміс/.test(t)) return 'Комісія маркету';
  return OUT_BY_SCENE[sc?.kind] || 'Інше';
}

/* з тексту підтвердження гри — лише зрозумілі фрази: OCR цих плашок шумний («поповнено на 1005» замість 100$),
   тож у нотатку не йде сирий текст, а сума завжди береться з HUD */
const PHRASES = [[/сплачено\s+готівк/, 'оплата готівкою'], [/сплачено\s+карт|оплачено\s+карт/, 'оплата карткою'], [/банк\s+поповнено|поповнено/, 'поповнення банку'],
  [/знято|зняття/, 'зняття'], [/зарплат/, 'зарплата'], [/податок|податк/, 'податок'], [/штраф/, 'штраф'], [/зараховано|зарахування/, 'зарахування'], [/продано|продаж/, 'продаж']];
function phrase(toast) {
  const t = low(toast);
  return [...new Set(PHRASES.filter(([re]) => re.test(t)).map(([, p]) => p))].slice(0, 2).join(', ');
}

/* зміни грошей (hud.classify) + місце + підтвердження → записи для обліку.
   Зняття з банкомата з комісією: готівка +X, банк −(X + комісія) — переказ X і витрата «комісія». */
function records(acts, sc, toast) {
  const out = [], note = [sc?.title, phrase(toast)].filter(Boolean).join(' · ');
  const cashIn = acts.find(a => a.kind === 'tx' && a.account === 'cash' && a.type === 'in');
  const cardOut = acts.find(a => a.kind === 'tx' && a.account === 'card' && a.type === 'out');
  if (cashIn && cardOut && cardOut.amount > cashIn.amount && cardOut.amount - cashIn.amount <= Math.ceil(cashIn.amount * 0.05) + 1) {
    return [{ kind: 'transfer', from: 'card', to: 'cash', amount: cashIn.amount },
      { kind: 'tx', type: 'out', amount: cardOut.amount - cashIn.amount, account: 'card', category: 'Інше', note: 'Комісія банкомата' }];
  }
  for (const a of acts) {
    if (a.kind === 'transfer') { out.push(a); continue; }
    out.push({ ...a, category: category(a.type, sc, toast), note: note || 'з гри' });
  }
  return out;
}

module.exports = { scene, category, records, phrase };
