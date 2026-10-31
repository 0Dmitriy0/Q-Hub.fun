import { PX_PER_M, ZMAX } from './mapGeo';
import type { GameTheme } from './gameTheme';

/* перегляд «Мапи для гри» (specs/026): мітки того самого розміру в метрах, що й на мінікарті, тож злипання видно */

/* межі текстур гри в метрах — перегляд показує саме цю ділянку, як мінікарта */
/* (як GAME у gameMap.ts: кут -4140, 8400, 2×3 тайли по 4500 м; gameMap не імпортуємо — він вантажиться лише для архіву) */
export const GAME_BOUNDS = { x0: -4140, x1: 4860, yt: 8400, yb: -5100 };

/* радіус значка в пікселях екрана на наближенні zoom (Leaflet, CRS.Simple, ZMAX — 1.28 px на метр) */
export const pinRadius = (iconM: number, zoom: number) => (iconM * PX_PER_M * 2 ** (zoom - ZMAX)) / 2;

const word = (n: number, one: string, few: string, many: string) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;

/* підсумок вибору на кнопці «Скачати» (FR-006): «128 міток · 3 зони · назви · темна · 20 м» */
export function packSummary(o: { marks: number; areas: number; names: boolean; zones: boolean; theme: GameTheme; iconM: number }): string {
  const parts = [word(o.marks, 'мітка', 'мітки', 'міток')];
  if (o.areas) parts.push(word(o.areas, 'поле', 'поля', 'полів'));
  if (o.names) parts.push('назви');
  if (o.zones) parts.push('зелені зони');
  parts.push(o.theme === 'light' ? 'світла' : 'темна', `${o.iconM} м`);
  return parts.join(' · ');
}

/* велика категорія (specs/017 FR-014) і забагато міток разом — пороги попереджень (FR-008) */
export const BIG_CAT = 200, MANY_PINS = 1500;
