/* Оновлення правил сервера й законів штату з форуму QuantRP (specs/010 US3, contracts/rules-sync.md).
   Хто кличе: адмін кнопкою «Оновити зараз» на сайті (сесія admin) або щоденний запуск GitHub Actions (x-sync-secret).
   Що робить: обходить увімкнені джерела з rule_sources послідовно, розбирає теми (parse.ts), зводить знімок (merge.ts) —
   джерело з помилкою лишає свої теми з попереднього знімка — і кладе його в публічний бакет rules (rules.json).
   Ключі — лише в секретах функції (SUPABASE_SERVICE_ROLE_KEY, RULES_SYNC_SECRET). */
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { FORUM, forumTopics, heading, readTopic } from './parse.ts';
import { merge, plan, type SnapTopic, type SourceRow } from './merge.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-sync-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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
  if (!r.ok) throw new Error(`форум відповів ${r.status}`);
  const h = await r.text(); pages.set(u.href, h); return h;
}

async function allowed(req: Request) {
  if (SECRET && req.headers.get('x-sync-secret') === SECRET) return true;
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await sb.rpc('my_role');
  return data === 'admin';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Лише POST');
  if (!(await allowed(req))) return fail(403, 'Оновлювати правила може лише адміністратор.');
  pages.clear();
  const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: rows, error } = await db.from('rule_sources').select('id,url,kind,enabled').order('id');
  if (error) return fail(500, 'Не вдалося прочитати джерела правил.');
  const sources = (rows ?? []) as SourceRow[];
  /* попередній знімок — щоб джерело з помилкою не стерло свої правила */
  let prev: SnapTopic[] = [];
  const old = await db.storage.from('rules').download('rules.json');
  if (old.data) try { prev = JSON.parse(await old.data.text()).topics ?? []; } catch { /* битий — як порожній */ }

  /* розділи → теми; помилка розділу — помилка джерела, решта йде далі */
  const errors = new Map<number, string>(), titles = new Map<number, string>();
  const listed = new Map<number, { url: string; section: string }[]>();
  for (const s of sources) {
    if (!s.enabled || /\/topic\/\d+/.test(s.url)) continue;
    try { listed.set(s.id, await forumTopics(get, s.url)); titles.set(s.id, heading(await get(s.url.replace(/\/+$/, '') + '/'))); }
    catch (e) { errors.set(s.id, e instanceof Error ? e.message : String(e)); }
  }
  const fresh: SnapTopic[] = [];
  for (const p of plan(sources, listed)) {
    if (errors.has(p.src)) continue;
    try {
      const t = await readTopic(get, p.url, p.section, p.kind);
      fresh.push({ ...t, src: p.src });
      if (/\/topic\/\d+/.test(sources.find(s => s.id === p.src)?.url ?? '')) titles.set(p.src, t.title);
    } catch (e) { errors.set(p.src, (e instanceof Error ? e.message : String(e)) + ' · ' + p.url); }
  }
  const { topics, results } = merge(prev, sources, fresh, errors);

  const fetched = new Date().toISOString();
  const body = JSON.stringify({ fetched, topics });
  const up = await db.storage.from('rules').upload('rules.json', new Blob([body], { type: 'application/json' }), { upsert: true, cacheControl: '300', contentType: 'application/json' });
  if (up.error) return fail(502, 'Не вдалося записати знімок правил — попередній лишається.');

  const out = [];
  for (const s of sources) {
    const r = results.get(s.id); if (!r) continue;
    const patch = r.error ? { error: r.error } : { error: null, items: r.items, diff: r.diff, synced_at: fetched, title: titles.get(s.id) ?? null };
    await db.from('rule_sources').update(patch).eq('id', s.id);
    out.push({ id: s.id, title: titles.get(s.id) ?? null, items: r.items, error: r.error, diff: r.diff });
  }
  return json({ fetched, topics: topics.length, items: topics.reduce((n, t) => n + t.items.length, 0), sources: out });
});
