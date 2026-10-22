/* Імпорт резервної копії Quant Hub (кнопка «Зберегти копію» в хабі → quant-hub-YYYY-MM-DD.json).
   Перетворює її на рядки таблиць Q-Hub. Кожен запис несе external_id = id з хабу,
   тож повторний імпорт того самого файлу нічого не дублює (unique (character_id, external_id)). */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const iso = (ms) => { const n = num(ms); return new Date(n > 0 ? n : Date.now()).toISOString(); };
export function parseHubBackup(raw, characterName) {
    const root = (raw ?? {});
    if (root.app !== 'Quant Hub' || typeof root.hub !== 'object' || !root.hub)
        throw new Error('Це не файл копії Quant Hub');
    const hub = root.hub;
    const led = (root.ledger ?? {});
    const st = (led.settings ?? {});
    const transactions = (Array.isArray(led.tx) ? led.tx : []).flatMap((t) => {
        const amount = Math.round(num(t.amount));
        if (!(amount > 0) || (t.type !== 'in' && t.type !== 'out'))
            return [];
        return [{ external_id: str(t.id, 60), type: t.type, amount, category: str(t.cat, 30) || 'Інше', note: str(t.note, 200), ts: iso(t.ts), source: 'import' }];
    });
    const deals = (Array.isArray(hub.deals) ? hub.deals : []).flatMap((d) => {
        const op = d.op;
        const qty = num(d.qty);
        if ((op !== 'buy' && op !== 'farm' && op !== 'sell') || !(qty > 0) || !str(d.item))
            return [];
        return [{ external_id: str(d.id, 60), op, item: str(d.item, 80), qty: Math.round(qty * 100) / 100, price: Math.max(0, Math.round(num(d.price))),
                category: str(d.cat, 12), ts: iso(d.ts), tx_external_id: str(d.tx, 60), receipt_key: str(d.rid, 24) }];
    });
    const cars = (Array.isArray(hub.cars) ? hub.cars : []).flatMap((c) => {
        if (!str(c.name))
            return [];
        return [{ external_id: str(c.id, 60), name: str(c.name, 60), plate: str(c.plate, 16), gov: Math.round(num(c.gov)), paid: Math.round(num(c.paid)),
                tune: str(c.tune, 80), tuning: (c.tun && typeof c.tun === 'object' ? c.tun : {}), note: str(c.note, 140),
                status: c.status === 'sold' ? 'sold' : 'own', sold_price: Math.round(num(c.soldPrice)), sold_to: c.soldTo === 'state' ? 'state' : 'player',
                sold_at: num(c.soldAt) > 0 ? iso(c.soldAt) : null, pos: Math.round(num(c.pos)) }];
    });
    const documents = (Array.isArray(hub.docs) ? hub.docs : []).flatMap((d, i) => {
        if (!str(d.name ?? d.n))
            return [];
        const date = str(d.until ?? d.expires, 10);
        return [{ external_id: str(d.id, 60) || 'doc' + i, name: str(d.name ?? d.n, 60), icon: str(d.icon ?? d.ic, 8), expires: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null }];
    });
    const sessions = (Array.isArray(led.sessions) ? led.sessions : []).flatMap((s, i) => {
        const a = num(s.start ?? s.s ?? s.from), b = num(s.end ?? s.e ?? s.to);
        if (!(a > 0))
            return [];
        return [{ external_id: str(s.id, 60) || 's' + a + '_' + i, started_at: iso(a), ended_at: b >= a ? iso(b) : null }];
    });
    return {
        character: { name: str(characterName, 40) || 'Персонаж', start_balance: Math.round(num(st.start)), goal_name: str(st.goalName, 60), goal: Math.max(0, Math.round(num(st.goal))) },
        transactions, deals, cars, documents, sessions,
        counts: { transactions: transactions.length, deals: deals.length, cars: cars.length, documents: documents.length, sessions: sessions.length }
    };
}
