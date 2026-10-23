/* Стрічка «Останні оновлення»: усе, що один гравець вніс у одного скупника одним заходом
   (між сусідніми внесеннями не більше 30 хв), складається в один запис.
   Одна ціна показується з ціною, кілька — списком назв. */
export interface Update {
  id: number; buyer_id: string; item_id: number; price: number; created_at: string;
  reporter_name: string; reporter_game?: string | null; reporter_static?: number | null;
}
export interface UpdateGroup { key: string; who: string; stat: number | null; buyer_id: string; at: string; items: Update[] }

export const GAP = 30 * 60000;
/* хто вніс: нік персонажа (з Discord — лише якщо ніку ще немає) і статік */
export const who = (u: Pick<Update, 'reporter_name' | 'reporter_game'>) => (u.reporter_game || '').trim() || u.reporter_name || 'гравець';

export function groupUpdates(ups: Update[]): UpdateGroup[] {
  const sorted = [...ups].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  type G = UpdateGroup & { last: number };
  const open = new Map<string, G>(), out: G[] = [];
  for (const u of sorted) {
    const id = `${u.reporter_static ?? who(u)}|${u.buyer_id}`, t = new Date(u.created_at).getTime();
    const g = open.get(id);
    if (g && g.last - t <= GAP) { g.items.push(u); g.last = t; continue; }
    const ng = { key: id + '|' + u.id, who: who(u), stat: u.reporter_static ?? null, buyer_id: u.buyer_id, at: u.created_at, items: [u], last: t };
    open.set(id, ng); out.push(ng);
  }
  return out.map(({ last: _last, ...g }) => g);
}
