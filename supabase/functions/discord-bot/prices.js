/* Ціни для Discord (specs/060 US1, research R3): вікно збирання, ліміт пересилань, групування змін і стабільний ключ.
   Чисте — без Deno й мережі, тестується vitest. */
/* публікувати, коли від найстарішої події минуло windowMin хвилин (FR-004) */
export function due(events, now, windowMin) {
    if (!events.length)
        return false;
    const oldest = Math.min(...events.map(e => Date.parse(e.at)));
    return now.getTime() - oldest >= windowMin * 60_000;
}
/* не більше perHour публікацій на годину з каналу-оголошення (FR-003); решта чекає й іде одним зведенням */
export const allowed = (postsLastHour, perHour) => postsLastHour < perHour;
const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id;
/* кілька змін того самого предмета за вікно → одна: остання ціна, попередня — з найстарішої події.
   Ціна повернулась до попередньої — зміни немає. Скупники за sort, предмети за назвою */
export function group(events, buyers, items) {
    const per = new Map();
    for (const e of [...events].sort(byTime)) {
        const k = e.buyer_id + '\u0000' + e.item_id;
        per.set(k, [...(per.get(k) ?? []), e]);
    }
    const groups = new Map();
    for (const list of per.values()) {
        const first = list[0], last = list[list.length - 1];
        if (first.prev_price !== null && first.prev_price === last.price)
            continue;
        const buyer = buyers.find(b => b.id === first.buyer_id) ?? { id: first.buyer_id, name: first.buyer_id, sort: 1e9, next_change_at: null };
        const g = groups.get(buyer.id) ?? { buyer, rows: [] };
        g.rows.push({ item_id: first.item_id, name: items.get(first.item_id) ?? `Предмет #${first.item_id}`, price: last.price, prev: first.prev_price });
        groups.set(buyer.id, g);
    }
    const out = [...groups.values()];
    for (const g of out)
        g.rows.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    return out.sort((a, b) => a.buyer.sort - b.buyer.sort || a.buyer.name.localeCompare(b.buyer.name, 'uk'));
}
/* окремий канал на скупника (0056, рішення власника 2026-11-04): події розходяться по каналах своїх скупників;
   скупник без каналу — нікуди (orphan: позначаються опублікованими без повідомлення) */
export function route(events, channels) {
    const byChannel = new Map(), orphan = [];
    for (const e of events) {
        const ch = channels.get(e.buyer_id);
        if (!ch) {
            orphan.push(e);
            continue;
        }
        byChannel.set(ch, [...(byChannel.get(ch) ?? []), e]);
    }
    return { byChannel, orphan };
}
/* ключ публікації вікна — за найменшим id події: повторний tick з тими самими подіями дає той самий ключ (SC-002) */
export const postKey = (events) => 'prices:' + Math.min(...events.map(e => e.id));
export const partKey = (key, i) => (i === 0 ? key : `${key}:${i + 1}`);
