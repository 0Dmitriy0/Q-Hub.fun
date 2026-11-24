/* Оновлення правил сервера й законів штату з форуму QuantRP (specs/010 US3, contracts/rules-sync.md).
   Хто кличе: адмін кнопкою «Оновити зараз» на сайті (сесія admin) або щоденний запуск GitHub Actions (x-sync-secret).
   Що робить: обходить увімкнені джерела з rule_sources послідовно, розбирає теми (parse.ts), зводить знімок (merge.ts) —
   джерело з помилкою лишає свої теми з попереднього знімка — і кладе його в публічний бакет rules (rules.json).
   Що змінилось проти попереднього знімка — дописує в rules-changes.json того ж бакета (changes.ts, вкладка «Правила» в програмі).
   Ключі — лише в секретах функції (SUPABASE_SERVICE_ROLE_KEY, RULES_SYNC_SECRET). */
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { FORUM, forumError } from './parse.ts';
import { merge, type SnapTopic, type SourceRow } from './merge.ts';
import { crawl } from './crawl.ts';
import { checkAppBody, MAX_BODY, suspicious } from './guard.ts';
import { append, changes, type Log } from './changes.ts';

/* x-client-info шле supabase-js (functions.invoke з сайту) — без нього браузер блокує запит ще до функції */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);
const URL_ = Deno.env.get('SUPABASE_URL')!, SECRET = Deno.env.get('RULES_SYNC_SECRET');

/* лише хост форуму (FR-011): адреси з бази й посилання зі сторінок — тільки forum.quant5.com.ua; запити по одному з паузою */
const pages = new Map<string, string>();
async function get(path: string) {
  const u = new URL(path, FORUM);
  if (u.origin + '/' !== FORUM) throw new Error('не форум сервера: ' + u.origin);
  const hit = pages.get(u.href); if (hit) return hit;
  await new Promise(r => setTimeout(r, 250));
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 Q-Hub rules sync' } });
  if (!r.ok) throw new Error(forumError(r.status));
  const h = await r.text(); pages.set(u.href, h); return h;
}

