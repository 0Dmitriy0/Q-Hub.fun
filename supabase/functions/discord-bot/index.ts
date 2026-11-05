/* Discord-бот Q-Hub (specs/060, contracts/discord-bot-function.md): публікує ціни скупників і новини в Discord.
   Хто кличе: pg_cron щохвилини й CI після деплою (x-sync-secret) або адмін з адмін-панелі (сесія admin).
   Дії: tick (ціни) і drafts (чернетки новин) — лише з секретом; send, test, status — лише admin.
   Секрети функції: DISCORD_BOT_TOKEN, DISCORD_SYNC_SECRET, SUPABASE_SERVICE_ROLE_KEY. Токен не потрапляє ні в базу, ні у відповідь. */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { ANNOUNCEMENT, discord, DiscordError, human, type Body, type Discord } from './discord.ts';
import { allowed, due, group, partKey, postKey, route, type BuyerInfo, type Ev, type Group } from './prices.ts';
import { newsMessage, newsTooLong, pricesMessage, TEST_MESSAGE } from './format.ts';
import { toDraft, type DraftIn, type Entry } from './changelog.ts';

/* x-client-info шле supabase-js (functions.invoke з сайту) — без нього браузер блокує запит ще до функції */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);
const URL_ = Deno.env.get('SUPABASE_URL')!, SECRET = Deno.env.get('DISCORD_SYNC_SECRET'), TOKEN = Deno.env.get('DISCORD_BOT_TOKEN');

type Who = 'secret' | 'admin' | null;
async function who(req: Request): Promise<Who> {
  if (SECRET && req.headers.get('x-sync-secret') === SECRET) return 'secret';
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await sb.rpc('my_role');
  return data === 'admin' ? 'admin' : null;
}

/* хто яку дію може викликати (contracts/discord-bot-function.md) */
const ACCESS: Record<string, Who> = { tick: 'secret', drafts: 'secret', board: 'admin', send: 'admin', test: 'admin', status: 'admin' };

export type Ctx = { db: SupabaseClient; dc: Discord; body: Record<string, unknown> };
type Action = (c: Ctx) => Promise<Response>;

/* стан для адмінки: остання вдала дія з Discord / остання помилка (≤ 500) */
export async function markOk(db: SupabaseClient) {
  await db.from('discord_bot').update({ last_ok_at: new Date().toISOString(), last_error: '' }).eq('id', true);
}
export async function markError(db: SupabaseClient, e: unknown) {
  const text = e instanceof DiscordError ? e.message : e instanceof Error ? e.message : String(e);
  await db.from('discord_bot').update({ last_error: text.slice(0, 500) }).eq('id', true);
  return text;
}

/* публікація за стабільним ключем (FR-007): частина, вже надіслана раніше, не дублюється — лише доробляється crosspost.
   Помилка надсилання — status 'failed' і виняток: події лишаються в черзі на наступний tick */
export async function publish(db: SupabaseClient, dc: Discord, channelId: string, key: string, bodies: Body[], announce: boolean) {
  const ids: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const k = partKey(key, i);
    const { data: old } = await db.from('discord_posts').select('message_id,status,crossposted').eq('key', k).maybeSingle();
    let mid: string | null = old?.status === 'sent' ? old.message_id : null;
    if (!mid) {
      await db.from('discord_posts').upsert({ key: k, channel_id: channelId, status: 'sending', error: '' });
      try {
        mid = await dc.send(channelId, bodies[i], k);
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        await db.from('discord_posts').update({ status: 'failed', error: text.slice(0, 500) }).eq('key', k);
        throw e;
      }
      await db.from('discord_posts').update({ message_id: mid, status: 'sent' }).eq('key', k);
    }
    /* пересилання підписникам — лише з каналу-оголошення; збій пересилання не скасовує публікацію */
    if (announce && !old?.crossposted) {
      try { await dc.crosspost(channelId, mid); await db.from('discord_posts').update({ crossposted: true }).eq('key', k); }
      catch (e) { await db.from('discord_posts').update({ error: ('crosspost: ' + (e instanceof Error ? e.message : String(e))).slice(0, 500) }).eq('key', k); }
    }
    ids.push(mid);
  }
  return ids;
}

const SITE = 'https://q-hub.fun';

