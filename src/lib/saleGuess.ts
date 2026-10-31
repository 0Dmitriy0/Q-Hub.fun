/* Що продав скупнику автоматичний запис «Продаж фарму» (specs/030, research R3). Кількість вгадується лише тоді, коли ціна
   ділить суму без остачі: інакше — вибір вручну, а не вигадане число (принцип IV). Склад — товар → кількість (кг дробові). */

export interface SaleItem { item: string; price: number; unit?: string }
export interface SaleLine { item: string; qty: number; price: number; farm: number }
export type SaleGuess =
  | { kind: 'one' | 'all'; lines: SaleLine[] }
  | { kind: 'manual'; items: { item: string; price: number; have: number }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const isKg = (u?: string) => /кг|kg/i.test(u || '');

/* farm — скільки з qty дописати парою «Нафармив»: склад не йде в мінус (FR-002a) */
const line = (item: string, qty: number, price: number, have: number): SaleLine => ({ item, qty, price, farm: r2(Math.max(0, qty - have)) });

/* кількість, за якої price дає рівно amount; null — не ділиться (кг — до 0,01) */
function divides(amount: number, price: number, unit?: string): number | null {
  if (!(price > 0)) return null;
  if (!isKg(unit)) return amount % price === 0 ? amount / price : null;
  const q = r2(amount / price);
  return q > 0 && Math.abs(q * price - amount) <= 0.5 ? q : null;
}

export function saleGuess(amount: number, items: SaleItem[], stock: Record<string, number>): SaleGuess {
  const have = (i: string) => stock[i] || 0;
  const priced = items.filter(i => i.price > 0);
  /* «Продати все» (FR-002b): інші комбінації кількох товарів не підбираються */
  const held = priced.filter(i => have(i.item) > 0);
  if (held.length >= 2 && Math.abs(held.reduce((s, i) => s + have(i.item) * i.price, 0) - amount) <= 1)
    return { kind: 'all', lines: held.map(i => line(i.item, have(i.item), i.price, have(i.item))) };
  const fits = priced.map(i => ({ i, q: divides(amount, i.price, i.unit) })).filter((f): f is { i: SaleItem; q: number } => f.q !== null);
  /* суму ділить кілька товарів — не вгадувати навіть на користь складу: 1 шкура свині за 950 $ = 2 шкури кролика по 475 $,
     а свині на складі не було (жива гра 2026-11-01) */
  const pick = fits.length === 1 ? fits[0] : null;
  if (pick) return { kind: 'one', lines: [line(pick.i.item, pick.q, pick.i.price, have(pick.i.item))] };
  /* вибір вручну: спершу те, що є на складі; без товарів скупника — увесь склад */
  const list = items.length ? items.map(i => ({ item: i.item, price: i.price, have: have(i.item) }))
    : Object.keys(stock).filter(k => have(k) > 0).map(k => ({ item: k, price: 0, have: have(k) }));
  list.sort((a, b) => Number(b.have > 0) - Number(a.have > 0) || a.item.localeCompare(b.item, 'uk'));
  return { kind: 'manual', items: list };
}

/* ручний вибір: ціна — сума / кількість, тож списання проходить перевірку суми, навіть коли ціна в скупника щойно змінилась */
export const manualLine = (item: string, qty: number, amount: number, have: number): SaleLine => line(item, r2(qty), Math.round(amount / qty), have);
