/* Вигляд повідомлень бота (specs/060, contracts/messages.md). Чисте — без Deno й мережі: те саме імпортує сайт для
   перегляду в адмінці. Українською, без ніків тих, хто вносив ціни (FR-012). */
import type { Body, Embed } from './discord.ts';
import type { Group } from './prices.ts';

export const COLOR = 0xff6b00;   // --accent сайту
const TZ = 'Europe/Kyiv';
/* ліміти Discord: 10 embed і 6000 символів на повідомлення, 4096 — опис одного embed */
const MAX_EMBEDS = 10, MAX_TOTAL = 6000, MAX_DESC = 4096;

export const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' $';

const hm = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dm = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: 'numeric', month: 'long' });
export const kyivTime = (d: Date) => hm.format(d);

/* «сьогодні о 18:00» / «завтра о 00:30» / «7 листопада о 10:00»; минула чи невідома — null */
export function nextChange(at: string | null, now: Date): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (!(d.getTime() > now.getTime())) return null;
  const day = ymd.format(d), today = ymd.format(now), tomorrow = ymd.format(new Date(now.getTime() + 86_400_000));
  const when = day === today ? 'сьогодні' : day === tomorrow ? 'завтра' : dm.format(d);
  return `${when} о ${hm.format(d)}`;
}

/* розмітка Discord у назвах предметів не повинна ламати рядок */
export const escape = (s: string) => s.replace(/([\\*_~`|>[\]])/g, '\\$1');

function mark(price: number, prev: number | null) {
  if (prev === null) return '● нове';
  const d = price - prev;
  return d > 0 ? `▲ +${money(d).slice(0, -2)}` : `▼ −${money(-d).slice(0, -2)}`;
}

/* рядки → описи не довші за MAX_DESC, ділимо по рядках */
function chunks(lines: string[], max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const l of lines) {
    if (cur && cur.length + 1 + l.length > max) { out.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + l : l;
  }
  if (cur) out.push(cur);
  return out;
}

const size = (e: Embed) => (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0);

/* одне вікно змін → одне чи кілька повідомлень: embed на скупника, довгий список — продовженнями */
export function pricesMessage(groups: Group[], opt: { now: Date; site: string }): Body[] {
  const embeds: Embed[] = [];
  for (const g of groups) {
    const lines = g.rows.map(r => `${escape(r.name)} — **${money(r.price)}** ${mark(r.price, r.prev)}`);
    const next = nextChange(g.buyer.next_change_at, opt.now);
    const footer = { text: next ? `Наступна зміна: ${next} · Q-Hub` : 'Q-Hub' };
    const title = escape(g.buyer.name);
    chunks(lines, MAX_DESC).forEach((description, i) => embeds.push({
      title: i === 0 ? title : `${title} (продовження)`,
      url: `${opt.site}/tsiny#${encodeURIComponent(g.buyer.id)}`,
      description, color: COLOR, footer,
    }));
  }
  /* пакування: ≤ 10 embed і ≤ 6000 символів (з запасом на content) на повідомлення */
  const packs: Embed[][] = [];
  let cur: Embed[] = [], total = 0;
  for (const e of embeds) {
    if (cur.length && (cur.length >= MAX_EMBEDS || total + size(e) > MAX_TOTAL - 100)) { packs.push(cur); cur = []; total = 0; }
    cur.push(e); total += size(e);
  }
  if (cur.length) packs.push(cur);
  const head = `🛒 Оновлення цін скупників · ${kyivTime(opt.now)}`;
  return packs.map((p, i) => ({ content: packs.length > 1 ? `${head} (${i + 1}/${packs.length})` : head, embeds: p }));
}

export const TEST_MESSAGE: Body = { content: 'Пробне повідомлення Q-Hub — бот бачить цей канал і може писати.' };
