/* Сповіщення програми Q-Hub (specs/075–077): «час здавати», івент за 10 хв, таймер оголошення на маркеті.
   Лише чисті функції: що сповістити зараз і що запам'ятати. Час (`now`) завжди передається — так це перевіряється тестом.
   Показує сповіщення й зберігає стан головний процес (desktop/src/main.cjs), куди цей файл збирається як lib/alerts.cjs
   (vite.lib.config.ts). Поріг «вигідно» й вік ціни — ті самі, що на сайті (advise, GOOD, STALE). */
import { advise, type Advice, type BuyerPrice, type Held } from './advice';
import { dur, EVENTS, eventStatus, kyHM } from './events';
import { money } from './format';

export interface Note { title: string; body: string }
const MIN = 60e3;
/* «1 товар, 2 товари, 5 товарів» */
export const plural = (n: number, [one, few, many]: [string, string, string]) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

/* ---------- 075: «час здавати» — товари, за якими гравець стежить (складу в програмі немає, specs/040) ---------- */
export const SELL_GAP = 30 * MIN;   // про один товар — не частіше
export const WATCH_MAX = 50;
export type ItemId = number | string;
export interface WatchPrice extends BuyerPrice { itemId: ItemId }
/* low — після сповіщення ціна падала нижче «вигідно»: наступне зростання — нова подія, навіть з тією самою ціною */
export type SellSent = Record<string, { at: number; price: number; buyer: string; low?: boolean }>;

const validId = (id: unknown): id is ItemId => (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && id.length > 0 && id.length <= 64);
/* список «стежу» з налаштувань: лише правильні id, без повторів, не більше WATCH_MAX */
export function watchList(v: unknown): ItemId[] {
  const out: ItemId[] = [];
  for (const id of Array.isArray(v) ? v : []) if (validId(id) && !out.some(x => String(x) === String(id))) out.push(id);
  return out.slice(0, WATCH_MAX);
}
/* дзвіночок: є — зняти, немає — додати; список повний чи id хибний — без змін */
export function watchToggle(list: ItemId[], id: unknown): ItemId[] {
  if (!validId(id)) return list;
  if (list.some(x => String(x) === String(id))) return list.filter(x => String(x) !== String(id));
  return list.length >= WATCH_MAX ? list : [...list, id];
}

export function sellNote(fire: Advice[]): Note | null {
  if (!fire.length) return null;
  if (fire.length === 1) { const a = fire[0]; return { title: `Час здавати: ${a.item}`, body: `Скупник «${a.buyer}»: ${money(a.price)} — ${a.pos}% діапазону.` }; }
  const lines = fire.slice(0, 3).map(a => `${a.item} — ${money(a.price)} у «${a.buyer}» (${a.pos}%)`);
  if (fire.length > 3) lines.push(`і ще ${fire.length - 3}`);
  return { title: `Час здавати: ${fire.length} ${plural(fire.length, ['товар', 'товари', 'товарів'])}`, body: lines.join('\n') };
}
/* що сповістити зараз: найкраща ціна позначеного товару у зеленій зоні й свіжа; не частіше SELL_GAP на товар,
   і не вдруге про ту саму ціну в того самого скупника. changed — sent треба зберегти */
export function sellDue(watch: ItemId[], prices: WatchPrice[], sent: SellSent, now: number): { note: Note | null; fire: Advice[]; sent: SellSent; changed: boolean } {
  const ids = new Set(watch.map(String)), idOf = new Map<string, string>(), held: Held[] = [];
  for (const p of prices) {
    const id = String(p.itemId), k = p.item.trim().toLowerCase();
    if (!ids.has(id) || idOf.has(k)) continue;
    idOf.set(k, id); held.push({ name: p.item, qty: 1, boughtQty: 0, boughtCost: 0, avg: 0 });
  }
  const next: SellSent = {}; let changed = false;
  for (const [id, v] of Object.entries(sent || {})) if (ids.has(id)) next[id] = v; else changed = true;
  const fire: Advice[] = [];
  for (const a of advise(held, prices, now)) {
    const id = idOf.get(a.item.trim().toLowerCase())!, prev = next[id];
    if (a.pos === null || a.stale) continue;   // без меж чи стара ціна — нічого не знаємо, пам'ять не чіпаємо
    if (!a.sell) { if (prev && !prev.low) { next[id] = { ...prev, low: true }; changed = true; } continue; }
    if (prev && now - prev.at < SELL_GAP) continue;
    if (prev && !prev.low && prev.price === a.price && prev.buyer === a.buyer) continue;
    next[id] = { at: now, price: a.price, buyer: a.buyer }; changed = true; fire.push(a);
  }
  return { note: sellNote(fire), fire, sent: changed ? next : sent, changed };
}

