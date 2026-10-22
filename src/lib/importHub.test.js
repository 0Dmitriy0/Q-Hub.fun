import { describe, expect, it } from 'vitest';
import { parseHubBackup } from './importHub';
const backup = {
    app: 'Quant Hub', version: 1, exportedAt: '2026-10-21T10:00:00.000Z',
    hub: {
        deals: [
            { id: 'dA', op: 'buy', item: 'Stage 1', qty: 1, price: 40000, ts: 1792580000000, tx: 'tA', cat: 'tune', rid: 'r1' },
            { id: 'dB', op: 'buy', item: 'Гвинт Х', qty: 2, price: 40000, ts: 1792580000001, tx: 'tA', cat: 'tune', rid: 'r1' },
            { id: 'dC', op: 'farm', item: 'Глива', qty: 400, price: 0, ts: 1792500000000, tx: '' },
            { id: 'bad', op: 'steal', item: 'X', qty: 1 }
        ],
        cars: [{ id: 'c1', name: 'Zeekr 001', plate: 'qh777', gov: 900000, paid: 850000, status: 'own', tun: { stage: 2 } }],
        docs: [{ id: 'd1', name: 'Мед.Карта', icon: '🩺', until: '2026-11-01' }, { id: 'd2', name: 'Без дати', until: 'колись' }],
        settings: {}
    },
    ledger: {
        settings: { start: 5085516, goal: 13000000, goalName: 'Ubermacht I5' },
        tx: [
            { id: 'tA', type: 'out', amount: 160000, cat: 'Перекуп', note: 'Чек', ts: 1792580000000 },
            { id: 'tZ', type: 'in', amount: 0, cat: 'Інше', ts: 1 }
        ],
        sessions: [{ id: 's1', start: 1792570000000, end: 1792573600000 }]
    }
};
describe('parseHubBackup', () => {
    it('переносить персонажа, облік, угоди з чеком, гараж, документи й сесії', () => {
        const r = parseHubBackup(backup, 'Dmitriy_Core');
        expect(r.character).toEqual({ name: 'Dmitriy_Core', start_balance: 5085516, goal_name: 'Ubermacht I5', goal: 13000000 });
        expect(r.counts).toEqual({ transactions: 1, deals: 3, cars: 1, documents: 2, sessions: 1 });
        expect(r.deals[0]).toMatchObject({ external_id: 'dA', tx_external_id: 'tA', receipt_key: 'r1', category: 'tune' });
        expect(r.documents[1].expires).toBeNull();
        expect(r.cars[0]).toMatchObject({ plate: 'qh777', tuning: { stage: 2 }, status: 'own' });
        expect(r.sessions[0].ended_at).toBe(new Date(1792573600000).toISOString());
    });
    it('відкидає не-хабівські файли', () => {
        expect(() => parseHubBackup({ foo: 1 }, 'X')).toThrow();
    });
});
