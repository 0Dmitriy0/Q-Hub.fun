/* Знімок правил із джерел (specs/010 US3) — чиста логіка без мережі, тести merge.test.ts.
   plan: які теми брати й з яким типом; merge: новий знімок — джерело з помилкою чи 0 пунктів лишає свої теми з
   попереднього (FR-015), для кожного джерела — різниця added / changed / removed за ключем «тема + номер пункту» */
import { numOf, type Kind, type Topic } from './parse.ts';

export interface SourceRow { id: number; url: string; kind: Kind; enabled: boolean }
/* src — з якого джерела тема (щоб наступного разу знати, що лишити при помилці); програма поле не читає */
export type SnapTopic = Topic & { src?: number };
export interface Planned { url: string; section: string; kind: Kind; src: number }
export interface Diff { added: number; changed: number; removed: number }
export interface SourceResult { items: number | null; error: string | null; diff: Diff | null }

const isTopic = (url: string) => /\/topic\/\d+/.test(url);
/* одна тема — один ключ, хоч адреса відносна, повна чи з іншою назвою після номера */
export const topicKey = (url: string) => (isTopic(url) ? 't' + numOf(url) : 'f' + numOf(url));

/* listed — теми, знайдені в кожному увімкненому розділі (id джерела → теми). Окреме джерело-тема: увімкнене — тема
   береться один раз і з його типом, навіть якщо вона є й у розділі; вимкнене — тема не береться зовсім (FR-010) */
export function plan(sources: SourceRow[], listed: Map<number, { url: string; section: string }[]>): Planned[] {
  const topicSrc = new Map(sources.filter(s => isTopic(s.url)).map(s => [topicKey(s.url), s]));
  const out: Planned[] = [], seen = new Set<string>();
  const add = (url: string, section: string, s: SourceRow) => {
    const k = topicKey(url);
    if (seen.has(k)) return;
    const own = topicSrc.get(k);
    if (own && !own.enabled) return;
    seen.add(k);
    const by = own ?? s;
    out.push({ url, section, kind: by.kind, src: by.id });
  };
  /* окремі теми — першими, щоб тип і джерело були їхні */
  for (const s of sources) if (s.enabled && isTopic(s.url)) add(s.url, '', s);
  for (const s of sources) if (s.enabled && !isTopic(s.url)) for (const t of listed.get(s.id) ?? []) add(t.url, t.section, s);
  return out;
}

const count = (ts: SnapTopic[]) => ts.reduce((n, t) => n + t.items.length, 0);

export function diff(before: SnapTopic[], after: SnapTopic[]): Diff {
  /* той самий номер у темі трапляється кілька разів (два «1.1» у різних розділах закону) — ключ із номером повтору */
  const map = (ts: SnapTopic[]) => new Map(ts.flatMap(t => {
    const seen = new Map<string, number>();
    return t.items.map((it, i) => {
      const n = it.n || '#' + i, k = seen.get(n) ?? 0; seen.set(n, k + 1);
      return [`${topicKey(t.url)}|${n}|${k}`, it.s] as const;
    });
  }));
  const a = map(before), b = map(after);
  let added = 0, changed = 0, removed = 0;
  for (const [k, s] of b) { if (!a.has(k)) added++; else if (a.get(k) !== s) changed++; }
  for (const k of a.keys()) if (!b.has(k)) removed++;
  return { added, changed, removed };
}

/* fresh — що зібрано з кожного джерела (теми з полем src) і помилки джерел; prev — попередній знімок */
export function merge(prev: SnapTopic[], sources: SourceRow[], fresh: SnapTopic[], errors: Map<number, string>):
  { topics: SnapTopic[]; results: Map<number, SourceResult> } {
  const topics: SnapTopic[] = [], results = new Map<number, SourceResult>();
  for (const s of sources) {
    if (!s.enabled) continue;
    const old = prev.filter(t => t.src === s.id), got = fresh.filter(t => t.src === s.id);
    const err = errors.get(s.id) ?? (count(got) === 0 ? '0 пунктів — розмітка форуму змінилась чи розділ порожній?' : null);
    if (err) { topics.push(...old); results.set(s.id, { items: null, error: err, diff: null }); continue; }
    topics.push(...got);
    results.set(s.id, { items: count(got), error: null, diff: diff(old, got) });
  }
  return { topics, results };
}
