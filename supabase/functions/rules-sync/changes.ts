/* Журнал змін правил для вкладки «Правила» в програмі — чиста логіка без мережі, тести changes.test.ts.
   rules-sync порівнює попередній знімок із новим і дописує запис у rules-changes.json (бакет rules): які пункти додали,
   змінили чи прибрали. Рахує сервер, а не програма: гравець, що поставив програму вчора чи тиждень її не запускав,
   однаково бачить усі зміни з датами.
   • Пункт, у якого змінився лише номер (вставили новий перед ним), — не зміна: гравцю важливий текст.
   • Тема зникла, а її джерело вимкнене чи впало з помилкою, — не «прибрано»: це рішення адміна чи збій форуму, не нове правило.
   • Перший знімок (попереднього немає) — без запису, інакше всі 3000 пунктів були б «новими».
   • Тему переписали майже всю (чи змінилась розмітка форуму) — один рядок «документ оновлено» з лічильниками, а не сотні пунктів. */
import { topicKey, type SnapTopic } from './merge.ts';
import type { Item, Kind } from './parse.ts';

interface Doc { doc: string; section: string; url: string; kind: Kind }
export type Change = Doc & (
  | { type: 'added' | 'removed'; n: string; h: string; s: string }
  | { type: 'changed'; n: string; h: string; s: string; old: string }
  | { type: 'doc-added' | 'doc-removed'; items: number }
  | { type: 'doc-rewritten'; added: number; changed: number; removed: number });
/* more — скільки змін того дня не влізло в журнал (див. append) */
export interface Entry { at: string; changes: Change[]; more?: number }
export interface Log { updated: string; entries: Entry[] }

/* скільки тримати: 120 днів, але не більше 80 записів (оновлення щоночі — близько 4 місяців) і не більше MAX_BYTES:
   бакет приймає до 5 МБ, а файл, що не влазить, не записався б ніколи — журнал тихо замерз би назавжди */
export const KEEP_DAYS = 120, KEEP_ENTRIES = 80, MAX_BYTES = 1_500_000;
/* текст пункту в журналі — до MAX_TEXT символів: повний є на форумі за посиланням */
export const MAX_TEXT = 1500;
const cut = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT - 1).trimEnd() + '…' : s);

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\d]+/gu) ?? []);
/* схожість текстів за спільними словами (Жаккар): ≥ 0,5 — той самий пункт, переписаний */
export function similar(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

type ItemChange = { type: 'added' | 'removed'; it: Item } | { type: 'changed'; it: Item; old: string };

/* різниця пунктів однієї теми */
export function itemChanges(before: Item[], after: Item[]): ItemChange[] {
  let a = [...before], b = [...after];
  /* прибрати з обох списків пари, що підходять (кожен пункт — не більше однієї пари) */
  const take = (fit: (x: Item, y: Item) => boolean, on?: (x: Item, y: Item) => void) => {
    const rest: Item[] = [];
    for (const x of a) {
      const j = b.findIndex(y => fit(x, y));
      if (j < 0) { rest.push(x); continue; }
      on?.(x, b[j]); b = [...b.slice(0, j), ...b.slice(j + 1)];
    }
    a = rest;
  };
  const out: ItemChange[] = [];
  take((x, y) => x.n === y.n && x.s === y.s);                           // без змін
  take((x, y) => x.s === y.s);                                          // змінився лише номер
  take((x, y) => !!x.n && x.n === y.n, (x, y) => out.push({ type: 'changed', it: y, old: x.s }));
  take((x, y) => similar(x.s, y.s) >= 0.5, (x, y) => out.push({ type: 'changed', it: y, old: x.s }));
  for (const x of a) out.push({ type: 'removed', it: x });
  for (const y of b) out.push({ type: 'added', it: y });
  /* у порядку документа: за позицією в новому знімку, прибрані — за старою */
  const pos = (c: ItemChange) => (c.type === 'removed' ? before.indexOf(c.it) : after.indexOf(c.it));
  return out.sort((p, q) => pos(p) - pos(q));
}

/* prev — попередній знімок, next — новий; ok — джерела, які цього разу зібрано без помилки */
export function changes(prev: SnapTopic[], next: SnapTopic[], ok: Set<number>): Change[] {
  if (!prev.length) return [];
  const old = new Map(prev.map(t => [topicKey(t.url), t])), now = new Map(next.map(t => [topicKey(t.url), t]));
  const doc = (t: SnapTopic): Doc => ({ doc: t.title, section: t.section, url: t.url, kind: t.kind });
  const out: Change[] = [];
  for (const [k, t] of now) {
    const was = old.get(k);
    if (!was) { out.push({ ...doc(t), type: 'doc-added', items: t.items.length }); continue; }
    const cs = itemChanges(was.items, t.items);
    if (!cs.length) continue;
    /* переписано більше половини документа — одним рядком */
    if (cs.length > Math.max(20, 0.5 * Math.max(was.items.length, t.items.length))) {
      const n = (ty: string) => cs.filter(c => c.type === ty).length;
      out.push({ ...doc(t), type: 'doc-rewritten', added: n('added'), changed: n('changed'), removed: n('removed') });
      continue;
    }
    for (const c of cs) {
      const it = { n: c.it.n, h: c.it.h, s: cut(c.it.s) };
      out.push(c.type === 'changed' ? { ...doc(t), type: 'changed', ...it, old: cut(c.old) } : { ...doc(t), type: c.type, ...it });
    }
  }
  for (const [k, t] of old) if (!now.has(k) && t.src !== undefined && ok.has(t.src)) out.push({ ...doc(t), type: 'doc-removed', items: t.items.length });
  return out;
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/* дописати запис зверху й прибрати старі; немає змін — журнал той самий (null — нічого не записувати).
   Не влазить у MAX_BYTES — викидаємо найстаріші записи; не влазить і сам новий — у ньому лишаються перші зміни
   (у порядку документів) і рядок, скільки ще не показано */
export function append(log: Log | null, at: string, cs: Change[], max = MAX_BYTES): Log | null {
  if (!cs.length) return null;
  const since = Date.parse(at) - KEEP_DAYS * 864e5;
  const kept = (log?.entries ?? []).filter(e => Date.parse(e.at) >= since);
  let entry: Entry = { at, changes: cs };
  if (bytes({ updated: at, entries: [entry] }) > max) {
    let lo = 0, hi = cs.length;   // скільки змін влазить разом з підсумком — двійковим пошуком
    const fit = (k: number) => ({ at, changes: cs.slice(0, k), more: cs.length - k });
    while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (bytes({ updated: at, entries: [fit(m)] }) <= max) lo = m; else hi = m - 1; }
    entry = fit(lo);
  }
  const entries = [entry, ...kept].slice(0, KEEP_ENTRIES);
  while (entries.length > 1 && bytes({ updated: at, entries }) > max) entries.pop();
  return { updated: at, entries };
}
