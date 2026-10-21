/* Склад і прибуток з угод (та сама логіка, що в хабі).
   Купівля додає товар за ціною покупки; «отримав/нафармив» — без собівартості;
   продаж списує спершу куплене за середньою собівартістю, потім безкоштовне. */
export type Op = 'buy' | 'farm' | 'sell';
export interface Deal { id: string; op: Op; item: string; qty: number; price: number; ts: string | number; category?: string; receipt_id?: string | null }
export interface StockItem { name: string; boughtQty: number; boughtCost: number; freeQty: number; profit: number; freeIncome: number }
export interface Ledger { items: Record<string, StockItem>; resale: number; freeIncome: number; bought: number; sold: number; perDeal: Record<string, { profit: number; fromBought: number }> }

const q2 = (n: number) => Math.round(n * 100) / 100;

export function ledger(deals: Deal[]): Ledger {
  const items: Record<string, StockItem> = {};
  const perDeal: Ledger['perDeal'] = {};
  let resale = 0, freeIncome = 0, bought = 0, sold = 0;
  const sorted = deals.slice().sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  for (const d of sorted) {
    const it = items[d.item] ??= { name: d.item, boughtQty: 0, boughtCost: 0, freeQty: 0, profit: 0, freeIncome: 0 };
    const q = Number(d.qty), p = Number(d.price) || 0;
    if (d.op === 'buy') { it.boughtQty += q; it.boughtCost += q * p; bought += q * p; }
    else if (d.op === 'farm') { it.freeQty += q; }
    else {
      const fromBought = Math.min(q, it.boughtQty);
      const avg = it.boughtQty ? it.boughtCost / it.boughtQty : 0;
      const profit = fromBought * (p - avg);
      it.boughtCost -= fromBought * avg; it.boughtQty -= fromBought;
      if (it.boughtQty <= 0) { it.boughtQty = 0; it.boughtCost = 0; }
      it.freeQty -= Math.min(q - fromBought, it.freeQty);
      const fi = (q - fromBought) * p;          // продане без собівартості: усе — дохід
      it.profit += profit; it.freeIncome += fi;
      resale += profit; freeIncome += fi; sold += q * p;
      perDeal[d.id] = { profit, fromBought };
    }
    it.boughtQty = q2(it.boughtQty); it.freeQty = q2(it.freeQty);
    if (!it.boughtQty) it.boughtCost = 0;
  }
  return { items, resale, freeIncome, bought, sold, perDeal };
}

export function stock(L: Ledger) {
  return Object.values(L.items)
    .map(it => ({ ...it, qty: q2(it.boughtQty + it.freeQty), avg: it.boughtQty ? it.boughtCost / it.boughtQty : 0 }))
    .filter(it => it.qty > 0)
    .sort((a, b) => b.boughtCost - a.boughtCost || a.name.localeCompare(b.name, 'uk'));
}

export function balance(start: number, tx: { type: 'in' | 'out'; amount: number }[]) {
  return tx.reduce((s, t) => s + (t.type === 'in' ? 1 : -1) * Number(t.amount), Number(start) || 0);
}
