/* Які категорії мапи видно (specs/005-promo-ghosts-map): збережені фільтри гравця, а за ?show=<id> — лише ця категорія й назви місць.
   Збережене в localStorage не чіпаємо, доки гравець сам щось не перемкне. */
import type { MapCategory } from './mapData';

/* групи, увімкнені за замовчуванням новому гравцю (specs/020) */
export const DEFAULT_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги', 'Заробіток']);
/* до specs/020 зберігались лише перемкнуті категорії, решта бралась звідси — у кого вже є збережене, «Заробіток» сам не вмикається */
const SAVED_DEFAULT_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги']);

export interface Filters {
  only: string | null;              // ?show=<id>[,<id>…]: тимчасовий вид, не зберігається (банер Хелловіну — привиди й гарбузи)
  on: Record<string, boolean>;      // перемкнуте в цьому відкритті мапи
  saved: Record<string, boolean>;   // з localStorage
}

type Cat = Pick<MapCategory, 'id' | 'grp'>;

export const onlyIds = (only: string) => only.split(',').map(s => s.trim()).filter(Boolean);

export const isVisible = (c: Cat, { only, on, saved }: Filters) =>
  only ? onlyIds(only).includes(c.id) || c.id === 'names'
    : on[c.id] ?? saved[c.id] ?? (Object.keys(saved).length ? SAVED_DEFAULT_GROUPS : DEFAULT_GROUPS).has(c.grp);

/* набір для збереження після перемикання — усе, що гравець бачить зараз (у виді «лише <id>» — саме це, а не старе збережене) */
export function toggled(cats: Cat[], f: Filters, ids: string[], v: boolean): Record<string, boolean> {
  const n = { ...f.saved, ...Object.fromEntries(cats.map(c => [c.id, isVisible(c, f)])) };
  for (const id of ids) n[id] = v;
  return n;
}

/* хто що може на мапі: у вікні програми (embed, specs/014 FR-014) — лише перегляд, навіть для admin; права однаково в RLS */
export function mapRights(role: string | null | undefined, isStaff: boolean, embed: boolean): { isAdmin: boolean; isStaff: boolean } {
  return { isAdmin: role === 'admin' && !embed, isStaff: isStaff && !embed };
}
