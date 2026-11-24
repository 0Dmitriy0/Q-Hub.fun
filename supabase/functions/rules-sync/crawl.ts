/* Обхід форуму QuantRP: увімкнені джерела → розділи → теми → пункти (specs/010, specs/095).
   Без залежностей середовища: той самий модуль бере функція rules-sync (Deno) і програма адміна
   (desktop/src/lib/rulecrawl.cjs, збирає vite.lib.config.ts) — форум не пускає сервер, а ПК адміна пускає.
   Мережу дає той, хто кличе, через get: функція — свій fetch, програма — свій із зупинкою на блокуванні. */
import { forumTopics, heading, readTopic, type Get } from './parse.ts';
import { plan, type SnapTopic, type SourceRow } from './merge.ts';

export interface Crawl { fresh: SnapTopic[]; errors: Map<number, string>; titles: Map<number, string> }

const isTopic = (url: string) => /\/topic\/\d+/.test(url);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* stop(e) — чи обірвати весь обхід (програма: форум почав блокувати). Інакше помилка — лише цього джерела, решта йде далі */
export async function crawl(get: Get, sources: SourceRow[], stop: (e: unknown) => boolean = () => false): Promise<Crawl> {
  const errors = new Map<number, string>(), titles = new Map<number, string>();
  const listed = new Map<number, { url: string; section: string }[]>();
  for (const s of sources) {
    if (!s.enabled || isTopic(s.url)) continue;
    try { listed.set(s.id, await forumTopics(get, s.url)); titles.set(s.id, heading(await get(s.url.replace(/\/+$/, '') + '/'))); }
    catch (e) { if (stop(e)) throw e; errors.set(s.id, msg(e)); }
  }
  const fresh: SnapTopic[] = [];
  for (const p of plan(sources, listed)) {
    if (errors.has(p.src)) continue;
    try {
      const t = await readTopic(get, p.url, p.section, p.kind);
      fresh.push({ ...t, src: p.src });
      if (isTopic(sources.find(s => s.id === p.src)?.url ?? '')) titles.set(p.src, t.title);
    } catch (e) { if (stop(e)) throw e; errors.set(p.src, msg(e) + ' · ' + p.url); }
  }
  return { fresh, errors, titles };
}
