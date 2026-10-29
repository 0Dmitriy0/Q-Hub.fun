/* Які категорії мапи видно (specs/005-promo-ghosts-map): збережені фільтри гравця, а за ?show=<id> — лише ця категорія й назви місць.
   Збережене в localStorage не чіпаємо, доки гравець сам щось не перемкне. */
import type { MapCategory } from './mapData';

/* групи, увімкнені за замовчуванням */
export const DEFAULT_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги']);

export interface Filters {
  only: string | null;              // ?show=<id>: тимчасовий вид, не зберігається
  on: Record<string, boolean>;      // перемкнуте в цьому відкритті мапи
  saved: Record<string, boolean>;   // з localStorage
}

type Cat = Pick<MapCategory, 'id' | 'grp'>;

export const isVisible = (c: Cat, { only, on, saved }: Filters) =>
  only ? c.id === only || c.id === 'names' : on[c.id] ?? saved[c.id] ?? DEFAULT_GROUPS.has(c.grp);

/* набір для збереження після перемикання: у виді «лише <id>» — від того, що гравець бачить зараз, а не від старого збереженого */
export function toggled(cats: Cat[], f: Filters, ids: string[], v: boolean): Record<string, boolean> {
  const seen = f.only ? Object.fromEntries(cats.map(c => [c.id, isVisible(c, f)])) : {};
  const n = { ...f.saved, ...f.on, ...seen };
  for (const id of ids) n[id] = v;
  return n;
}
