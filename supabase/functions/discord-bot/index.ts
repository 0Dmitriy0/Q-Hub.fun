/* Discord-бот Q-Hub (specs/060, contracts/discord-bot-function.md): публікує ціни скупників і новини в Discord.
   Хто кличе: pg_cron щохвилини й CI після деплою (x-sync-secret) або адмін з адмін-панелі (сесія admin).
   Дії: tick (ціни) і drafts (чернетки новин) — лише з секретом; send, test, status — лише admin.
   Секрети функції: DISCORD_BOT_TOKEN, DISCORD_SYNC_SECRET, SUPABASE_SERVICE_ROLE_KEY. Токен не потрапляє ні в базу, ні у відповідь. */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { discord, DiscordError, type Discord } from './discord.ts';

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

const notYet: Action = async () => fail(501, 'Ця дія ще не зроблена.');
const ACTIONS: Record<string, Action> = { tick: notYet, drafts: notYet, send: notYet, test: notYet, status: notYet };

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
