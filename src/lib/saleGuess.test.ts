import { describe, expect, it } from 'vitest';
import { manualLine, saleGuess, type SaleItem } from './saleGuess';

const it_ = (item: string, price: number, unit = 'шт'): SaleItem => ({ item, price, unit });

describe('saleGuess', () => {
  it('один товар ділить суму без остачі — кількість відома', () => {
    expect(saleGuess(4750, [it_('Шкура оленя', 475), it_('Глива', 333)], { 'Шкура оленя': 20 }))
      .toEqual({ kind: 'one', lines: [{ item: 'Шкура оленя', qty: 10, price: 475, farm: 0 }] });
  });
  it('дві кратні ціни (10 × 475 = 19 × 250) без складу — вибір вручну', () => {
    expect(saleGuess(4750, [it_('A', 475), it_('B', 250)], {}).kind).toBe('manual');
  });
  it('товар зі складу має пріоритет над товаром без складу', () => {
    expect(saleGuess(4750, [it_('A', 475), it_('B', 250)], { B: 30 }))
      .toEqual({ kind: 'one', lines: [{ item: 'B', qty: 19, price: 250, farm: 0 }] });
  });
  it('обидва кратні товари на складі — вибір вручну', () => {
    expect(saleGuess(4750, [it_('A', 475), it_('B', 250)], { A: 10, B: 30 }).kind).toBe('manual');
  });
  it('«Продати все»: сума = Σ склад × ціна по ≥ 2 товарах', () => {
    expect(saleGuess(3 * 475 + 4 * 100, [it_('A', 475), it_('B', 100), it_('C', 7)], { A: 3, B: 4 }))
      .toEqual({ kind: 'all', lines: [{ item: 'A', qty: 3, price: 475, farm: 0 }, { item: 'B', qty: 4, price: 100, farm: 0 }] });
  });
  it('нестача: farm = qty − склад; без складу farm = qty', () => {
    expect(saleGuess(4750, [it_('A', 475)], { A: 4 })).toMatchObject({ lines: [{ qty: 10, farm: 6 }] });
    expect(saleGuess(4750, [it_('A', 475)], {})).toMatchObject({ lines: [{ qty: 10, farm: 10 }] });
  });
  it('кілограми — з точністю до 0,01', () => {
    expect(saleGuess(1000, [it_('Риба', 80, 'кг')], { Риба: 20 })).toMatchObject({ kind: 'one', lines: [{ qty: 12.5, farm: 0 }] });
  });
  it('сума не ділиться — вибір вручну, спершу товари зі складу', () => {
    const r = saleGuess(1001, [it_('Б', 475), it_('А', 250), it_('В', 9)], { В: 2, Б: 1 });
    expect(r).toEqual({ kind: 'manual', items: [{ item: 'Б', price: 475, have: 1 }, { item: 'В', price: 9, have: 2 }, { item: 'А', price: 250, have: 0 }] });
  });
  it('без товарів скупника — вибір зі складу', () => {
    expect(saleGuess(500, [], { Глива: 3 })).toEqual({ kind: 'manual', items: [{ item: 'Глива', price: 0, have: 3 }] });
  });
});

describe('manualLine', () => {
  it('ціна — сума / кількість, нестача — у farm', () => {
    expect(manualLine('A', 3, 1000, 1)).toEqual({ item: 'A', qty: 3, price: 333, farm: 2 });
    expect(manualLine('A', 12.5, 1000, 20)).toEqual({ item: 'A', qty: 12.5, price: 80, farm: 0 });
  });
});
