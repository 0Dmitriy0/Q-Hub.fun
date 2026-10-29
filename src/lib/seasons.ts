/* Сезонні івенти й промокоди (таблиці season_events, promo_codes): дати — дні за київським часом, кінець включно.
   Івент може бути без дати кінця (ends_on null, specs/018) — тоді він триває, доки адмін його не прибере */
export interface SeasonEvent { id: number; title: string; description: string; starts_on: string; ends_on: string | null; link: string }
export interface Promo { id: number; code: string; reward: string; playtime_hours: number | null; starts_on: string; ends_on: string; note: string }

/* сьогодні в Києві як 'YYYY-MM-DD' — так само записані дати в базі */
export const kyivDay = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const dayN = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

export type Phase = { kind: 'now'; left: number | null } | { kind: 'soon'; in: number } | { kind: 'past' };
/* left — скільки днів лишилось разом із сьогоднішнім (останній день — 1); null — без дати кінця */
export function phase(starts: string, ends: string | null, today: string): Phase {
  const t = dayN(today);
  if (t < dayN(starts)) return { kind: 'soon', in: dayN(starts) - t };
  if (!ends) return { kind: 'now', left: null };
  if (t > dayN(ends)) return { kind: 'past' };
  return { kind: 'now', left: dayN(ends) - t + 1 };
}

/* «27.10–02.11», без кінця — «з 27.10»; рік — лише коли не поточний */
const ddmm = (d: string, today: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}${d.slice(0, 4) !== today.slice(0, 4) ? '.' + d.slice(0, 4) : ''}`;
export function range(starts: string, ends: string | null, today: string) {
  if (!ends) return `з ${ddmm(starts, today)}`;
  return starts === ends ? ddmm(starts, today) : `${ddmm(starts, today)}–${ddmm(ends, today)}`;
}

/* період категорії мапи (specs/018): «з 23.10 до 12.11», «з 23.10», «до 12.11» або порожньо */
export function period(starts: string | null | undefined, ends: string | null | undefined, today: string) {
  if (starts && ends) return `з ${ddmm(starts, today)} до ${ddmm(ends, today)}`;
  return starts ? `з ${ddmm(starts, today)}` : ends ? `до ${ddmm(ends, today)}` : '';
}

export const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дні' : 'днів'}`;

/* активні — першими (ті, що скоро закінчаться, — вище), далі майбутні; минулі не показуємо */
export function upcoming<T extends { starts_on: string; ends_on: string | null }>(rows: T[], today: string): (T & { ph: Phase })[] {
  const rank = (p: Phase) => (p.kind === 'now' ? p.left ?? 999 : 1000 + (p.kind === 'soon' ? p.in : 0));   // без кінця — після тих, що закінчуються
  return rows.map(r => ({ ...r, ph: phase(r.starts_on, r.ends_on, today) }))
    .filter(r => r.ph.kind !== 'past')
    .sort((a, b) => rank(a.ph) - rank(b.ph));
}
