import { DAY } from './pricestats';
import { kyParts, kyTs } from './events';
/* цифри для «Обліку», як у Quant Hub: баланс у часі, останні 7 днів, підсумки за період. Доба — київська, як у грі */
export interface T { type: 'in' | 'out'; amount: number; category: string; ts: string; source?: string }
/* переказ між готівкою й карткою — не прибуток і не витрата */
const real = (t: T) => t.source !== 'transfer';
export type Period = 'all' | 'today' | 'yesterday' | 'week' | 'month';

const kyDay = (ts: number) => { const p = kyParts(ts); return kyTs(p.y, p.mo, p.d, 0, 0); };
const sign = (t: T) => (t.type === 'in' ? 1 : -1) * Number(t.amount);

/* баланс після кожного запису, від старту */
export function balanceSeries(start: number, tx: T[]) {
  let b = Number(start) || 0;
  return [...tx].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).map(t => ({ t: Date.parse(t.ts), b: (b += sign(t)) }));
}

/* прибуток і витрати по днях за останні n діб (включно з сьогодні) */
export function lastDays(tx: T[], n = 7, now = Date.now()) {
  const today = kyDay(now);
  const days = Array.from({ length: n }, (_, i) => ({ d: kyDay(today - (n - 1 - i) * DAY + 12 * 36e5), in: 0, out: 0 }));
  for (const t of tx.filter(real)) {
    const d = days.find(x => x.d === kyDay(Date.parse(t.ts)));
    if (d) d[t.type] += Number(t.amount);
  }
  return days;
}

export function periodStart(p: Period, now = Date.now()) {
  const today = kyDay(now);
  return p === 'today' ? [today, Infinity] : p === 'yesterday' ? [kyDay(today - 12 * 36e5), today]
    : p === 'week' ? [today - 6 * DAY, Infinity] : p === 'month' ? [today - 29 * DAY, Infinity] : [-Infinity, Infinity];
}

/* підсумки за період і розклад за категоріями (більші спершу) */
export function summary(tx: T[], p: Period, now = Date.now()) {
  const [from, to] = periodStart(p, now);
  const inP = tx.filter(t => { const x = Date.parse(t.ts); return real(t) && x >= from && x < to; });
  const cats = (type: 'in' | 'out') => {
    const m = new Map<string, number>();
    for (const t of inP) if (t.type === type) m.set(t.category, (m.get(t.category) ?? 0) + Number(t.amount));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const inc = inP.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const out = inP.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
  return { in: inc, out, net: inc - out, count: inP.length, catsIn: cats('in'), catsOut: cats('out') };
}
