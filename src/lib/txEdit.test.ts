import { describe, expect, it } from 'vitest';
import { txFields, txForm, txPatch, type TxRow } from './txEdit';

const row = (source: string, over: Partial<TxRow> = {}): TxRow => ({ source, type: 'in', amount: 1000, category: 'Робота', note: '', account: 'card', ...over });

describe('txPatch', () => {
  it('без змін — порожній set', () => {
    const t = row('');
    expect(txPatch(t, txForm(t))).toEqual({ set: {} });
  });
  it('ручний запис: міняється все, сума — як у формі нового запису (150к)', () => {
    const t = row('desktop');
    expect(txPatch(t, { type: 'out', amount: '150к', category: ' Податки ', account: 'cash', note: ' штраф ' }))
      .toEqual({ set: { type: 'out', amount: 150000, category: 'Податки', account: 'cash', note: 'штраф' } });
  });
  it('сума 0 чи порожня — помилка', () => {
    expect(txPatch(row(''), { ...txForm(row('')), amount: '0' })).toEqual({ error: 'Вкажи суму більше 0.' });
    expect(txPatch(row(''), { ...txForm(row('')), amount: '' })).toEqual({ error: 'Вкажи суму більше 0.' });
  });
  it('обмеження бази: категорія ≤ 30, нотатка ≤ 200, категорія не порожня', () => {
    const f = txForm(row(''));
    expect(txPatch(row(''), { ...f, category: 'к'.repeat(31) })).toHaveProperty('error');
    expect(txPatch(row(''), { ...f, category: '  ' })).toHaveProperty('error');
    expect(txPatch(row(''), { ...f, note: 'н'.repeat(201) })).toHaveProperty('error');
    expect(txPatch(row(''), { ...f, note: 'н'.repeat(200) })).toEqual({ set: { note: 'н'.repeat(200) } });
  });
  it('переказ: лише сума й нотатка — тип, категорія й рахунок ігноруються', () => {
    const t = row('transfer', { type: 'out', category: 'Переказ', note: 'Картка → Готівка' });
    expect(txPatch(t, { type: 'in', amount: '2000', category: 'Робота', account: 'cash', note: 'з банкомата' }))
      .toEqual({ set: { amount: 2000, note: 'з банкомата' } });
  });
  it('запис угоди: сума й тип не міняються, навіть якщо в полі сміття', () => {
    const t = row('deal', { category: 'Перекуп', account: 'cash' });
    expect(txPatch(t, { type: 'out', amount: '', category: 'Продаж фарму', account: 'card', note: 'Глива' }))
      .toEqual({ set: { category: 'Продаж фарму', account: 'card', note: 'Глива' } });
  });
  it('старий запис без рахунку — вважається готівкою', () => {
    const t = row('', { account: undefined });
    expect(txPatch(t, { ...txForm(t), account: 'cash' })).toEqual({ set: {} });
  });
  it('txFields за джерелом', () => {
    expect(txFields('')).toEqual({ type: true, amount: true, category: true, account: true });
    expect(txFields('transfer')).toEqual({ type: false, amount: true, category: false, account: false });
    expect(txFields('deal')).toEqual({ type: false, amount: false, category: true, account: true });
  });
});
