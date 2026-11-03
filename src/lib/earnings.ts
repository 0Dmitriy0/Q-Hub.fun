/* Заробіток персонажа за годину (specs/044): з підсумків сеансів у game_sessions — дні за київським часом,
   підсумок проміжку, найкращий день. «Заробив» — сума зростань балансу, «Чистими» — кінець − початок.
   Середнє — Σзаробітку ÷ Σчасу (FR-013); сумнівні й закороткі сеанси не входять у середнє, а рахуються в skipped. */
import { kyivDay } from './seasons';

export interface SessionRow {
  id?: string;
  started_at: string;
  money_from: string;
  money_to: string;
  money_start: number;
  money_end: number;
  money_gain: number;
  money_flag: boolean;
}

export interface Day {
  day: string;               // РРРР-ММ-ДД за Києвом; для підсумку проміжку — ''
  ms: number;                // зіграно з програмою (лише сеанси, що входять у середнє)
  gain: number;              // «Заробив»
  net: number;               // «Чистими», може бути < 0
  perHourGain: number | null;
  perHourNet: number | null;
  skipped: number;           // сеансів не враховано (сумнівні або коротші за minMinutes)
  sessions: SessionRow[];    // усі сеанси дня, зокрема пропущені — для розгорнутого дня
}

export interface Range { from?: string; to?: string }   // включно, РРРР-ММ-ДД за Києвом

const H = 36e5;
export const sessionMs = (r: SessionRow) => Math.max(0, Date.parse(r.money_to) - Date.parse(r.money_from));
export const sessionDay = (r: SessionRow) => kyivDay(Date.parse(r.started_at));
/* сеанс входить у середнє: без сумнівного зчитування й не коротший за minMinutes */
export const counts = (r: SessionRow, minMinutes: number) => !r.money_flag && sessionMs(r) >= minMinutes * 60e3;

function total(rows: SessionRow[], minMinutes: number, day = ''): Day {
  let ms = 0, gain = 0, net = 0, skipped = 0;
  for (const r of rows) {
    if (!counts(r, minMinutes)) { skipped++; continue; }
    ms += sessionMs(r); gain += Number(r.money_gain) || 0; net += (Number(r.money_end) || 0) - (Number(r.money_start) || 0);
  }
  const per = (v: number) => (ms > 0 ? Math.round(v / (ms / H)) : null);
  return { day, ms, gain, net, perHourGain: per(gain), perHourNet: per(net), skipped, sessions: rows };
}

export function summarize(rows: SessionRow[], range: Range = {}, minMinutes = 5) {
  const inRange = rows.filter(r => {
    const d = sessionDay(r);
    return (!range.from || d >= range.from) && (!range.to || d <= range.to);
  });
  const byDay = new Map<string, SessionRow[]>();
  for (const r of inRange) {
    const d = sessionDay(r);
    byDay.set(d, [...(byDay.get(d) || []), r]);
  }
  const days = [...byDay].map(([d, rs]) => total(rs, minMinutes, d)).sort((a, b) => (a.day < b.day ? 1 : -1));
  let best: string | null = null, top = -Infinity;
  for (const d of days) if (d.perHourGain !== null && d.perHourGain > top) { top = d.perHourGain; best = d.day; }
  return { total: total(inRange, minMinutes), days, best };
}

/* готові проміжки: «Сьогодні», «Тиждень» (останні 7 днів включно з сьогодні), «Місяць» (30 днів), «Весь час» */
export type Preset = 'today' | 'week' | 'month' | 'all';
export function presetRange(p: Preset, now = Date.now()): Range {
  const to = kyivDay(now);
  if (p === 'all') return {};
  const back = p === 'today' ? 0 : p === 'week' ? 6 : 29;
  return { from: shiftDay(to, -back), to };
}
/* РРРР-ММ-ДД ± n календарних днів (без часових поясів — лише дата) */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* «3 год 05 хв», «45 хв», «0 хв» */
export function duration(ms: number): string {
  const min = Math.floor(ms / 60e3);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} год ${String(m).padStart(2, '0')} хв` : `${m} хв`;
}
