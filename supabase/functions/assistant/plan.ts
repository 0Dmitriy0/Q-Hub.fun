/* ШІ-помічник програми (Alt+Q): з тексту гравця й даних його персонажа — коротка відповідь і план дій.
   Тут немає ні Deno, ні мережі: функція (index.ts) лише збирає дані й кличе модель, а це — промпт,
   схема відповіді й перевірка дій перед тим, як програма покаже їх гравцю. Записує програма — після Enter. */

export const TX_CATS = {
  in: ['Робота', "Квести сім'ї", 'Продаж авто', 'Оренда', 'Бізнес', 'Казино / ставки', 'Перекуп', 'Продаж фарму', 'Інше'],
  out: ['Авто / тюнінг', 'Ліцензії', 'Податки', 'Одяг', 'Бізнес', 'Перекуп', 'Комісія маркету', 'Оренда', 'Інше'],
} as const;
const OPS = { buy: 'Купив', farm: 'Отримав', sell: 'Продав' } as const;
/* рахунок за категорією, як у src/lib/cats.ts: зарплата, квести, оренда, бізнес і держплатежі — банком */
const CARD_CATS = new Set<string>(['Робота', "Квести сім'ї", 'Оренда', 'Бізнес', 'Податки', 'Ліцензії', 'Комісія маркету']);
export type Account = 'cash' | 'card';
type Op = keyof typeof OPS;

export interface DealIn { op: Op; item: string; qty: number; price: number; ts: string }
export interface PriceIn { buyer: string; item: string; price: number; min: number; max: number }
/* запис обліку, який можна виправити чи видалити; ref — номер у списку для моделі (#1 — найновіший) */
export interface TxRec { id: string; type: 'in' | 'out'; amount: number; category: string; note: string; ts: string; account?: Account; source: string }
export interface Ctx { character: string; balance: number; cash?: number; card?: number; deals: DealIn[]; prices: PriceIn[]; recent?: TxRec[] }

export interface TxAction { kind: 'tx'; type: 'in' | 'out'; amount: number; category: string; note: string; account: Account }
export interface TransferAction { kind: 'transfer'; from: Account; to: Account; amount: number }
export interface DealAction { kind: 'deal'; op: Op; item: string; qty: number; price: number; tx: Omit<TxAction, 'kind' | 'account'> | null }
/* виправити чи видалити наявний запис: rec — яким він є зараз (щоб гравець бачив «було → стане») */
export type TxPatch = Partial<Pick<TxRec, 'type' | 'amount' | 'category' | 'note' | 'account'>>;
export interface EditAction { kind: 'edit'; id: string; rec: TxRec; set: TxPatch }
export interface DeleteAction { kind: 'delete'; id: string; rec: TxRec }
export type Action = TxAction | DealAction | TransferAction | EditAction | DeleteAction;
export interface Plan { reply: string; actions: Action[] }

