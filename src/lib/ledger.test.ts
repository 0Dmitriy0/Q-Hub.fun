import { describe, expect, it } from 'vitest';
import { balance, ledger, stock, type Deal } from './ledger';

const d = (id: string, op: Deal['op'], item: string, qty: number, price: number, ts: number): Deal => ({ id, op, item, qty, price, ts });

describe('ledger', () => {
  it('продаж списує куплене за середньою собівартістю', () => {
    const L = ledger([d('1', 'buy', 'Stage 1', 3, 150000, 1), d('2', 'sell', 'Stage 1', 2, 200000, 2)]);
    expect(L.perDeal['2']).toEqual({ profit: 100000, fromBought: 2 });
    expect(stock(L)).toEqual([expect.objectContaining({ name: 'Stage 1', qty: 1, avg: 150000 })]);
  });
  it('спершу куплене, потім нафармлене; нафармлене — дохід без собівартості', () => {
    const L = ledger([d('1', 'farm', 'Глива', 100, 0, 1), d('2', 'buy', 'Глива', 10, 120, 2), d('3', 'sell', 'Глива', 50, 250, 3)]);
    expect(L.perDeal['3']).toEqual({ profit: 10 * 130, fromBought: 10 });
    expect(L.freeIncome).toBe(40 * 250);
    expect(stock(L)[0]).toMatchObject({ qty: 60, boughtQty: 0, freeQty: 60 });
  });
  it('порядок за часом, а не за вводом', () => {
    const L = ledger([d('2', 'sell', 'X', 1, 300, 2), d('1', 'buy', 'X', 1, 100, 1)]);
    expect(L.resale).toBe(200);
  });
  it('кілограми з дробами', () => {
    const L = ledger([d('1', 'buy', 'Короп', 12.5, 40, 1), d('2', 'sell', 'Короп', 2.3, 60, 2)]);
    expect(stock(L)[0].qty).toBe(10.2);
  });
  it('баланс = старт + доходи − витрати', () => {
    expect(balance(5085516, [{ type: 'in', amount: 1815145 }, { type: 'out', amount: 150000 }])).toBe(6750661);
  });
});
