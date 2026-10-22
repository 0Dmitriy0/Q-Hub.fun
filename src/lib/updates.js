export const GAP = 30 * 60000;
/* хто вніс: нік персонажа (з Discord — лише якщо ніку ще немає) і статік */
export const who = (u) => (u.reporter_game || '').trim() || u.reporter_name || 'гравець';
export function groupUpdates(ups) {
    const sorted = [...ups].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    const open = new Map(), out = [];
    for (const u of sorted) {
        const id = `${u.reporter_static ?? who(u)}|${u.buyer_id}`, t = new Date(u.created_at).getTime();
        const g = open.get(id);
        if (g && g.last - t <= GAP) {
            g.items.push(u);
            g.last = t;
            continue;
        }
        const ng = { key: id + '|' + u.id, who: who(u), stat: u.reporter_static ?? null, buyer_id: u.buyer_id, at: u.created_at, items: [u], last: t };
        open.set(id, ng);
        out.push(ng);
    }
    return out.map(({ last: _last, ...g }) => g);
}
