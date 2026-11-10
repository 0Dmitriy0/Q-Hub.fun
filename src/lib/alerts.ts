/* Сповіщення програми Q-Hub: «час здавати» (specs/075), івент за 10 хв (specs/076); і коли над плашкою показувати
   промокод Q-Hub (specs/077).
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

/* ---------- 077: промокод Q-Hub над плашкою — лише коли найближчим часом івентів немає ---------- */
export const PROMO_QUIET = 15 * MIN;   // івент іде або почнеться раніше — промокод ховається, щоб не заступати івент
export interface SitePromo { code: string; reward: string }
/* рядок public.site_promo (specs/022) → що показати; null — промокод вимкнено адміном, порожній чи з недопустимими знаками */
export function sitePromo(row: unknown): SitePromo | null {
  const r = row as { code?: unknown; reward?: unknown; enabled?: unknown } | null;
  if (!r || typeof r !== 'object' || r.enabled === false || typeof r.code !== 'string') return null;
  const code = r.code.trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) return null;
  return { code, reward: typeof r.reward === 'string' ? r.reward.trim().slice(0, 200) : '' };
}
/* команда для чату гри — її гравець вставляє сам (програма в грі нічого не вводить) */
export const promoCommand = (code: string) => `/promo ${code.toLowerCase()}`;
/* чи показувати промокод зараз: жоден івент не йде й не почнеться за PROMO_QUIET */
export function promoShown(now: number, quiet = PROMO_QUIET): boolean {
  return !eventStatus(now).some(s => s.now || (s.next && s.next.s - now <= quiet));
}
