/* Discord-бот Q-Hub (specs/060, contracts/discord-bot-function.md): публікує ціни скупників і новини в Discord.
   Хто кличе: pg_cron щохвилини й CI після деплою (x-sync-secret) або адмін з адмін-панелі (сесія admin).
   Дії: tick (ціни) і drafts (чернетки новин) — лише з секретом; send, test, status — лише admin.
   Секрети функції: DISCORD_BOT_TOKEN, DISCORD_SYNC_SECRET, SUPABASE_SERVICE_ROLE_KEY. Токен не потрапляє ні в базу, ні у відповідь. */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { ANNOUNCEMENT, discord, DiscordError, human, type Body, type Discord } from './discord.ts';
import { allowed, due, group, partKey, postKey, type BuyerInfo, type Ev } from './prices.ts';
import { pricesMessage, TEST_MESSAGE } from './format.ts';

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
const ACCESS: Record<string, Who> = { tick: 'secret', drafts: 'secret', send: 'admin', test: 'admin', status: 'admin' };

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

/* ціни (US1): черга → вікно збирання → ліміт години → одне нове повідомлення (чи кілька частин) у канал цін */
const tick: Action = async ({ db, dc }) => {
  const { data: bot } = await db.from('discord_bot').select('*').eq('id', true).single();
  if (!bot?.prices_on || !bot.prices_channel_id) return json({ posted: 0, reason: 'вимкнено' });
  const { data: evs, error } = await db.from('discord_outbox').select('id,buyer_id,item_id,price,prev_price,at')
    .is('post_key', null).order('id').limit(2000);
  if (error) return fail(500, 'Не вдалося прочитати чергу цін.');
  const events = (evs ?? []) as Ev[];
  const now = new Date();
  if (!due(events, now, bot.window_min)) return json({ posted: 0, waiting: events.length });

  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const { count } = await db.from('discord_posts').select('key', { count: 'exact', head: true })
    .eq('channel_id', bot.prices_channel_id).like('key', 'prices:%').eq('status', 'sent').gte('created_at', hourAgo);
  if (!allowed(count ?? 0, bot.crosspost_per_hour)) return json({ posted: 0, waiting: events.length, reason: 'ліміт години' });

  const buyerIds = [...new Set(events.map(e => e.buyer_id))], itemIds = [...new Set(events.map(e => e.item_id))];
  const [b, it] = await Promise.all([
    db.from('buyers').select('id,name,sort,next_change_at').in('id', buyerIds),
    db.from('items').select('id,name').in('id', itemIds),
  ]);
  const groups = group(events, (b.data ?? []) as BuyerInfo[], new Map((it.data ?? []).map((x: { id: number; name: string }) => [x.id, x.name])));
  const key = postKey(events);
  let posted = 0;
  if (groups.length) {
    const ch = await dc.channel(bot.prices_channel_id);
    posted = (await publish(db, dc, bot.prices_channel_id, key, pricesMessage(groups, { now, site: SITE }), ch.type === ANNOUNCEMENT)).length;
  }
  /* усі події вікна — опубліковані (і ті, що повернулись до попередньої ціни: публікувати нічого) */
  /* за межею id, а не списком: до 2000 id у списку — задовга адреса запиту */
  await db.from('discord_outbox').update({ post_key: key, posted_at: now.toISOString() })
    .is('post_key', null).lte('id', Math.max(...events.map(e => e.id)));
  await markOk(db);
  return json({ posted, events: events.length, key });
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
  const [prices, news] = await Promise.all([channelInfo(dc, bot?.prices_channel_id ?? ''), channelInfo(dc, bot?.news_channel_id ?? '')]);
  const { data: posts } = await db.from('discord_posts').select('key,channel_id,status,error,crossposted,created_at')
    .order('created_at', { ascending: false }).limit(5);
  const { count: queued } = await db.from('discord_outbox').select('id', { count: 'exact', head: true }).is('post_key', null);
  if (online) await markOk(db);
  return json({ online, bot: name, error, guilds, channels: { prices, news }, posts: posts ?? [], queued: queued ?? 0 });
};

/* пробне повідомлення в канал цін чи новин; без пересилання підписникам */
const test: Action = async ({ db, dc, body }) => {
  const which = body.channel === 'news' ? 'news' : 'prices';
  const { data: bot } = await db.from('discord_bot').select('prices_channel_id,news_channel_id').eq('id', true).single();
  const id = which === 'news' ? bot?.news_channel_id : bot?.prices_channel_id;
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

const notYet: Action = async () => fail(501, 'Ця дія ще не зроблена.');
const ACTIONS: Record<string, Action> = { tick, drafts: notYet, send: notYet, test, status };

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
