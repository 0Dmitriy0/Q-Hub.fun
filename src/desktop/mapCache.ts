import type { MapData } from '../lib/mapMarks';

/* копія мапи у вікні програми (specs/014 US4): остання вдало завантажена — щоб без інтернету мапа відкривалась з мітками,
   і напис «станом на …»; свіжа — не старіша за STALE (FR-012: зміни з сайту — не пізніше ніж за 10 хв) */
const KEY = 'qhub:map:copy';
export const STALE = 5 * 60e3;
export type MapCopy = MapData & { at: string };

export function saveCopy(d: MapData, now = Date.now()) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...d, at: new Date(now).toISOString() })); } catch { /* місця нема чи приватний режим */ }
}
export function readCopy(): MapCopy | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && typeof c.at === 'string' && Array.isArray(c.cats) && Array.isArray(c.marks) ? c : null;
  } catch { return null; }
}
export const stale = (at: number, now = Date.now()) => now - at >= STALE;

/* «станом на 29.10, 14:05» — київський час */
const df = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const asOf = (at: string) => 'станом на ' + df.format(new Date(at));
