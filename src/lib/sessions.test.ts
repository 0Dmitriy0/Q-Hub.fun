import { describe, expect, it } from 'vitest';
import { hm, live, perHour, played, type GameSession } from './sessions';

/* 23.10.2026 15:00 за Києвом (UTC+3) */
const now = Date.parse('2026-10-23T12:00:00Z');
const s = (id: string, a: string, b: string | null): GameSession => ({ id, started_at: a, ended_at: b });

describe('ігрові сесії', () => {
  const rows = [
    s('1', '2026-10-23T09:00:00Z', '2026-10-23T10:30:00Z'),   // сьогодні 1,5 год
    s('2', '2026-10-22T20:00:00Z', '2026-10-22T22:00:00Z'),   // через київську північ (23:00–01:00): 1 год учора, 1 год сьогодні
    s('3', '2026-10-23T11:00:00Z', '2026-10-23T12:01:00Z'),   // іде зараз: кінець — оренда на хвилину вперед
  ];
  it('гра йде, поки кінець сесії в майбутньому; закрита щойно — вже не йде', () => {
    expect(live(rows, now)?.id).toBe('3');
    expect(live(rows.slice(0, 2), now)).toBeNull();
    expect(live([s('4', '2026-10-23T11:00:00Z', '2026-10-23T11:59:59Z')], now)).toBeNull();
  });
  it('відіграно за добу — по київській півночі, поточна сесія до «зараз»', () => {
    expect(played(rows, 'today', now)).toBe((1.5 + 1 + 1) * 36e5);
    expect(played(rows, 'yesterday', now)).toBe(1 * 36e5);
  });
  it('формат і чистий за годину', () => {
    expect(hm(72 * 60e3)).toBe('1 год 12 хв');
    expect(hm(45 * 60e3 + 59e3)).toBe('45 хв');
    expect(perHour(300000, 2 * 36e5)).toBe(150000);
    expect(perHour(1000, 0)).toBeNull();
  });
});
