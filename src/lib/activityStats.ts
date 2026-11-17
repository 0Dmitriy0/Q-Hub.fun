/* Статистика активності для щомісячних конкурсів (specs/091): період за київським часом, текст оголошення для Discord,
   CSV і шаблон сповіщення переможцю. Чиста логіка без мережі — підрахунок робить база (activity_top, 0075/0076). */

export type Category = 'prices' | 'marks' | 'guides';
export const CATEGORIES: Category[] = ['prices', 'marks', 'guides'];
export const CATEGORY_LABEL: Record<Category | 'other', string> = {
  prices: 'Ціни скупників', marks: 'Мітки на мапі', guides: 'Гайди', other: 'Інше',
};

export interface TopRow { category: Category; place: number; userId: string; nick: string | null; cnt: number; reachedAt: string }
/* дні за Києвом, включно: YYYY-MM-DD */
export interface Period { from: string; to: string }

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m — 1…12
const parse = (s: string) => s.split('-').map(Number) as [number, number, number];

/* сьогоднішня дата за Києвом */
export function kyivToday(now: Date = new Date()): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return [get('year'), get('month'), get('day')];
}

export function currentMonth(now: Date = new Date()): Period {
  const [y, m] = kyivToday(now);
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
}

export function previousMonth(now: Date = new Date()): Period {
  let [y, m] = kyivToday(now);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
}

const days = (p: Period) => {
  const [a, b] = [parse(p.from), parse(p.to)];
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
};

/* кінець не раніше початку й не довше року (366 днів включно) */
export function validPeriod(p: Period): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) return false;
  const d = days(p);
  return d >= 0 && d <= 365;
}

/* «листопад 2026» для повного місяця, інакше «5–12 листопада 2026» / «28 жовтня – 3 листопада 2026» */
export function periodLabel(p: Period): string {
  const [y1, m1, d1] = parse(p.from);
  const [y2, m2, d2] = parse(p.to);
  if (y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDay(y2, m2)) return `${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${d1} ${MONTHS_GEN[m1 - 1]} ${y1}` : `${d1}–${d2} ${MONTHS_GEN[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS_GEN[m1 - 1]} – ${d2} ${MONTHS_GEN[m2 - 1]} ${y1}`;
  return `${d1} ${MONTHS_GEN[m1 - 1]} ${y1} – ${d2} ${MONTHS_GEN[m2 - 1]} ${y2}`;
}

/* нік буквально в Discord: розмітка екранована, @ не пінгує (U+200B після @) */
export function escapeDiscord(s: string): string {
  return s.replace(/[\\*_~`|>#[\]]/g, '\\$&').replace(/@/g, '@\u200b');
}

export const nickOrPlaceholder = (nick: string | null) => (nick && nick.trim()) || 'без ніку';

const MEDALS = ['🥇', '🥈', '🥉'];
export const DISCORD_LIMIT = 2000;

/* оголошення з топ-3 кожної категорії; частини ≤ 2000 символів, розрив лише між категоріями */
export function discordAnnouncement(rows: TopRow[], period: Period, limit = DISCORD_LIMIT): string[] {
  const head = `🏆 **Активність на Q-Hub — ${periodLabel(period)}**`;
  const blocks = CATEGORIES.map(cat => {
    const top = rows.filter(r => r.category === cat).sort((a, b) => a.place - b.place).slice(0, 3);
    const lines = top.length
      ? top.map((r, i) => `${MEDALS[i]} ${escapeDiscord(nickOrPlaceholder(r.nick))} — ${r.cnt}`)
      : ['— немає учасників'];
    return [`**${CATEGORY_LABEL[cat]}**`, ...lines].join('\n');
  });
  const parts: string[] = [];
  let cur = head;
  for (const b of blocks) {
    const next = `${cur}\n\n${b}`;
    if (next.length <= limit) { cur = next; continue; }
    parts.push(cur);
    cur = b.length <= limit ? b : b.slice(0, limit);
  }
  parts.push(cur);
  return parts;
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/* CSV для Excel з українською локаллю: BOM, роздільник «;», усі поля в лапках */
export function toCsv(rows: TopRow[]): string {
  const lines = [['Категорія', 'Місце', 'Нік', 'Кількість'].map(csvCell).join(';')];
  for (const cat of CATEGORIES) {
    for (const r of rows.filter(x => x.category === cat).sort((a, b) => a.place - b.place)) {
      lines.push([CATEGORY_LABEL[cat], r.place, nickOrPlaceholder(r.nick), r.cnt].map(csvCell).join(';'));
    }
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/* шаблон сповіщення переможцю — адмін може відредагувати перед надсиланням */
export function winnerTemplate(nick: string | null, category: Category, place: number, period: Period): { title: string; body: string } {
  const who = nick && nick.trim() ? nick.trim() : 'гравцю';
  const label = periodLabel(period);
  return {
    title: `🏆 ${place} місце: ${CATEGORY_LABEL[category]} — ${label}`,
    body: `Вітаємо, ${who}! Ти посів(-ла) ${place} місце в категорії «${CATEGORY_LABEL[category]}» за ${label}. Дякуємо, що допомагаєш Q-Hub!`,
  };
}

/* сирий рядок activity_top → TopRow */
export function toTopRow(r: { category: string; place: number; user_id: string; nick: string | null; cnt: number; reached_at: string }): TopRow {
  return { category: r.category as Category, place: r.place, userId: r.user_id, nick: r.nick, cnt: r.cnt, reachedAt: r.reached_at };
}
