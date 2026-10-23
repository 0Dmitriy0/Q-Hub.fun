import { periodStart, type Period } from './ledgerStats';
/* ігрові сесії, які пише програма (desktop/src/session.cjs): поки гра йде, кінець сесії стоїть трохи в майбутньому
   («оренда», щохвилини відсувається); гру закрито — кінець = момент закриття */
export interface GameSession { id: string; started_at: string; ended_at: string | null }

export function live(rows: GameSession[], now = Date.now()) {
  return rows.find(r => r.ended_at && Date.parse(r.ended_at) > now) ?? null;
}

/* скільки відіграно за період: сесії обрізаються по межах періоду, та що йде — рахується до «зараз» */
export function played(rows: GameSession[], p: Period, now = Date.now()) {
  const [from, to] = periodStart(p, now);
  let ms = 0;
  for (const r of rows) {
    const s = Date.parse(r.started_at), e = Math.min(now, Date.parse(r.ended_at || r.started_at));
    ms += Math.max(0, Math.min(e, to) - Math.max(s, from));
  }
  return ms;
}

/* «1 год 12 хв», «45 хв», «0 хв» */
export function hm(ms: number) {
  const m = Math.floor(ms / 60e3), h = Math.floor(m / 60);
  return h ? `${h} год ${m % 60} хв` : `${m} хв`;
}

/* чистий результат за годину гри; null — гри за період не було */
export const perHour = (net: number, ms: number) => (ms >= 60e3 ? Math.round(net / (ms / 36e5)) : null);
