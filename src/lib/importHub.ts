/* Імпорт резервної копії Quant Hub (кнопка «Зберегти копію» в хабі → quant-hub-YYYY-MM-DD.json).
   Перетворює її на рядки таблиць Q-Hub. Кожен запис несе external_id = id з хабу,
   тож повторний імпорт того самого файлу нічого не дублює (unique (character_id, external_id)). */

type Json = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const iso = (ms: unknown) => { const n = num(ms); return new Date(n > 0 ? n : Date.now()).toISOString(); };

export interface HubImport {
  character: { name: string; start_balance: number; goal_name: string; goal: number };
  transactions: { external_id: string; type: 'in' | 'out'; amount: number; category: string; note: string; ts: string; source: 'import' }[];
  deals: { external_id: string; op: 'buy' | 'farm' | 'sell'; item: string; qty: number; price: number; category: string; ts: string; tx_external_id: string; receipt_key: string }[];
  cars: { external_id: string; name: string; plate: string; gov: number; paid: number; tune: string; tuning: Json; note: string; status: 'own' | 'sold'; sold_price: number; sold_to: 'player' | 'state'; sold_at: string | null; pos: number }[];
  documents: { external_id: string; name: string; icon: string; expires: string | null }[];
  sessions: { external_id: string; started_at: string; ended_at: string | null }[];
  counts: { transactions: number; deals: number; cars: number; documents: number; sessions: number };
}

export function parseHubBackup(raw: unknown, characterName: string): HubImport {
  const root = (raw ?? {}) as Json;
  if (root.app !== 'Quant Hub' || typeof root.hub !== 'object' || !root.hub) throw new Error('Це не файл копії Quant Hub');
  const hub = root.hub as Json;
  const led = (root.ledger ?? {}) as Json;
  const st = (led.settings ?? {}) as Json;

  const transactions: HubImport['transactions'] = (Array.isArray(led.tx) ? led.tx : []).flatMap((t: Json) => {
    const amount = Math.round(num(t.amount));
    if (!(amount > 0) || (t.type !== 'in' && t.type !== 'out')) return [];
    return [{ external_id: str(t.id, 60), type: t.type, amount, category: str(t.cat, 30) || 'Інше', note: str(t.note, 200), ts: iso(t.ts), source: 'import' as const }];
  });

  const deals: HubImport['deals'] = (Array.isArray(hub.deals) ? hub.deals : []).flatMap((d: Json) => {
    const op = d.op; const qty = num(d.qty);
    if ((op !== 'buy' && op !== 'farm' && op !== 'sell') || !(qty > 0) || !str(d.item)) return [];
    return [{ external_id: str(d.id, 60), op, item: str(d.item, 80), qty: Math.round(qty * 100) / 100, price: Math.max(0, Math.round(num(d.price))),
      category: str(d.cat, 12), ts: iso(d.ts), tx_external_id: str(d.tx, 60), receipt_key: str(d.rid, 24) }];
  });

  const cars: HubImport['cars'] = (Array.isArray(hub.cars) ? hub.cars : []).flatMap((c: Json) => {
    if (!str(c.name)) return [];
    return [{ external_id: str(c.id, 60), name: str(c.name, 60), plate: str(c.plate, 16), gov: Math.round(num(c.gov)), paid: Math.round(num(c.paid)),
      tune: str(c.tune, 80), tuning: (c.tun && typeof c.tun === 'object' ? c.tun : {}) as Json, note: str(c.note, 140),
      status: c.status === 'sold' ? 'sold' : 'own', sold_price: Math.round(num(c.soldPrice)), sold_to: c.soldTo === 'state' ? 'state' : 'player',
      sold_at: num(c.soldAt) > 0 ? iso(c.soldAt) : null, pos: Math.round(num(c.pos)) }];
  });

  const documents: HubImport['documents'] = (Array.isArray(hub.docs) ? hub.docs : []).flatMap((d: Json, i: number) => {
    if (!str(d.name ?? d.n)) return [];
    const date = str(d.until ?? d.expires, 10);
    return [{ external_id: str(d.id, 60) || 'doc' + i, name: str(d.name ?? d.n, 60), icon: str(d.icon ?? d.ic, 8), expires: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null }];
  });

  const sessions: HubImport['sessions'] = (Array.isArray(led.sessions) ? led.sessions : []).flatMap((s: Json, i: number) => {
    const a = num(s.start ?? s.s ?? s.from), b = num(s.end ?? s.e ?? s.to);
    if (!(a > 0)) return [];
    return [{ external_id: str(s.id, 60) || 's' + a + '_' + i, started_at: iso(a), ended_at: b >= a ? iso(b) : null }];
  });

  return {
    character: { name: str(characterName, 40) || 'Персонаж', start_balance: Math.round(num(st.start)), goal_name: str(st.goalName, 60), goal: Math.max(0, Math.round(num(st.goal))) },
    transactions, deals, cars, documents, sessions,
    counts: { transactions: transactions.length, deals: deals.length, cars: cars.length, documents: documents.length, sessions: sessions.length }
  };
}
