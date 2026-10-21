/* Стрічка «Останні оновлення»: усе, що один гравець вніс у одного скупника за один цикл цін,
   складається в один запис. Одна ціна лишається окремим рядком з ціною, кілька — списком назв. */
export interface Update { id: number; buyer_id: string; item_id: number; price: number; created_at: string; cycle?: string | null; reporter_name: string }
export interface UpdateGroup { key: string; who: string; buyer_id: string; at: string; items: Update[] }

export function groupUpdates(ups: Update[]): UpdateGroup[] {
  const by = new Map<string, UpdateGroup>();
  for (const u of ups) {
    const key = `${u.reporter_name}|${u.buyer_id}|${u.cycle ?? u.created_at.slice(0, 13)}`;
    const g = by.get(key);
    if (!g) by.set(key, { key, who: u.reporter_name, buyer_id: u.buyer_id, at: u.created_at, items: [u] });
    else { g.items.push(u); if (u.created_at > g.at) g.at = u.created_at; }
  }
  return [...by.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
