/* пошук у режимі «Ціни» плашки Alt+Q: товари зі скупниками, найкращий — першим */
export interface BarPrice { item: string; unit: string; icon: string; buyer: string; buyerIcon: string; price: number; min: number; max: number; at: string | null }
export interface Found { item: string; unit: string; icon: string; best: BarPrice | null; buyers: BarPrice[]; have: number }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`]/g, '').trim();

/* де ціна між межами скупника, 0–100; null — меж ще немає */
export const pos = (p: BarPrice) => (p.max > p.min && p.price > 0 ? Math.round(Math.min(100, Math.max(0, ((p.price - p.min) / (p.max - p.min)) * 100))) : null);

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
  /* порожній запит — те, що лежить на складі */
  if (!words.length) return [...by.values()].filter(f => f.have > 0).sort((a, b) => (b.best?.price ?? 0) * b.have - (a.best?.price ?? 0) * a.have).slice(0, limit);
  const score = (f: Found) => {
    const n = norm(f.item), hay = n + ' ' + f.buyers.map(b => norm(b.buyer)).join(' ');
    if (!words.every(w => hay.includes(w))) return -1;
    return (n.startsWith(words[0]) ? 2 : n.includes(words[0]) ? 1 : 0) + (f.have > 0 ? 0.5 : 0);
  };
  return [...by.values()].map(f => [f, score(f)] as const).filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].item.localeCompare(b[0].item, 'uk')).map(([f]) => f).slice(0, limit);
}