/* увесь поточний прайс скупників групи — щоб повідомлення показувало весь прайс з вигідністю, а не лише змінене */
type BiRow = { buyer_id: string; item_id: number; price: number; min_price: number; max_price: number; items: { name: string } | null };
async function withBoard(db: SupabaseClient, groups: Group[]): Promise<Group[]> {
  if (!groups.length) return groups;
  const { data } = await db.from('buyer_items').select('buyer_id,item_id,price,min_price,max_price,items(name)')
    .in('buyer_id', groups.map(g => g.buyer.id)).gt('price', 0);
  const rows = (data ?? []) as unknown as BiRow[];
  return groups.map(g => ({
    ...g,
    board: rows.filter(r => r.buyer_id === g.buyer.id)
      .map(r => ({ item_id: r.item_id, name: r.items?.name ?? `Предмет #${r.item_id}`, price: r.price, min: r.min_price, max: r.max_price })),
  }));
}

/* події позначаються опублікованими списком id — частинами, щоб адреса запиту не була задовгою */
async function markPosted(db: SupabaseClient, events: Ev[], key: string, at: string) {
  const ids = events.map(e => e.id);
  for (let i = 0; i < ids.length; i += 200) {
    await db.from('discord_outbox').update({ post_key: key, posted_at: at }).in('id', ids.slice(i, i + 200)).is('post_key', null);
  }
}

/* ціни (US1 + 0056): черга → вікно збирання → по каналах скупників → у кожному каналі ліміт години й одне нове
   повідомлення (чи кілька частин). Скупник без каналу — нікуди. Збій одного каналу не зупиняє інші */
