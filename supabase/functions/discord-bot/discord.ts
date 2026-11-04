/* Discord REST API v10 для бота Q-Hub (specs/060, research R1): лише пише — без Gateway, тож нічого не читає (FR-011).
   Токен передається ззовні (секрет функції DISCORD_BOT_TOKEN) і ніколи не потрапляє в текст помилки (FR-010).
   Без Deno-залежностей — тестується vitest з підміною fetch. */

export const API = 'https://discord.com/api/v10';

export type Embed = {
  title?: string; url?: string; description?: string; color?: number;
  footer?: { text: string }; image?: { url: string }; timestamp?: string;
};
export type Body = { content?: string; embeds?: Embed[] };
export type Channel = { id: string; name: string; type: number; guild_id?: string };
export type Guild = { id: string; name: string };

/* 5 — канал-оголошення: лише з нього працює crosspost підписникам */
export const ANNOUNCEMENT = 5;

export type Kind = 'rate' | 'auth' | 'forbidden' | 'not_found' | 'bad' | 'other';
export class DiscordError extends Error {
  constructor(public kind: Kind, public status: number, message: string) { super(message); }
}

/* людський текст для адмінки (US3 AC3): що сталось і що зробити */
export function human(kind: Kind, status: number, channel = ''): string {
  const ch = channel ? ` #${channel}` : '';
  switch (kind) {
    case 'auth': return 'Токен бота недійсний: онови секрет DISCORD_BOT_TOKEN у Supabase.';
    case 'forbidden': return `Дай боту право писати в${ch || ' цей канал'}: «Дивитися канал», «Надсилати повідомлення», «Вбудовувати посилання».`;
    case 'not_found': return 'Канал не знайдено: перевір ID каналу й чи бот є на цьому сервері.';
    case 'rate': return 'Discord просить зачекати (ліміт запитів) — спробую в наступну хвилину.';
    case 'bad': return 'Discord не прийняв повідомлення (завелике чи неправильне).';
    default: return `Discord не відповів як слід (${status}).`;
  }
}

function kindOf(status: number): Kind {
  if (status === 429) return 'rate';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 400) return 'bad';
  return 'other';
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

export function discord(token: string, opts: { fetch?: Fetch; sleep?: Sleep } = {}) {
  const f: Fetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const sleep: Sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));

  /* 429 → почекати retry_after і повторити один раз; далі — помилка rate, наступний tick спробує знову */
  async function call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const r = await f(API + path, {
      method,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://q-hub.fun, 1) Q-Hub' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 429 && !retried) {
      let wait = 1;
      try { wait = Number((await r.json()).retry_after) || 1; } catch { /* без тіла — 1 с */ }
      if (wait <= 10) { await sleep(Math.ceil(wait * 1000)); return call<T>(method, path, body, true); }
    }
    if (!r.ok) { const k = kindOf(r.status); throw new DiscordError(k, r.status, human(k, r.status)); }
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  return {
    send: async (channelId: string, body: Body) =>
      (await call<{ id: string }>('POST', `/channels/${channelId}/messages`, { ...body, allowed_mentions: { parse: [] } })).id,
    crosspost: (channelId: string, messageId: string) =>
      call<unknown>('POST', `/channels/${channelId}/messages/${messageId}/crosspost`),
    channel: (channelId: string) => call<Channel>('GET', `/channels/${channelId}`),
    me: () => call<{ id: string; username: string }>('GET', '/users/@me'),
    guilds: () => call<Guild[]>('GET', '/users/@me/guilds'),
  };
}
export type Discord = ReturnType<typeof discord>;
