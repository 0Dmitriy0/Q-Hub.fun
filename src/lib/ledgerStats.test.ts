import { describe, expect, it } from 'vitest';
import { balanceSeries, lastDays, summary, type T } from './ledgerStats';

/* 23.10.2026 15:00 за Києвом (UTC+3) */
const now = Date.parse('2026-10-23T12:00:00Z');
const t = (type: T['type'], amount: number, category: string, ts: string): T => ({ type, amount, category, ts });
const tx = [
  t('in', 1000, 'Робота', '2026-10-23T08:00:00Z'),          // сьогодні
  t('out', 300, 'Податки', '2026-10-23T09:00:00Z'),         // сьогодні
  t('in', 500, 'Робота', '2026-10-22T22:30:00Z'),           // 23.10 01:30 Київ — уже сьогодні
  t('in', 200, 'Перекуп', '2026-10-22T10:00:00Z'),          // вчора
  t('out', 50, 'Одяг', '2026-10-10T10:00:00Z'),             // давно
];

describe('облік: цифри', () => {
  it('баланс у часі — від старту, по порядку', () => {
    expect(balanceSeries(100, tx).map(p => p.b)).toEqual([50, 250, 750, 1750, 1450]);
  });
  it('останні 7 діб за київською добою', () => {
    const d = lastDays(tx, 7, now);
    expect(d).toHaveLength(7);
    expect(d[6]).toMatchObject({ in: 1500, out: 300 });
    expect(d[5]).toMatchObject({ in: 200, out: 0 });
    expect(d.slice(0, 5).every(x => x.in === 0 && x.out === 0)).toBe(true);
  });
  it('переказ між готівкою й карткою — не прибуток і не витрата', () => {
    const moved = [...tx, { ...t('out', 999, 'Переказ', '2026-10-23T09:30:00Z'), source: 'transfer' }, { ...t('in', 999, 'Переказ', '2026-10-23T09:30:00Z'), source: 'transfer' }];
    expect(summary(moved, 'today', now)).toMatchObject({ in: 1500, out: 300, count: 3 });
    expect(lastDays(moved, 7, now)[6]).toMatchObject({ in: 1500, out: 300 });
  });
  it('підсумки за період і категорії', () => {
    expect(summary(tx, 'today', now)).toMatchObject({ in: 1500, out: 300, net: 1200, count: 3, catsIn: [['Робота', 1500]] });
    expect(summary(tx, 'yesterday', now)).toMatchObject({ in: 200, out: 0, count: 1 });
    expect(summary(tx, 'all', now)).toMatchObject({ in: 1700, out: 350, net: 1350, count: 5 });
  });
});
