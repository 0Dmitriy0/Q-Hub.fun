/* порядок підгруп у списку скупника (specs/028): основна — першою, решта за абеткою. Основна — та, що зветься як
   скупник («Шкури» у «Шкур»), інакше найчисленніша, при нічиїй — перша за абеткою. Товар без підгрупи йде з основною */
export function subRanks(buyer: string, subs: string[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const s of subs) if (s) n.set(s, (n.get(s) || 0) + 1);
  const all = [...n.keys()].sort((a, b) => a.localeCompare(b, 'uk'));
  const name = buyer.trim().toLowerCase();
  const main = all.find(s => s.toLowerCase() === name) ?? all.reduce<string | undefined>((m, s) => (m === undefined || n.get(s)! > n.get(m)! ? s : m), undefined);
  const r = new Map<string, number>([['', 0]]);
  let i = 1;
  for (const s of all) r.set(s, s === main ? 0 : i++);
  return r;
}

/* ранг товару; підгрупа, якої не було серед товарів скупника (старий кеш), — з основною */
export const subRank = (ranks: Map<string, number> | undefined, sub: string | undefined) => ranks?.get(sub || '') ?? 0;