/* хто кличе: секрет GitHub (by — null) або сесія адміна (by — його id); інакше null */
async function caller(req: Request): Promise<{ secret: boolean; by: string | null } | null> {
  if (SECRET && req.headers.get('x-sync-secret') === SECRET) return { secret: true, by: null };
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await sb.rpc('my_role');
  if (data !== 'admin') return null;
  const { data: u } = await sb.auth.getUser();
  return { secret: false, by: u.user?.id ?? null };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Лише POST');
  const who = await caller(req);
  if (!who) return fail(403, 'Оновлювати правила може лише адміністратор.');
  /* тіло: {} — функція обходить форум сама; { via:'app', … } — теми прочитала програма адміна (specs/095) */
  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, 'Завеликий знімок правил');
  let body: Record<string, unknown> = {};
  if (raw.trim()) try { body = JSON.parse(raw); } catch { return fail(400, 'Тіло — не JSON'); }
  const app = body.via === 'app';
  if (app && who.secret) return fail(403, 'Оновлювати правила може лише адміністратор.');   // секрет GitHub не підсуває теми
  const via = app ? 'app' : 'server';
  pages.clear();
  const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  /* журнал спроб (rules_sync_runs, 0081); збій журналу не зриває оновлення */
  const lastOk = async () => {
    const { data } = await db.from('rules_sync_runs').select('at,via').eq('ok', true).order('at', { ascending: false }).limit(1).maybeSingle();
    return data ?? null;
  };
  const record = async (r: { ok: boolean; topics?: number; items?: number; changes?: number; error?: string | null }) => {
    try {
      await db.from('rules_sync_runs').insert({ via, by: who.by, ok: r.ok, topics: r.topics ?? null, items: r.items ?? null, changes: r.changes ?? null, error: r.error ?? null });
      await db.from('rules_sync_runs').delete().lt('at', new Date(Date.now() - 90 * 86_400_000).toISOString());
    } catch { /* журнал не обов'язковий */ }
  };

  const { data: rows, error } = await db.from('rule_sources').select('id,url,kind,enabled').order('id');
  if (error) return fail(500, 'Не вдалося прочитати джерела правил.');
  const sources = (rows ?? []) as SourceRow[];
  /* попередній знімок — щоб джерело з помилкою не стерло свої правила */
  let prev: SnapTopic[] = [];
  const old = await db.storage.from('rules').download('rules.json');
  if (old.data) try { prev = JSON.parse(await old.data.text()).topics ?? []; } catch { /* битий — як порожній */ }

  /* теми: з тіла програми (перевірені guard.ts) або власним обходом (crawl.ts — той самий, що в програмі) */
  let fresh: SnapTopic[], errors: Map<number, string>, titles: Map<number, string>;
  if (app) {
    const b = checkAppBody(body, sources);
    if (!b.ok) { await record({ ok: false, error: 'тіло від програми: ' + b.error }); return fail(400, 'Програма надіслала неправильні дані: ' + b.error); }
    ({ fresh, errors, titles } = b);
  } else ({ fresh, errors, titles } = await crawl(get, sources));
  /* запобіжник: зламана розмітка чи заглушка не стирає правила (FR-007) */
  for (const [id, why] of suspicious(prev, fresh, sources, errors)) errors.set(id, why);
  const { topics, results } = merge(prev, sources, fresh, errors);
  const items = topics.reduce((n, t) => n + t.items.length, 0);

  /* жодне джерело не оновилось — знімок не чіпаємо: fetched лишається часом останнього вдалого оновлення */
  const any = [...results.values()].some(r => !r.error);
  const fetched = new Date().toISOString();
  if (any) {
    const up = await db.storage.from('rules').upload('rules.json', new Blob([JSON.stringify({ fetched, topics })], { type: 'application/json' }), { upsert: true, cacheControl: '300', contentType: 'application/json' });
    if (up.error) { await record({ ok: false, error: 'знімок не записано: ' + up.error.message }); return fail(502, 'Не вдалося записати знімок правил — попередній лишається.'); }
  }

  /* журнал змін: збій тут не зриває оновлення — правила вже записано, пропаде лише цей запис журналу */
  const ok = new Set([...results].filter(([, r]) => !r.error).map(([id]) => id));
  const cs = any ? changes(prev, topics, ok) : [];
  let logged = 0, logError: string | null = null;
  if (cs.length) try {
    let log: Log | null = null;
    const was = await db.storage.from('rules').download('rules-changes.json');
    if (was.data) try { log = JSON.parse(await was.data.text()); } catch { /* битий — почнемо з нуля */ }
    const next = append(log, fetched, cs);
    if (next) {
      const w = await db.storage.from('rules').upload('rules-changes.json', new Blob([JSON.stringify(next)], { type: 'application/json' }), { upsert: true, cacheControl: '300', contentType: 'application/json' });
      if (w.error) logError = 'журнал змін не записано: ' + w.error.message; else logged = next.entries[0].changes.length;
    }
  } catch (e) { logError = 'журнал змін не записано: ' + (e instanceof Error ? e.message : String(e)); }

  const out = [];
  for (const s of sources) {
    const r = results.get(s.id); if (!r) continue;
    const patch = r.error ? { error: r.error } : { error: null, items: r.items, diff: r.diff, synced_at: fetched, title: titles.get(s.id) ?? null };
    await db.from('rule_sources').update(patch).eq('id', s.id);
    out.push({ id: s.id, title: titles.get(s.id) ?? null, items: r.items, error: r.error, diff: r.diff });
  }
  const firstErr = out.find(o => o.error)?.error ?? null;
  await record({ ok: any, topics: topics.length, items, changes: logged, error: any ? null : firstErr });
  return json({ fetched: any ? fetched : null, via, changes: logged, changes_error: logError, topics: topics.length, items, sources: out, last_ok: await lastOk() });
});
