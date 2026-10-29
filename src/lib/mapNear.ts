import type { MapMark } from './mapData';

/* найближчі мітки від «Ти тут» (specs/014 FR-011): відстань у метрах гри по прямій, округлена до 10 м.
   cats — лише ці категорії (увімкнені на мапі); n — скільки показати */
export interface Near { mark: MapMark; m: number }

export function nearest(marks: MapMark[], from: { x: number; y: number }, cats: Set<string>, n = 5): Near[] {
  return marks.filter(mk => cats.has(mk.category))
    .map(mark => ({ mark, m: Math.round(Math.hypot(mark.x - from.x, mark.y - from.y) / 10) * 10 }))
    .sort((a, b) => a.m - b.m || a.mark.name.localeCompare(b.mark.name, 'uk'))
    .slice(0, n);
}

/* «420 м», «1,3 км» */
export const dist = (m: number) => (m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`);