const tick: Action = async ({ db, dc }) => {
  const { data: bot } = await db.from('discord_bot').select('*').eq('id', true).single();
  if (!bot?.prices_on) return json({ posted: 0, reason: 'вимкнено' });
  const { data: evs, error } = await db.from('discord_outbox').select('id,buyer_id,item_id,price,prev_price,at')
    .is('post_key', null).order('id').limit(2000);
  if (error) return fail(500, 'Не вдалося прочитати чергу цін.');
  const events = (evs ?? []) as Ev[];
  const now = new Date(), at = now.toISOString();
  if (!due(events, now, bot.window_min)) return json({ posted: 0, waiting: events.length });

  const { data: map } = await db.from('discord_buyer_channels').select('buyer_id,channel_id');
  const { byChannel, orphan } = route(events, new Map((map ?? []).map((r: { buyer_id: string; channel_id: string }) => [r.buyer_id, r.channel_id])));
  if (orphan.length) await markPosted(db, orphan, 'none:' + Math.min(...orphan.map(e => e.id)), at);

  const buyerIds = [...new Set(events.map(e => e.buyer_id))], itemIds = [...new Set(events.map(e => e.item_id))];
  const [b, it] = await Promise.all([
    db.from('buyers').select('id,name,sort,next_change_at').in('id', buyerIds),
    db.from('items').select('id,name').in('id', itemIds),
  ]);
  const buyers = (b.data ?? []) as BuyerInfo[];
  const items = new Map((it.data ?? []).map((x: { id: number; name: string }) => [x.id, x.name]));
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();

  let posted = 0, waiting = 0;
  const errors: string[] = [];
  for (const [channelId, list] of byChannel) {
    const { count } = await db.from('discord_posts').select('key', { count: 'exact', head: true })
      .eq('channel_id', channelId).like('key', 'prices:%').eq('status', 'sent').gte('created_at', hourAgo);
    /* ліміт каналу вичерпано — його події чекають і підуть одним зведенням пізніше */
    if (!allowed(count ?? 0, bot.crosspost_per_hour)) { waiting += list.length; continue; }
    const key = postKey(list);
    try {
      const groups = await withBoard(db, group(list, buyers, items));
      if (groups.length) {
        const ch = await dc.channel(channelId);
        posted += (await publish(db, dc, channelId, key, pricesMessage(groups, { now, site: SITE }), ch.type === ANNOUNCEMENT)).length;
      }
      /* і ті, що повернулись до попередньої ціни: публікувати нічого */
      await markPosted(db, list, key, at);
    } catch (e) {
      waiting += list.length;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (errors.length) await markError(db, errors.join(' · ')); else await markOk(db);
  return json({ posted, waiting, skipped: orphan.length, errors });
};

/* канал для адмінки: назва, чи оголошення; помилка доступу — людським текстом (US3 AC3) */
async function channelInfo(dc: Discord, id: string) {
  if (!id) return null;
  try { const c = await dc.channel(id); return { id, name: c.name, announcement: c.type === ANNOUNCEMENT, guild_id: c.guild_id ?? '' }; }
  catch (e) { return { id, error: e instanceof DiscordError ? e.message : String(e) }; }
}

/* стан для адмінки (US3 AC1, US4 AC2): бот на зв'язку, сервери бота, канали, останні публікації */
const status: Action = async ({ db, dc }) => {
  const { data: bot } = await db.from('discord_bot').select('*').eq('id', true).single();
  let online = false, name = '', guilds: { id: string; name: string }[] = [], error = '';
  try {
    name = (await dc.me()).username; online = true;
    guilds = (await dc.guilds()).map(g => ({ id: g.id, name: g.name }));
  } catch (e) { error = await markError(db, e); }
  /* канали скупників (0056): назва й чи оголошення — для кожного вписаного; однаковий канал питаємо раз */
  const { data: map } = await db.from('discord_buyer_channels').select('buyer_id,channel_id');
  const ids = [...new Set([...(map ?? []).map((r: { channel_id: string }) => r.channel_id), bot?.news_channel_id ?? ''].filter(Boolean))];
  const infos = new Map(await Promise.all(ids.map(async id => [id, await channelInfo(dc, id)] as const)));
  const { data: posts } = await db.from('discord_posts').select('key,channel_id,status,error,crossposted,created_at')
    .order('created_at', { ascending: false }).limit(5);
  const { count: queued } = await db.from('discord_outbox').select('id', { count: 'exact', head: true }).is('post_key', null);
  if (online) await markOk(db);
  return json({
    online, bot: name, error, guilds,
    channels: { news: infos.get(bot?.news_channel_id ?? '') ?? null, byId: Object.fromEntries(infos) },
    posts: posts ?? [], queued: queued ?? 0,
  });
};

/* пробне повідомлення: { channel_id } — канал одного зі скупників або новин; без пересилання підписникам */
const test: Action = async ({ db, dc, body }) => {
  const want = String(body.channel_id ?? '');
  const { data: bot } = await db.from('discord_bot').select('news_channel_id').eq('id', true).single();
  const { data: map } = await db.from('discord_buyer_channels').select('channel_id').eq('channel_id', want).limit(1);
  const id = want && (want === bot?.news_channel_id || (map ?? []).length) ? want : '';
  if (!id) return json({ ok: false, error: 'Спершу впиши й збережи ID каналу.' });
  const key = `test:${new Date().toISOString()}`;
  try {
    await publish(db, dc, id, key, [TEST_MESSAGE], false);
    await markOk(db);
    return json({ ok: true });
  } catch (e) {
    let error = e instanceof Error ? e.message : String(e);
    if (e instanceof DiscordError && e.kind === 'forbidden') {
      const c = await channelInfo(dc, id);
      error = human('forbidden', 403, c && 'name' in c ? c.name : '');
    }
    await markError(db, error);
    return json({ ok: false, error });
  }
};

/* поточний прайс скупників у їхні канали без змін (рішення власника 2026-11-05):
   { buyer_ids: [...] } — вибраним; { missing: true } — тим, у чиєму каналі ще немає жодного надісланого повідомлення цін.
   Ключ — з хвилиною: подвійне натискання не дублює. Рахується в ліміт пересилань каналу (ключ prices:…) */
const board: Action = async ({ db, dc, body }) => {
  const { data: map } = await db.from('discord_buyer_channels').select('buyer_id,channel_id');
  let targets = (map ?? []) as { buyer_id: string; channel_id: string }[];
  if (Array.isArray(body.buyer_ids)) {
    const want = new Set((body.buyer_ids as unknown[]).map(String));
    targets = targets.filter(t => want.has(t.buyer_id));
  } else if (body.missing === true) {
    const { data: sent } = await db.from('discord_posts').select('channel_id').like('key', 'prices:%').eq('status', 'sent');
    const has = new Set((sent ?? []).map((r: { channel_id: string }) => r.channel_id));
    targets = targets.filter(t => !has.has(t.channel_id));
  } else return fail(400, 'Вкажи buyer_ids або missing: true.');
  if (!targets.length) return json({ posted: [], failed: [], note: 'Немає кому надсилати.' });

  const { data: b } = await db.from('buyers').select('id,name,sort,next_change_at').in('id', targets.map(t => t.buyer_id));
  const buyers = (b ?? []) as BuyerInfo[];
  const now = new Date(), minute = now.toISOString().slice(0, 16);
  const posted: string[] = [], failed: { buyer_id: string; error: string }[] = [];
  for (const t of targets) {
    const buyer = buyers.find(x => x.id === t.buyer_id);
    if (!buyer) continue;
    try {
      const groups = await withBoard(db, [{ buyer, rows: [] }]);
      if (!groups[0].board?.length) { failed.push({ buyer_id: t.buyer_id, error: 'У скупника немає цін.' }); continue; }
      const ch = await dc.channel(t.channel_id);
      await publish(db, dc, t.channel_id, `prices:board:${t.buyer_id}:${minute}`, pricesMessage(groups, { now, site: SITE }), ch.type === ANNOUNCEMENT);
      posted.push(t.buyer_id);
    } catch (e) {
      failed.push({ buyer_id: t.buyer_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failed.length) await markError(db, failed.map(f => `${f.buyer_id}: ${f.error}`).join(' · ')); else await markOk(db);
  return json({ posted, failed });
};

/* чернетки новин з CI після деплою (US2 AC1–2): верхній запис журналу програми й сайту → news_drafts.
   Наявна чернетка (той самий source_ref) не чіпається — повторний деплой нічого не дублює й не затирає правки */
const drafts: Action = async ({ db, body }) => {
  const list = [toDraft(body.changelog as Entry, 'changelog'), toDraft(body.site as Entry, 'site')].filter((d): d is DraftIn => !!d);
  if (!list.length) return json({ created: [], skipped: [] });
  const { data, error } = await db.from('news_drafts').upsert(list, { onConflict: 'source_ref', ignoreDuplicates: true }).select('source_ref');
  if (error) return fail(500, 'Не вдалося записати чернетки: ' + error.message);
  const created = (data ?? []).map((r: { source_ref: string }) => r.source_ref);
  return json({ created, skipped: list.map(d => d.source_ref).filter(r => !created.includes(r)) });
};

/* надіслати чернетку в канал новин (US2 AC4, AC8): ключ news:<id> — вдруге не дублюється; збій — чернетка лишається,
   кнопка дає повторити, а вже надіслане Discord-повідомлення не повториться (publish за ключем) */
const send: Action = async ({ db, dc, body }) => {
  const id = Number(body.draft_id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'Вкажи draft_id.');
  const { data: d } = await db.from('news_drafts').select('*').eq('id', id).maybeSingle();
  if (!d) return fail(404, 'Чернетку не знайдено.');
  if (d.status === 'sent') return json({ already: true });
  if (d.status !== 'draft') return fail(400, 'Ця чернетка не для публікації (об\'єднана чи «Не публікувати»).');
  const { data: bot } = await db.from('discord_bot').select('news_on,news_channel_id').eq('id', true).single();
  if (!bot?.news_on) return fail(400, 'Публікацію новин вимкнено: Discord-бот → «Публікувати новини».');
  if (!bot.news_channel_id) return fail(400, 'Не вказано канал новин: Discord-бот → «Канал новин».');
  const over = newsTooLong(d);
  if (over) return fail(400, `Новина задовга на ${over} символів — скороти пункти.`);
  const ch = await dc.channel(bot.news_channel_id);
  const [mid] = await publish(db, dc, bot.news_channel_id, `news:${id}`, [newsMessage(d)], ch.type === ANNOUNCEMENT);
  await db.from('news_drafts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
  await markOk(db);
  return json({ message_id: mid, channel: ch.name });
};

const ACTIONS: Record<string, Action> = { tick, board, drafts, send, test, status };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Лише POST');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return fail(400, 'Тіло запиту — JSON з полем action.'); }
  const action = String(body.action ?? '');
  if (!(action in ACTIONS)) return fail(400, 'Невідома дія: ' + action);

  const w = await who(req);
  /* секрет (cron, CI) може все; admin — лише дії адмінки */
  if (!w || (ACCESS[action] === 'secret' && w !== 'secret')) return fail(403, 'Лише адміністратор.');
  if (!TOKEN) return fail(500, 'Немає секрету DISCORD_BOT_TOKEN у функції.');

  const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    return await ACTIONS[action]({ db, dc: discord(TOKEN), body });
  } catch (e) {
    return fail(502, await markError(db, e));
  }
});