export const SYSTEM = `Ти — помічник у програмі Q-Hub для гравців GTA RP-сервера QuantRP. Гравець натискає Alt+Q поверх гри й пише одним рядком, що сталося або що він хоче знати.

Твоя відповідь — JSON за схемою: reply і actions.
- reply: одне-два короткі речення українською, як друг у грі. Якщо гравець щось записує — коротко підтверди, що саме буде записано. Якщо питає — відповідай на основі даних нижче (склад, ціни скупників, баланс). Не вигадуй цін і товарів, яких немає в даних; якщо даних бракує — так і скажи.
- Питання про правила сервера чи закони штату (що можна й не можна, покарання, штрафи, терміни, DM/PG/MG/RK…) — відповідай лише з «Пунктів правил сервера й законів штату» нижче: суть і покарання, до чотирьох речень. Кожне твердження — з документом і номером у дужках, як у пункті: «(Правила Зелених Зон, п. 1.1)», «(Кримінальний кодекс, ст. 6.5)». Розрізняй: «Правила сервера» — порушення карає адміністрація (варн, деморган, бан); «Закон штату» — кара в самій грі (штраф, арешт, суд); «Довідка» — F.A.Q. форуму про те, як щось працює в грі (роботи, заробіток, нерухомість): це пояснення, а не заборона, за неї не карають — відповідай по суті й назви джерело «(F.A.Q. Роботи на сервері)». Якщо підходять обидва — скажи окремо, що порушено з правил сервера і що з законів штату. Гравці питають сленгом, а пункти написані офіційно: капт — захоплення території, бізвар — війна за бізнес (захоплення бізнесу), забити (бізвар, капт, стрілу) — запланувати чи оголосити, тачка — транспорт, нацгвардія — NG, поновлення — відновлення, запис чи відео — відеозапис. Перш ніж сказати, що не знайшов, перечитай усі пункти: відповідь часто в пункті іншими словами. Якщо пунктів немає або вони не про це — прямо скажи, що в правилах і законах цього не знайшов, і порадь подивитися на форумі forum.quant5.com.ua. Номерів пунктів і статей, покарань і сум штрафів з пам'яті не вигадуй.
- actions: що записати. Гравець побачить їх і підтвердить Enter, тож пропонуй лише те, що він явно сказав.
  • kind "deal" — операція з товаром: op "buy" (купив), "farm" (нафармив, отримав безкоштовно), "sell" (продав). item — назва товару, бажано точно як у цінах скупників; qty — кількість; price — ціна за ОДНУ штуку в $ (для farm — 0). Якщо гравець назвав суму за все — поділи на кількість. Якщо продав і ціну не назвав — візьми найкращу ціну скупника з даних і скажи це в reply.
  • kind "tx" — гроші без товару: type "in" (дохід) або "out" (витрата), amount — сума в $, category — одна з категорій нижче, note — коротко що це, account — "card" (картка / банк) або "cash" (готівка), якщо гравець сказав; не сказав — null.
  • kind "transfer" — переказ між своїми рахунками («зняв 200к з картки» → account "card"; «поклав 100к на картку» → account "cash"): account — звідки, amount — сума. Це не прибуток і не витрата.
  • kind "edit" — виправити запис з «Останніх записів обліку», лише коли гравець прямо просить виправити чи змінити: ref — номер запису (#N → N); у type/amount/category/note/account — лише те, що змінюється, решта null. Суму записів угод (джерело «угода») не змінюй — скажи в reply, що такий запис треба видалити й записати заново.
  • kind "delete" — видалити запис з «Останніх записів обліку», лише коли гравець прямо просить: ref — номер. Запис угоди видаляється разом з угодою (товар зникне зі складу), переказ — обома половинами; скажи це в reply.
  • Питання, порада, «що вигідно здати» — actions порожній.
Гроші: «к» = тисяча, «кк» = мільйон (450к = 450000, 1,5кк = 1500000). Поля, що не стосуються дії, — null.

Категорії доходу: ${TX_CATS.in.join(', ')}.
Категорії витрат: ${TX_CATS.out.join(', ')}.`;

const str = { type: 'string' }, num = { type: 'number' }, nul = { type: 'null' };
const opt = (t: object) => ({ anyOf: [t, nul] });
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: str,
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'op', 'item', 'qty', 'price', 'type', 'amount', 'category', 'note', 'account', 'ref'],
        properties: {
          kind: { type: 'string', enum: ['deal', 'tx', 'transfer', 'edit', 'delete'] },
          ref: opt({ type: 'integer' }),
          op: opt({ type: 'string', enum: ['buy', 'farm', 'sell'] }), item: opt(str), qty: opt(num), price: opt(num),
          type: opt({ type: 'string', enum: ['in', 'out'] }), amount: opt(num), category: opt(str), note: opt(str),
          account: opt({ type: 'string', enum: ['cash', 'card'] }),
        },
      },
    },
  },
} as const;

/* склад з угод: купівля — за ціною, отримане — безкоштовно, продаж списує спершу куплене (як src/lib/ledger.ts) */
export function holdings(deals: DealIn[]) {
  const m = new Map<string, { qty: number; bought: number; cost: number }>();
  for (const d of [...deals].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const it = m.get(d.item) ?? { qty: 0, bought: 0, cost: 0 }; m.set(d.item, it);
    if (d.op === 'buy') { it.qty += d.qty; it.bought += d.qty; it.cost += d.qty * d.price; }
    else if (d.op === 'farm') it.qty += d.qty;
    else {
      const fromBought = Math.min(d.qty, it.bought), avg = it.bought ? it.cost / it.bought : 0;
      it.bought -= fromBought; it.cost -= fromBought * avg; it.qty = Math.max(0, it.qty - d.qty);
    }
  }
  return [...m].filter(([, v]) => v.qty > 0.001).map(([item, v]) => ({ item, qty: Math.round(v.qty * 100) / 100, bought: v.bought, avg: v.bought ? Math.round(v.cost / v.bought) : 0 }));
}

const money = (n: number) => Math.round(n).toLocaleString('uk-UA').replace(/ /g, ' ') + ' $';

