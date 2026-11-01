import { GOOD, STALE } from './pricestats';
/* «Що вигідно зараз», як на дашборді хабу: для кожного товару на складі — найкращий скупник,
   скільки дадуть за все, прибуток проти собівартості і чи ціна в зеленій зоні (≥ 80% діапазону). */
export interface BuyerPrice { buyer: string; item: string; price: number; min: number; max: number; at: string | null }
export interface Held { name: string; qty: number; boughtQty: number; boughtCost: number; avg: number }
export interface Advice {
  item: string; qty: number; buyer: string; price: number; value: number;
  profit: number | null;        // проти собівартості купленого; null — усе нафармлене
  pos: number | null;           // де ціна в межах скупника, 0–100; null — межі ще не вписані
  sell: boolean; stale: boolean;
  wait: boolean;                // ціна ближче до мінімуму (< WAIT % діапазону) — краще почекати (specs/030 US2)
}
export const WAIT = 40;

const key = (s: string) => s.trim().toLowerCase();

export function advise(held: Held[], prices: BuyerPrice[], now = Date.now()): Advice[] {
  const best = new Map<string, BuyerPrice>();
  for (const p of prices) {
    if (!(p.price > 0)) continue;
    const k = key(p.item), cur = best.get(k);
    if (!cur || p.price > cur.price) best.set(k, p);
  }
  const out: Advice[] = [];
  for (const h of held) {
    const b = best.get(key(h.name));
    if (!b) continue;
    const pos = b.max > b.min ? Math.round(Math.min(100, Math.max(0, ((b.price - b.min) / (b.max - b.min)) * 100))) : null;
    out.push({
      item: h.name, qty: h.qty, buyer: b.buyer, price: b.price, value: Math.round(h.qty * b.price),
      profit: h.boughtQty > 0 ? Math.round(h.boughtQty * (b.price - h.avg)) : null,
      pos, sell: pos !== null && pos >= GOOD, wait: pos !== null && pos < WAIT,
      stale: !b.at || now - new Date(b.at).getTime() > STALE,
    });
  }
  /* спершу те, що варто здати зараз, далі — дорожче */
  return out.sort((a, b) => Number(b.sell) - Number(a.sell) || b.value - a.value);
}

/* «Не купує жоден скупник»: те, що advise пропускає, — щоб склад не ховав товар мовчки.
   listed — скупник товар має, але ціни ще ніхто не вніс */
export interface Unsold { item: string; qty: number; cost: number; listed: boolean }
export function unsold(held: Held[], prices: BuyerPrice[]): Unsold[] {
  const priced = new Set(prices.filter(p => p.price > 0).map(p => key(p.item)));
  const listed = new Set(prices.map(p => key(p.item)));
  return held
    .filter(h => !priced.has(key(h.name)))
    .map(h => ({ item: h.name, qty: h.qty, cost: Math.round(h.boughtCost), listed: listed.has(key(h.name)) }))
    .sort((a, b) => a.item.localeCompare(b.item, 'uk'));
}

/* «Скупники платять найбільше»: товари, чия ціна зараз найближча до максимуму діапазону скупника */
export interface Top { item: string; buyer: string; price: number; max: number; pos: number; stale: boolean }
export function topPaying(prices: BuyerPrice[], n = 6, now = Date.now()): Top[] {
  return prices
    .filter(p => p.price > 0 && p.max > p.min)
    .map(p => ({ item: p.item, buyer: p.buyer, price: p.price, max: p.max, pos: Math.round(Math.min(100, Math.max(0, ((p.price - p.min) / (p.max - p.min)) * 100))), stale: !p.at || now - new Date(p.at).getTime() > STALE }))
    .sort((a, b) => Number(a.stale) - Number(b.stale) || b.pos - a.pos || b.price - a.price)
    .slice(0, n);
}

/* склад за цінами скупників: якщо здати все найкращому — за мінімумом, за ціною зараз і за максимумом його меж */
export function stockValue(held: Held[], prices: BuyerPrice[]) {
  let min = 0, now = 0, max = 0;
  for (const a of advise(held, prices)) {
    const b = prices.find(p => p.buyer === a.buyer && p.item.trim().toLowerCase() === a.item.trim().toLowerCase())!;
    now += a.value;
    min += Math.round(a.qty * (b.min || b.price));
    max += Math.round(a.qty * Math.max(b.max, b.price));
  }
  return { min, now, max };
}
