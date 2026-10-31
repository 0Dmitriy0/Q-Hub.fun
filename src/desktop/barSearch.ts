/* пошук у режимі «Ціни» плашки Alt+Q: гравець називає скупника («скупщик шкур», «риба») — плашка відкриває його товари з цінами.
   Назвав товар, а не скупника, — ті скупники, що його беруть, дорожчий першим */
import { subRank, subRanks } from '../lib/subOrder';

/* sub — підгрупа товару («Шкури» / «М'ясо»), стара програма її не віддає */
export interface BarPrice { item: string; unit: string; icon: string; buyer: string; buyerIcon: string; price: number; min: number; max: number; at: string | null; sub?: string }
export interface Found { item: string; unit: string; icon: string; best: BarPrice | null; buyers: BarPrice[]; have: number }
export interface BuyerHit { buyer: string; icon: string; items: (BarPrice & { have: number })[] }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`]/g, '').trim();
/* «скупщик», «скупник», «скупка» — не частина назви */
const FILLER = /^скуп/;
/* основа слова: «шкур» знайде «Шкури», «рибу» — «Риба» */
const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));

/* де ціна між межами скупника, 0–100; null — меж ще немає */
export const pos = (p: BarPrice) => (p.max > p.min && p.price > 0 ? Math.round(Math.min(100, Math.max(0, ((p.price - p.min) / (p.max - p.min)) * 100))) : null);

export function buyers(prices: BarPrice[], q: string, stock: Record<string, number>, limit = 8): BuyerHit[] {
  const words = norm(q).split(/\s+/).filter(w => w && !FILLER.test(w)).map(stem);
  if (!words.length) return [];
  const by = new Map<string, BuyerHit>();
  for (const p of prices) {
    const b = by.get(p.buyer) ?? { buyer: p.buyer, icon: p.buyerIcon, items: [] };
    b.items.push({ ...p, have: stock[p.item] ?? 0 });
    by.set(p.buyer, b);
  }
  const has = (s: string) => words.every(w => norm(s).includes(w));
  /* 3 — збіг назви скупника, 1 — скупник бере названий товар (тоді вище той, хто платить більше) */
  const scored = [...by.values()].map(b => {
    if (has(b.buyer)) return { b, s: 3, top: 0 };
    const it = b.items.filter(i => has(i.item));
    return { b, s: it.length ? 1 : -1, top: Math.max(0, ...it.map(i => i.price)) };
  }).filter(x => x.s >= 0);
  /* спершу те, що на складі; в обох частинах — основна підгрупа, потім решта (м'ясо після шкур, specs/028) */
  for (const { b } of scored) {
    const r = subRanks(b.buyer, b.items.map(i => i.sub || ''));
    b.items.sort((x, y) => (y.have > 0 ? 1 : 0) - (x.have > 0 ? 1 : 0) || subRank(r, x.sub) - subRank(r, y.sub) || x.item.localeCompare(y.item, 'uk'));
  }
  return scored.sort((a, b) => b.s - a.s || b.top - a.top || a.b.buyer.localeCompare(b.b.buyer, 'uk')).map(x => x.b).slice(0, limit);
}

/* товари зі скупниками, найкращий — першим; порожній запит — те, що лежить на складі (для «що продати?», sellAdvice.ts) */
export function search(prices: BarPrice[], q: string, stock: Record<string, number>, limit = 40): Found[] {
  const by = new Map<string, Found>();
  for (const p of prices) {
    const f = by.get(p.item) ?? { item: p.item, unit: p.unit, icon: p.icon, best: null, buyers: [], have: stock[p.item] ?? 0 };
    f.buyers.push(p);
    if (p.price > 0 && (!f.best || p.price > f.best.price)) f.best = p;
    by.set(p.item, f);
  }
  for (const f of by.values()) f.buyers.sort((a, b) => b.price - a.price);
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [...by.values()].filter(f => f.have > 0).sort((a, b) => (b.best?.price ?? 0) * b.have - (a.best?.price ?? 0) * a.have).slice(0, limit);
  const score = (f: Found) => {
    const n = norm(f.item), hay = n + ' ' + f.buyers.map(b => norm(b.buyer)).join(' ');
    if (!words.every(w => hay.includes(w))) return -1;
    return (n.startsWith(words[0]) ? 2 : n.includes(words[0]) ? 1 : 0) + (f.have > 0 ? 0.5 : 0);
  };
  return [...by.values()].map(f => [f, score(f)] as const).filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].item.localeCompare(b[0].item, 'uk')).map(([f]) => f).slice(0, limit);
}

/* місця на мапі для рядка Alt+Q (specs/014 FR-007): «заправка», «24/7», «де лікарня» — мітки за назвою мітки чи категорії.
   Клік по місцю відкриває мапу Q-Hub з цією міткою в центрі */
export interface PlaceMark { id: string; name: string; category: string; x: number; y: number; icon?: string }
export interface PlaceCat { id: string; name: string; icon: string }
export interface PlaceHit { id: string; name: string; cat: string; icon: string; x: number; y: number }
/* слова запиту, що не є назвою місця */
const PLACE_FILLER = /^(де|где|знайти|знайди|покажи|показати|мапа|мапі|карта|карті|на|найближча|найближчий|найближче)$/;

export function places(q: string, marks: PlaceMark[], cats: PlaceCat[], limit = 6): PlaceHit[] {
  const words = norm(q).split(/\s+/).filter(w => w && !PLACE_FILLER.test(w)).map(stem);
  if (!words.length) return [];
  const cat = new Map(cats.map(c => [c.id, c]));
  const has = (s: string) => words.every(w => norm(s).includes(w));
  /* збіг назви мітки — вище за збіг лише категорії («Заправка №3» перед будь-якою заправкою) */
  const out: (PlaceHit & { s: number })[] = [];
  for (const m of marks) {
    const c = cat.get(m.category); if (!c) continue;
    const s = has(m.name) ? 2 : has(m.name + ' ' + c.name) ? 1 : 0;
    if (s) out.push({ id: m.id, name: m.name || c.name, cat: c.name, icon: m.icon || c.icon, x: m.x, y: m.y, s });
  }
  return out.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name, 'uk')).slice(0, limit).map(({ s: _s, ...h }) => h);
}
