/* Документи персонажа (таблиця documents з 0001): назва, іконка, дата закінчення. Дата — останній день, коли документ ще
   діє; без дати — безстроковий. Типові документи — підказка, назву можна вписати будь-яку. */

export interface Doc { id: string; character_id: string; name: string; icon: string; expires: string | null }

/* [назва, іконка] — список уточнює власник; невідомий у грі документ просто не обирають */
export const DOC_KINDS: [string, string][] = [
  ['Паспорт', 'user'], ['Водійське посвідчення', 'car'], ['Права на мотоцикл', 'moto'],
  ['Ліцензія на човен', 'boat'], ['Ліцензія пілота', 'plane'], ['Ліцензія на зброю', 'shield'],
  ['Ліцензія рибалки', 'tag'], ['Ліцензія мисливця', 'tag'], ['Медична картка', 'alert'],
];
export const iconFor = (name: string) => DOC_KINDS.find(([n]) => n === name)?.[1] || 'book';

export const SOON = 3;   // днів: «скоро закінчиться»
export type DocState = { kind: 'none' } | { kind: 'expired' | 'soon' | 'ok'; days: number };

/* календарні дні від сьогодні (за місцевим часом) до дати закінчення: 0 — останній день сьогодні, −1 — закінчився вчора */
export function daysLeft(expires: string, now = new Date()): number {
  const [y, m, d] = expires.split('-').map(Number);
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / 864e5);
}
export function docState(expires: string | null, now = new Date()): DocState {
  if (!expires) return { kind: 'none' };
  const days = daysLeft(expires, now);
  return { kind: days < 0 ? 'expired' : days <= SOON ? 'soon' : 'ok', days };
}

/* спершу прострочені, далі ті, що закінчуються раніше; безстрокові — у кінці за назвою */
export function sortDocs<T extends Pick<Doc, 'name' | 'expires'>>(docs: T[]): T[] {
  const k = (x: T) => (x.expires ? Date.parse(x.expires) : Infinity);
  return [...docs].sort((a, b) => k(a) - k(b) || a.name.localeCompare(b.name, 'uk'));
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
export const daysWord = (n: number) => `${n} ${plural(n, 'день', 'дні', 'днів')}`;

/* «закінчився 2 дні тому» / «останній день» / «ще 3 дні» / «до 12.11.2026» / «безстроковий» */
export function stateText(expires: string | null, now = new Date()): string {
  const s = docState(expires, now);
  if (s.kind === 'none') return 'безстроковий';
  if (s.kind === 'expired') return s.days === -1 ? 'закінчився вчора' : `закінчився ${daysWord(-s.days)} тому`;
  if (s.days === 0) return 'останній день';
  if (s.kind === 'soon') return s.days === 1 ? 'закінчується завтра' : `ще ${daysWord(s.days)}`;
  return 'до ' + expires!.split('-').reverse().join('.');
}

/* дата через n днів від сьогодні (YYYY-MM-DD) — «Продовжити на 7 / 30 днів» */
export function plusDays(n: number, from: string | null = null, now = new Date()): string {
  /* продовження діючого документа — від його дати, прострочений — від сьогодні */
  const base = from && daysLeft(from, now) >= 0 ? new Date(from + 'T12:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  base.setDate(base.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}
