import { describe, expect, it } from 'vitest';
import { clean, context, holdings, rulesBlock, type Ctx, type TxRec } from './plan.ts';

const c: Ctx = {
  character: 'Dmitriy_Core', balance: 6903606,
  deals: [
    { op: 'buy', item: 'Глива', qty: 40, price: 120, ts: '2026-10-20T10:00:00Z' },
    { op: 'farm', item: 'Глива', qty: 60, price: 0, ts: '2026-10-21T10:00:00Z' },
    { op: 'farm', item: 'Яйця', qty: 30, price: 0, ts: '2026-10-21T11:00:00Z' },
    { op: 'sell', item: 'Яйця', qty: 30, price: 50, ts: '2026-10-22T11:00:00Z' },
  ],
  prices: [
    { buyer: 'Ферма', item: 'Глива', price: 200, min: 100, max: 300 },
    { buyer: 'Ринок', item: 'Глива', price: 250, min: 0, max: 0 },
    { buyer: 'Ферма', item: 'Яйця', price: 40, min: 0, max: 0 },
  ],
};

describe('помічник Alt+Q', () => {
  it('склад з угод: продане списується, куплене — із середньою ціною', () => {
    expect(holdings(c.deals)).toEqual([{ item: 'Глива', qty: 100, bought: 40, avg: 120 }]);
  });
  it('у контексті — баланс, склад і ціни скупників, дорожчі спершу', () => {
    const t = context(c);
    expect(t).toContain('Dmitriy_Core');
    expect(t).toContain('Глива × 100 (куплено 40 по 120 $)');
    expect(t).toMatch(/Глива: Ринок 250 \$; Ферма 200 \$ \(межі 100 \$–300 \$\)/);
  });
  it('угода продажу: назва як у каталозі, запис в облік «Перекуп», бо товар куплявся', () => {
    const p = clean({ reply: 'Записую', actions: [{ kind: 'deal', op: 'sell', item: 'глива', qty: 10, price: 250, type: null, amount: null, category: null, note: null }] }, c);
    expect(p.actions).toEqual([{ kind: 'deal', op: 'sell', item: 'Глива', qty: 10, price: 250,
      tx: { type: 'in', amount: 2500, category: 'Перекуп', note: 'Продав: Глива × 10 по 250 $' } }]);
  });
  it('нафармлене — без запису в облік; витрата з чужою категорією → «Інше»', () => {
    const p = clean({ reply: '', actions: [
      { kind: 'deal', op: 'farm', item: 'Яйця', qty: 30, price: null },
      { kind: 'tx', type: 'out', amount: 5000, category: 'Казино', note: 'штраф' },
    ] }, c);
    expect(p.actions).toEqual([
      { kind: 'deal', op: 'farm', item: 'Яйця', qty: 30, price: 0, tx: null },
      { kind: 'tx', type: 'out', amount: 5000, category: 'Інше', note: 'штраф', account: 'cash' },
    ]);
    expect(p.reply).toBe('Ось що запишу:');
  });
  it('рахунок: сказаний — як сказав, інакше за категорією; переказ — з рахунку на інший', () => {
    const p = clean({ reply: '', actions: [
      { kind: 'tx', type: 'in', amount: 30000, category: 'Робота', note: 'зп', account: null },
      { kind: 'tx', type: 'in', amount: 1000, category: 'Перекуп', note: '', account: 'card' },
      { kind: 'transfer', amount: 200000, account: 'card' },
      { kind: 'transfer', amount: 5, account: 'crypto' },
    ] }, c);
    expect(p.actions).toEqual([
      { kind: 'tx', type: 'in', amount: 30000, category: 'Робота', note: 'зп', account: 'card' },
      { kind: 'tx', type: 'in', amount: 1000, category: 'Перекуп', note: '', account: 'card' },
      { kind: 'transfer', from: 'card', to: 'cash', amount: 200000 },
    ]);
    expect(context({ ...c, cash: 100, card: 50 })).toContain('готівка 100 $, картка 50 $');
  });
  it('правка й видалення: лише записи зі списку, «було» — для гравця, захищені поля угод і переказів', () => {
    const recent: TxRec[] = [
      { id: 'u1', type: 'out', amount: 5000, category: 'Податки', note: '', ts: '2026-10-23T02:00:00Z', account: 'card', source: 'desktop' },
      { id: 'u2', type: 'in', amount: 1380, category: 'Продаж фарму', note: 'Продав: Глива × 10', ts: '2026-10-23T01:00:00Z', account: 'cash', source: 'deal' },
      { id: 'u3', type: 'out', amount: 200000, category: 'Переказ', note: 'Картка → Готівка', ts: '2026-10-22T20:00:00Z', account: 'card', source: 'transfer' },
    ];
    const ctx = { ...c, recent };
    expect(context(ctx)).toMatch(/#1 · .*−5 000 \$ · Податки · картка/);
    expect(context(ctx)).toMatch(/#2 · .*угода/);
    const p = clean({ reply: '', actions: [
      { kind: 'edit', ref: 1, amount: 7000, type: null, category: null, note: null, account: 'cash' },
      { kind: 'edit', ref: 2, amount: 9999, type: 'out', note: 'гливи було 10', account: null },
      { kind: 'edit', ref: 3, amount: 250000, account: 'cash', category: 'Робота' },
      { kind: 'delete', ref: 9 },
      { kind: 'delete', ref: 1 },
    ] }, ctx);
    expect(p.actions).toEqual([
      { kind: 'edit', id: 'u1', rec: recent[0], set: { amount: 7000, account: 'cash' } },
      { kind: 'edit', id: 'u2', rec: recent[1], set: { note: 'гливи було 10' } },
      { kind: 'edit', id: 'u3', rec: recent[2], set: { amount: 250000 } },
    ]);
    expect(clean({ actions: [{ kind: 'delete', ref: 2 }] }, ctx).actions).toEqual([{ kind: 'delete', id: 'u2', rec: recent[1] }]);
    expect(clean({ actions: [{ kind: 'edit', ref: 1, type: 'in' }] }, ctx).actions).toEqual([{ kind: 'edit', id: 'u1', rec: recent[0], set: { type: 'in', category: 'Інше' } }]);
  });
  it('сміття від моделі відкидається', () => {
    const p = clean({ reply: 'Ок', actions: [
      { kind: 'deal', op: 'sell', item: 'X', qty: 1, price: 0 },      // продаж без ціни
      { kind: 'tx', type: 'in', amount: -5 },                            // від'ємна сума
      { kind: 'hack', type: 'in', amount: 5 },
    ] }, c);
    expect(p.actions).toEqual([]);
    expect(clean(null, c)).toEqual({ reply: 'Не зрозумів — спробуй інакше.', actions: [] });
  });
});

describe('пункти правил для помічника', () => {
  it('є пункти — окремий блок перед текстом гравця', () => {
    expect(rulesBlock('[Правила Зелених Зон, п. 1.1] Заборонено вбивство')).toBe('Пункти правил сервера QuantRP, що можуть стосуватися питання:\n[Правила Зелених Зон, п. 1.1] Заборонено вбивство\n\n');
  });
  it('порожньо чи не рядок — нічого', () => {
    expect(rulesBlock('  ')).toBe('');
    expect(rulesBlock(undefined)).toBe('');
    expect(rulesBlock({ x: 1 })).toBe('');
  });
  it('задовге — обрізається до 8000', () => expect(rulesBlock('я'.repeat(20000)).length).toBeLessThan(8100));
});
