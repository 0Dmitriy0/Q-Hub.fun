/* «Що продати?» у плашці Alt+Q без ШІ: що зі складу персонажа зараз дає найбільше грошей і кому це здати.
   Склад і ціни скупників — ті самі, що в режимі «Ціни» (barSearch.ts). */
import { search, type BarPrice } from './barSearch';

export interface Sell { item: string; unit: string; icon: string; qty: number; buyer: string; price: number; total: number;
  /* скільки дасть другий за ціною скупник — видно, чи варто їхати саме до найкращого */
  next: { buyer: string; price: number } | null }

/* питання про продаж складу: «що продати?», «що вигідно здати», «куди здати склад» */
export const isSellQuestion = (t: string) =>
  /(що|куди|кому|як).{0,20}(прода|зда[тмюєв])|прода(ти|м)\s+склад|що\s+вигідн/i.test(t) && !/\d/.test(t);

export function sellAdvice(prices: BarPrice[], stock: Record<string, number>, limit = 3): Sell[] {
  return search(prices, '', stock, 1000)
    .filter(f => f.best && f.best.price > 0 && f.have > 0)
    .map(f => {
      const second = f.buyers.find(b => b !== f.best && b.price > 0) ?? null;
      return { item: f.item, unit: f.unit, icon: f.icon, qty: f.have, buyer: f.best!.buyer, price: f.best!.price,
        total: Math.round(f.best!.price * f.have), next: second ? { buyer: second.buyer, price: second.price } : null };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
