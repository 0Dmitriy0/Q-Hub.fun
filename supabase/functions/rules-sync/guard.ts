/* Перевірки для rules-sync (specs/095): тіло від програми адміна і запобіжник від гіршого знімка.
   Без залежностей середовища — тести у vitest. */
import { FORUM, type Kind } from './parse.ts';
import type { SnapTopic, SourceRow } from './merge.ts';

export const MAX_BODY = 4 * 1024 * 1024;
const KINDS: Kind[] = ['rules', 'law', 'order', 'info'];
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

export type AppBody = { ok: true; fresh: SnapTopic[]; errors: Map<number, string>; titles: Map<number, string> } | { ok: false; error: string };

/* тіло { via:'app', fresh, errors, titles } (contracts/rules-sync-app.md); sources — рядки rule_sources */
export function checkAppBody(body: unknown, sources: SourceRow[]): AppBody {
  const bad = (error: string): AppBody => ({ ok: false, error });
  if (!body || typeof body !== 'object') return bad('порожнє тіло');
  const b = body as Record<string, unknown>;
  const on = new Set(sources.filter(s => s.enabled).map(s => s.id)), all = new Set(sources.map(s => s.id));
  if (!Array.isArray(b.fresh) || b.fresh.length > 300) return bad('fresh — масив до 300 тем');
  const fresh: SnapTopic[] = [];
  for (const [i, t] of (b.fresh as unknown[]).entries()) {
    const x = t as Record<string, unknown>;
    const at = `тема ${i + 1}: `;
    if (!x || typeof x !== 'object') return bad(at + 'не обʼєкт');
    if (!str(x.title, 300) || !str(x.section, 300)) return bad(at + 'назва чи розділ задовгі або відсутні');
    if (!str(x.url, 500) || !(x.url as string).startsWith(FORUM)) return bad(at + 'посилання не на форум сервера');
    if (!KINDS.includes(x.kind as Kind)) return bad(at + 'невідомий тип ' + String(x.kind));
    if (typeof x.src !== 'number' || !on.has(x.src)) return bad(at + 'невідоме чи вимкнене джерело ' + String(x.src));
    if (!Array.isArray(x.items) || x.items.length > 2000) return bad(at + 'пункти — масив до 2000');
    const items = [];
    for (const it of x.items as unknown[]) {
      const y = it as Record<string, unknown>;
      if (!y || !str(y.n, 40) || !str(y.h, 300) || !str(y.s, 20000)) return bad(at + 'пункт з задовгим чи відсутнім полем');
      items.push({ n: y.n as string, h: y.h as string, s: y.s as string });
    }
    fresh.push({ title: x.title as string, section: x.section as string, url: x.url as string, kind: x.kind as Kind, src: x.src, items });
  }
  const pairs = (v: unknown, name: string): Map<number, string> | string => {
    if (v === undefined) return new Map();
    if (!Array.isArray(v) || v.length > 100) return name + ' — масив пар [джерело, текст]';
    const m = new Map<number, string>();
    for (const p of v) {
      if (!Array.isArray(p) || typeof p[0] !== 'number' || !all.has(p[0]) || !str(p[1], 500)) return name + ': невідоме джерело чи задовгий текст';
      m.set(p[0], p[1]);
    }
    return m;
  };
  const errors = pairs(b.errors, 'errors'), titles = pairs(b.titles, 'titles');
  if (typeof errors === 'string') return bad(errors);
  if (typeof titles === 'string') return bad(titles);
  return { ok: true, fresh, errors, titles };
}

/* запобіжник (обидва шляхи): джерело без помилки, але з 0 тем або з пунктами < 50 % від попереднього знімка —
   це зламана розмітка чи заглушка, а не справжні правила. Повертає нові помилки для таких джерел. */
export function suspicious(prev: SnapTopic[], fresh: SnapTopic[], sources: SourceRow[], errors: Map<number, string>): Map<number, string> {
  const out = new Map<number, string>();
  const count = (ts: SnapTopic[], id: number) => ts.filter(t => t.src === id).reduce((n, t) => n + t.items.length, 0);
  for (const s of sources) {
    if (!s.enabled || errors.has(s.id)) continue;
    const topics = fresh.filter(t => t.src === s.id).length, now = count(fresh, s.id), was = count(prev, s.id);
    if (topics === 0) out.set(s.id, 'жодної теми — знімок не змінено');
    else if (was > 0 && now < was * 0.5) out.set(s.id, `підозріло мало пунктів (${now} замість ${was}) — знімок не змінено`);
  }
  return out;
}