/* ---------- 076: нагадування про івенти ---------- */
export const EVENT_LEAD = 10 * MIN;   // за скільки до старту
export const EVENT_JOIN = 3 * MIN;    // івенти, що стартують майже разом (Лотерея :00, Перегони :02), — одне сповіщення
export const EVENT_LIST = EVENTS.map(e => ({ id: e.id, name: e.name, sched: e.sched }));
/* вибір гравця з налаштувань: лише відомі івенти, без повторів, у порядку розкладу */
export function eventIds(v: unknown): string[] {
  const got = new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  return EVENTS.map(e => e.id).filter(id => got.has(id));
}
/* sent — для кожного івенту старт, про який уже сповіщено */
export type EventSent = Record<string, number>;
export function eventDue(ids: string[], sent: EventSent, now: number): { note: Note | null; sent: EventSent } {
  const open = eventStatus(now).filter(s => ids.includes(s.ev.id) && s.next && (sent || {})[s.ev.id] !== s.next.s).map(s => ({ ev: s.ev, s: s.next!.s }));
  if (!open.some(o => o.s - now <= EVENT_LEAD)) return { note: null, sent };
  const fire = open.filter(o => o.s - now <= EVENT_LEAD + EVENT_JOIN).sort((a, b) => a.s - b.s);
  const next = { ...sent };
  for (const o of fire) next[o.ev.id] = o.s;
  const note = fire.length === 1
    ? { title: `${fire[0].ev.name} — через ${dur(fire[0].s - now)}`, body: `Початок о ${kyHM(fire[0].s)} за Києвом.` }
    : { title: `Скоро івенти: ${fire.map(o => o.ev.name).join(', ')}`, body: fire.map(o => `${o.ev.name} — о ${kyHM(o.s)}, через ${dur(o.s - now)}`).join('\n') };
  return { note, sent: next };
}

/* ---------- 077: таймер оголошення на маркеті ---------- */
export const MARKET_MIN = 1, MARKET_MAX = 48;
export const MARKET_WARN = 60 * MIN;        // «лишилась година»
export const MARKET_KEEP = 7 * 24 * 60 * MIN;   // завершений таймер, який не закрили, прибирається сам
const LATE = 2 * MIN;                       // кінець настав раніше — програма тоді не працювала
export interface MarketTimer { hours: number; ends: number; warned: boolean; done: boolean }
export const MARKET_HINT = `Від ${MARKET_MIN} до ${MARKET_MAX} годин`;

/* години з поля вводу: лише ціле від 1 до 48 */
export function marketHours(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,2}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= MARKET_MIN && n <= MARKET_MAX ? n : null;
}
/* таймер на годину «лишилась година» не сповіщає — це збіглося б із запуском */
export const marketStart = (hours: number, now: number): MarketTimer => ({ hours, ends: now + hours * 60 * MIN, warned: hours * 60 * MIN <= MARKET_WARN, done: false });
export const marketValid = (t: unknown): t is MarketTimer => !!t && typeof t === 'object' && Number.isFinite((t as MarketTimer).ends) && Number.isFinite((t as MarketTimer).hours);
/* що сповістити зараз; t — таймер з новими відмітками (зберегти, якщо kind не null) */
export function marketDue(t: MarketTimer, now: number): { t: MarketTimer; kind: 'warn' | 'done' | null; late: boolean } {
  if (!t.done && now >= t.ends) return { t: { ...t, warned: true, done: true }, kind: 'done', late: now - t.ends > LATE };
  if (!t.done && !t.warned && t.ends - now <= MARKET_WARN) return { t: { ...t, warned: true }, kind: 'warn', late: false };
  return { t, kind: null, late: false };
}
/* who — ім'я персонажа, коли їх кілька */
export function marketNote(kind: 'warn' | 'done', t: MarketTimer, now: number, late = false, who = ''): Note {
  const tail = who ? ` Персонаж: ${who}.` : '';
  if (kind === 'warn') {
    const left = t.ends - now;
    return { title: left > 55 * MIN ? 'Оголошення на маркеті: лишилась 1 година' : `Оголошення на маркеті: лишилось ${dur(left)}`, body: `Закінчиться о ${kyHM(t.ends)} за Києвом.${tail}` };
  }
  return { title: 'Оголошення на маркеті завершилось', body: (late ? `Закінчилось о ${kyHM(t.ends)} за Києвом, поки Q-Hub не працював.` : 'Забери товар або вистав його знову.') + tail };
}
/* «ще 5 год 12 хв» для вкладки над плашкою; null — час вийшов */
export const marketLeft = (ends: number, now: number): string | null => (now >= ends ? null : 'ще ' + dur(ends - now));
/* таймери з налаштувань: без битих, без видалених персонажів (chars — відомі id; null — список невідомий), без давно завершених */
export function marketPrune(all: unknown, chars: string[] | null, now: number): Record<string, MarketTimer> {
  const out: Record<string, MarketTimer> = {};
  for (const [id, t] of Object.entries(all && typeof all === 'object' ? all : {})) {
    if (!marketValid(t) || (chars && !chars.includes(id)) || now - t.ends > MARKET_KEEP) continue;
    out[id] = { hours: t.hours, ends: t.ends, warned: !!t.warned, done: !!t.done };
  }
  return out;
}
