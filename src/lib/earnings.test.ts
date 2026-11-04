import { describe, expect, it } from 'vitest';
import { duration, presetRange, shiftDay, summarize, type SessionRow } from './earnings';

const H = 36e5;
/* сеанс: початок (UTC), тривалість у годинах, баланс на початку й наприкінці, «Заробив» */
function s(start: string, hours: number, from: number, to: number, gain: number, flag = false): SessionRow {
  const t = Date.parse(start);
  return {
    started_at: new Date(t).toISOString(), money_from: new Date(t).toISOString(), money_to: new Date(t + hours * H).toISOString(),
    money_start: from, money_end: to, money_gain: gain, money_flag: flag,
  };
}

describe('заробіток за весь час (US1)', () => {
  it('середнє — Σ заробітку ÷ Σ часу, окремо «Заробив» і «Чистими»', () => {
    const { total } = summarize([
      s('2026-11-01T10:00:00Z', 1, 0, 100000, 100000),
      s('2026-11-02T10:00:00Z', 2, 100000, 150000, 50000),
    ]);
    expect(total.ms).toBe(3 * H);
    expect(total.gain).toBe(150000);
    expect(total.perHourGain).toBe(50000);
    expect(total.net).toBe(150000);
    expect(total.perHourNet).toBe(50000);
  });
  it('покупка: «Заробив» не падає, «Чистими» — з мінусом', () => {
    const { total } = summarize([s('2026-11-01T10:00:00Z', 1, 2_000_000, 300_000, 200_000)]);
    expect(total.perHourGain).toBe(200_000);
    expect(total.net).toBe(-1_700_000);
    expect(total.perHourNet).toBe(-1_700_000);
  });
  it('сумнівні й закороткі сеанси — не в середньому, а в skipped', () => {
    const { total } = summarize([
      s('2026-11-01T10:00:00Z', 1, 0, 100000, 100000),
      s('2026-11-01T12:00:00Z', 1, 0, 9_000_000, 0, true),
      s('2026-11-01T14:00:00Z', 4 / 60, 0, 500_000, 500_000),
    ], {}, 5);
    expect(total.skipped).toBe(2);
    expect(total.perHourGain).toBe(100000);
    expect(total.sessions).toHaveLength(3);
  });
  it('немає даних — null, а не 0', () => {
    const { total, days, best } = summarize([]);
    expect(total.perHourGain).toBeNull();
    expect(total.perHourNet).toBeNull();
    expect(days).toEqual([]);
    expect(best).toBeNull();
  });
});

describe('дні й проміжок (US2)', () => {
  it('сеанс 23:30–01:30 за Києвом — у дні початку', () => {
    // 2 листопада 23:30 за Києвом (UTC+2) = 21:30 UTC
    const { days } = summarize([s('2026-11-02T21:30:00Z', 2, 0, 20000, 20000)]);
    expect(days.map(d => d.day)).toEqual(['2026-11-02']);
  });
  it('літній час: 00:30 за Києвом у липні (UTC+3) — уже наступний день', () => {
    const { days } = summarize([s('2026-07-14T21:30:00Z', 1, 0, 1, 1)]);
    expect(days[0].day).toBe('2026-07-15');
  });
  it('фільтр «від — до» включно, дні без сеансів відсутні, новіші зверху', () => {
    const rows = [
      s('2026-11-01T10:00:00Z', 1, 0, 10000, 10000),
      s('2026-11-02T10:00:00Z', 1, 0, 20000, 20000),
      s('2026-11-04T10:00:00Z', 1, 0, 40000, 40000),
    ];
    const r = summarize(rows, { from: '2026-11-02', to: '2026-11-04' });
    expect(r.days.map(d => d.day)).toEqual(['2026-11-04', '2026-11-02']);
    expect(r.total.gain).toBe(60000);
  });
  it('середнє проміжку — Σ/Σ, а не середнє з денних середніх', () => {
    const r = summarize([
      s('2026-11-01T10:00:00Z', 1, 0, 100000, 100000),   // 100к/год
      s('2026-11-02T10:00:00Z', 3, 0, 60000, 60000),     // 20к/год
    ]);
    expect(r.total.perHourGain).toBe(40000);             // (100к + 60к) / 4 год, а не (100к + 20к) / 2
  });
  it('найкращий день — найбільше «Заробив» за годину; дні лише з пропущеними сеансами не змагаються', () => {
    const r = summarize([
      s('2026-11-01T10:00:00Z', 1, 0, 50000, 50000),
      s('2026-11-02T10:00:00Z', 1, 0, 90000, 90000),
      s('2026-11-03T10:00:00Z', 1, 0, 9_000_000, 0, true),
    ]);
    expect(r.best).toBe('2026-11-02');
    expect(r.days.find(d => d.day === '2026-11-03')?.perHourGain).toBeNull();
  });
  it('«Весь час» дорівнює сумі всіх днів', () => {
    const rows = [s('2026-11-01T10:00:00Z', 1, 0, 1000, 1500), s('2026-11-03T10:00:00Z', 2, 0, 3000, 3000)];
    const r = summarize(rows);
    expect(r.total.gain).toBe(r.days.reduce((a, d) => a + d.gain, 0));
    expect(r.total.ms).toBe(r.days.reduce((a, d) => a + d.ms, 0));
  });
});

describe('готові проміжки й формат', () => {
  const now = Date.parse('2026-11-03T21:30:00Z');   // 23:30 за Києвом, 3 листопада
  it('сьогодні / тиждень / місяць / весь час — за київським днем', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-11-03', to: '2026-11-03' });
    expect(presetRange('week', now)).toEqual({ from: '2026-10-28', to: '2026-11-03' });
    expect(presetRange('month', now)).toEqual({ from: '2026-10-05', to: '2026-11-03' });
    expect(presetRange('all', now)).toEqual({});
  });
  it('зсув дати через межу місяця й року', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('тривалість', () => {
    expect(duration(3 * H + 5 * 60e3)).toBe('3 год 05 хв');
    expect(duration(45 * 60e3)).toBe('45 хв');
    expect(duration(0)).toBe('0 хв');
  });
});
