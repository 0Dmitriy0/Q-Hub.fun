/* Запис журналу оновлень → чернетка новини (specs/060 US2, T019). Чисте — без Deno й мережі.
   Програма — src/data/changelog.json (changelog:<id>), сайт — src/data/sitenews.json (site:<id>); той самий формат.
   «Виправлено» в Discord іде до «Змінено»: груп у новині три — Додано / Змінено / Прибрано. */

export type Entry = { id: string; version?: string; title?: string; added?: string[]; changed?: string[]; fixed?: string[]; removed?: string[] };
export type DraftIn = { source_ref: string; title: string; added: string[]; changed: string[]; removed: string[] };

export const ITEM_MAX = 300, TITLE_MAX = 120;

/* задовгий пункт — обрізати на межі слова з «…» (обмеження бази: пункт ≤ 300 символів) */
export function clip(s: string, max = ITEM_MAX): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1), sp = cut.lastIndexOf(' ');
  return (sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,.;:—–-]+$/, '') + '…';
}

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
/* id «2026-11-05» чи «2026-11-05.2» → «5 листопада»; інший — як є */
export function dayOf(id: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(id);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : id;
}

const list = (a?: string[]) => (a ?? []).map(x => clip(String(x))).filter(Boolean);

/* kind: 'changelog' — програма, 'site' — сайт. Порожній запис (без жодного пункту) — null */
export function toDraft(e: Entry | null | undefined, kind: 'changelog' | 'site'): DraftIn | null {
  if (!e?.id) return null;
  const added = list(e.added), changed = [...list(e.changed), ...list(e.fixed)], removed = list(e.removed);
  if (!added.length && !changed.length && !removed.length) return null;
  const who = kind === 'site' ? 'Сайт Q-Hub' : 'Програма Q-Hub';
  const title = e.version ? `${who} ${e.version} — що нового`
    : e.title ? `${who}: ${e.title}`
    : `${who} — що нового ${dayOf(e.id)}`;
  return { source_ref: `${kind}:${e.id}`, title: clip(title, TITLE_MAX), added, changed, removed };
}
