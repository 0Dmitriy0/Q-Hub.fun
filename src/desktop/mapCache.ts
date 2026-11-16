import type { MapData } from '../lib/mapMarks';
import type { MapArea } from '../lib/mapData';
import { sortAnimals } from '../lib/huntAnimals';

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
    if (!(c && typeof c.at === 'string' && Array.isArray(c.cats) && Array.isArray(c.marks))) return null;
    /* копія з попередньої версії: у зонах ще немає звірів (specs/088) — без цього мапа падала на ar.animals */
    if (Array.isArray(c.areas)) c.areas = c.areas.map((a: MapArea) => ({ ...a, animals: sortAnimals(Array.isArray(a.animals) ? a.animals : []) }));
    /* копія до specs/089 — без написів: мапа без назв, а не падіння */
    if (!Array.isArray(c.labels)) c.labels = [];
    return c;
  } catch { return null; }
}
export const stale = (at: number, now = Date.now()) => now - at >= STALE;

/* «станом на 29.10, 14:05» — київський час */
const df = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const asOf = (at: string) => 'станом на ' + df.format(new Date(at));