/* дані для моделі: персонаж, склад, ціни скупників (до 3 найкращих на товар) */
/* пункти правил сервера й законів штату від програми (вона шукає їх під питання, specs/010) — окремим блоком перед текстом гравця;
   у кожного рядка тип джерела: «[Правила сервера · …, п. 1.1]», «[Закон штату · …, ст. 6.5]» */
export function rulesBlock(rules: unknown): string {
  /* програма до «Довідки» (до 2026-10-30) не знає цього типу й пише «[undefined · …]» — це довідка */
  const r = typeof rules === 'string' ? rules.trim().slice(0, 8000).replace(/\[undefined · /g, '[Довідка · ') : '';
  return r ? `Пункти правил сервера й законів штату QuantRP, що можуть стосуватися питання:
${r}

` : '';
}

/* SC-003: номер пункту чи статті у відповіді — лише той, що є у витягу (у дужках «[…, п. 1.1]» чи в тексті пункту
   «пункт 6.31»). Вигаданий прибирається разом із комою перед ним: «(Кримінальний кодекс, ст. 9.9)» → «(Кримінальний кодекс)».
   Без витягу (питання про облік) — відповідь як є */
const NUMS = String.raw`\d+(?:\.\d+)*(?:\s*(?:,|і|та|–|-)\s*\d+(?:\.\d+)*)*`;
export function checkRefs(reply: string, rules: unknown): string {
  if (typeof rules !== 'string' || !rules.trim()) return reply;
  const known = new Set([...rules.matchAll(/(?:п\.|ст\.|пункт\p{L}*|статт\p{L}*)\s*(\d+(?:\.\d+)*)/giu)].map(m => m[1]));
  return reply.replace(new RegExp(`(,\\s*)?(?<!\\p{L})(п|ст)\\.\\s*(${NUMS})`, 'gu'), (m, comma = '', k: string, list: string) => {
    const ns = list.split(/\s*(?:,|і|та|–|-)\s*/u), ok = ns.filter(n => known.has(n));
    return ok.length === ns.length ? m : ok.length ? `${comma}${k}. ${ok.join(', ')}` : '';
  }).replace(/\s*\(\s*\)/g, '').replace(/ {2,}/g, ' ').trim();
}

export function context(c: Ctx): string {
  const held = holdings(c.deals);
  const byItem = new Map<string, PriceIn[]>();
  for (const p of c.prices) if (p.price > 0) byItem.set(p.item, [...(byItem.get(p.item) ?? []), p]);
  const prices = [...byItem].sort(([a], [b]) => a.localeCompare(b, 'uk')).map(([item, ps]) =>
    `${item}: ` + ps.sort((a, b) => b.price - a.price).slice(0, 3)
      .map(p => `${p.buyer} ${money(p.price)}${p.max > p.min ? ` (межі ${money(p.min)}–${money(p.max)})` : ''}`).join('; '));
  return [
    `Персонаж: ${c.character}. Баланс в обліку: ${money(c.balance)}${c.cash !== undefined && c.card !== undefined ? ` (готівка ${money(c.cash)}, картка ${money(c.card)})` : ''}.`,
    `Склад: ${held.length ? held.map(h => `${h.item} × ${h.qty}${h.bought ? ` (куплено ${h.bought} по ${money(h.avg)})` : ''}`).join('; ') : 'порожній'}.`,
    `Ціни скупників зараз:\n${prices.join('\n') || 'немає даних'}`,
    `Останні записи обліку (#1 — найновіший):\n${(c.recent ?? []).map((t, i) => `#${i + 1} · ${recLine(t)}`).join('\n') || 'немає'}`,
  ].join('\n');
}

const SRC: Record<string, string> = { deal: 'угода', transfer: 'переказ', reconcile: 'звірка', desktop: 'Alt+Q', manual: 'кабінет', import: 'імпорт' };
const when = (ts: string) => new Date(ts).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/* «23.10, 05:12 · +30 000 $ · Робота · картка · «зп» · угода» — і для моделі, і для гравця («було → стане») */
export function recLine(t: TxRec) {
  return `${when(t.ts)} · ${t.type === 'in' ? '+' : '−'}${money(t.amount)} · ${t.category} · ${t.account === 'card' ? 'картка' : 'готівка'}${t.note ? ` · «${t.note}»` : ''}${SRC[t.source] && t.source !== 'manual' && t.source !== 'desktop' ? ` · ${SRC[t.source]}` : ''}`;
}

/* перевірка того, що повернула модель: лише валідні дії з додатними числами; назву товару — як у каталозі */
export function clean(raw: unknown, c: Ctx): Plan {
  const r = (raw ?? {}) as { reply?: unknown; actions?: unknown };
  const reply = typeof r.reply === 'string' ? r.reply.trim().slice(0, 700) : '';   // відповідь про правила — з пунктом і покаранням, довша
  const names = new Map<string, string>();
  for (const n of [...c.prices.map(p => p.item), ...c.deals.map(d => d.item)]) names.set(n.trim().toLowerCase(), n);
  const held = new Map(holdings(c.deals).map(h => [h.item, h]));
  const actions: Action[] = [];
  for (const a of (Array.isArray(r.actions) ? r.actions : []).slice(0, 5) as Record<string, unknown>[]) {
    const n = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
    if (a.kind === 'tx' && (a.type === 'in' || a.type === 'out')) {
      const amount = Math.round(n(a.amount));
      if (!amount) continue;
      const cats: readonly string[] = TX_CATS[a.type];
      const category = cats.includes(a.category as string) ? a.category as string : 'Інше';
      actions.push({ kind: 'tx', type: a.type, amount, category, note: typeof a.note === 'string' ? a.note.trim().slice(0, 200) : '',
        account: a.account === 'card' || a.account === 'cash' ? a.account : CARD_CATS.has(category) ? 'card' : 'cash' });
    } else if (a.kind === 'transfer' && (a.account === 'card' || a.account === 'cash')) {
      const amount = Math.round(n(a.amount));
      if (amount) actions.push({ kind: 'transfer', from: a.account, to: a.account === 'card' ? 'cash' : 'card', amount });
    } else if (a.kind === 'edit' || a.kind === 'delete') {
      /* лише запис зі списку, який бачила модель: номер → справжній id (вигаданий чи чужий номер — відкидається) */
      const rec = Number.isInteger(a.ref) ? c.recent?.[(a.ref as number) - 1] : undefined;
      if (!rec || actions.some(x => (x.kind === 'edit' || x.kind === 'delete') && x.id === rec.id)) continue;
      if (a.kind === 'delete') { actions.push({ kind: 'delete', id: rec.id, rec }); continue; }
      const set: TxPatch = {};
      /* у записі угоди сума й тип прив'язані до кількості й ціни товару; у переказі — лише сума й нотатка */
      const locked = rec.source === 'deal', move = rec.source === 'transfer';
      if (!locked && !move && (a.type === 'in' || a.type === 'out') && a.type !== rec.type) set.type = a.type;
      if (!locked && n(a.amount) && Math.round(n(a.amount)) !== rec.amount) set.amount = Math.round(n(a.amount));
      const type = set.type ?? rec.type, cats: readonly string[] = TX_CATS[type];
      if (!locked && !move && typeof a.category === 'string' && cats.includes(a.category) && a.category !== rec.category) set.category = a.category;
      if (set.type && !set.category && !cats.includes(rec.category)) set.category = 'Інше';
      if (typeof a.note === 'string' && a.note.trim() !== rec.note) set.note = a.note.trim().slice(0, 200);
      if (!move && (a.account === 'cash' || a.account === 'card') && a.account !== (rec.account ?? 'cash')) set.account = a.account;
      if (Object.keys(set).length) actions.push({ kind: 'edit', id: rec.id, rec, set });
    } else if (a.kind === 'deal' && (a.op === 'buy' || a.op === 'farm' || a.op === 'sell') && typeof a.item === 'string' && a.item.trim()) {
      const op = a.op, qty = Math.round(n(a.qty) * 100) / 100, price = op === 'farm' ? 0 : Math.round(n(a.price));
      if (!qty || (op !== 'farm' && !price)) continue;
      const item = names.get(a.item.trim().toLowerCase()) ?? a.item.trim().slice(0, 60);
      /* облік — як у «Угодах» кабінету: купівля — витрата «Перекуп», продаж купленого — «Перекуп», нафармленого — «Продаж фарму» */
      const tx = op === 'farm' ? null : {
        type: op === 'buy' ? 'out' as const : 'in' as const, amount: Math.round(qty * price),
        category: op === 'buy' || (held.get(item)?.bought ?? 0) > 0 ? 'Перекуп' : 'Продаж фарму',
        note: `${OPS[op]}: ${item} × ${qty} по ${money(price)}`,
      };
      actions.push({ kind: 'deal', op, item, qty, price, tx });
    }
  }
  return { reply: reply || (actions.length ? 'Ось що запишу:' : 'Не зрозумів — спробуй інакше.'), actions };
}
