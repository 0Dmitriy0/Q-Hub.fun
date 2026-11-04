/* Івенти у WIKI (specs/055): порядок плиток, банер поточного батл пасу, фільтр, адреса сторінки, рівні батл пасу.
   Лише сезонні й особливі івенти з season_events; щоденні за розкладом (events.ts) — не тут. */
import { phase, type Phase } from './seasons';
import { slugify } from './mapData';

type Row = { kind: 'event' | 'battlepass'; starts_on: string; ends_on: string | null };
export type WithPhase<T> = T & { ph: Phase };
export type EventFilter = 'all' | 'now' | 'soon' | 'past';

const leftKey = (p: Phase) => (p.kind === 'now' ? p.left ?? 1e6 : 0);

/* banner — батл пас, що триває (з кількох — той, що закінчується раніше), серед плиток його немає;
   now — за днями до кінця (без кінця — після); soon — за днями до початку; past — новіші вище */
export function arrange<T extends Row>(rows: T[], today: string) {
  const all = rows.map(r => ({ ...r, ph: phase(r.starts_on, r.ends_on, today) }));
  const now = all.filter(r => r.ph.kind === 'now').sort((a, b) => leftKey(a.ph) - leftKey(b.ph));
  const soon = all.filter(r => r.ph.kind === 'soon').sort((a, b) => (a.ph.kind === 'soon' && b.ph.kind === 'soon' ? a.ph.in - b.ph.in : 0));
  const past = all.filter(r => r.ph.kind === 'past').sort((a, b) => ((b.ends_on ?? b.starts_on) < (a.ends_on ?? a.starts_on) ? -1 : 1));
  const banner = now.find(r => r.kind === 'battlepass') ?? null;
  return { banner, now: now.filter(r => r !== banner), soon, past };
}

/* «Усі» — те, що триває, і майбутнє; архів — окремо */
export function filter<T extends Row>(rows: T[], f: EventFilter, today: string): WithPhase<T>[] {
  const a = arrange(rows, today), now = a.banner ? [a.banner, ...a.now] : a.now;
  return f === 'now' ? now : f === 'soon' ? a.soon : f === 'past' ? a.past : [...now, ...a.soon];
}

/* «Ще N дн.» на плитці — лише коли лишилось 3 дні чи менше */
export const lastDays = (p: Phase) => (p.kind === 'now' && p.left != null && p.left <= 3 ? p.left : null);

/* адреса з назви; зайнята — з роком (Хелловін щороку), далі з номером */
export function suggestSlug(title: string, taken: string[], year: number): string {
  let base = slugify(title);
  if (base.startsWith('cat-')) base = 'event-' + base.slice(4);
  const busy = new Set(taken);
  if (!busy.has(base)) return base;
  const y = `${base}-${year}`;
  if (!busy.has(y)) return y;
  for (let n = 2; ; n++) if (!busy.has(`${y}-${n}`)) return `${y}-${n}`;
}

export interface LevelRow { level: number; reward: string; line: 'free' | 'paid' }
/* рядки «рівень; нагорода; free|paid» (лінія необов'язкова — free); порожні рядки пропускаються */
export function levelsFromText(text: string): { rows: LevelRow[]; error: string | null } {
  const rows: LevelRow[] = [], seen = new Set<string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim(); if (!t) continue;
    const [lv, reward = '', line = 'free'] = t.split(';').map(s => s.trim());
    const n = Number(lv), at = `Рядок ${i + 1}: `;
    if (!/^\d+$/.test(lv) || n < 1 || n > 500) return { rows, error: at + 'рівень — число від 1 до 500' };
    if (reward.length < 1 || reward.length > 200) return { rows, error: at + 'нагорода від 1 до 200 символів' };
    const l = (line || 'free').toLowerCase();
    if (l !== 'free' && l !== 'paid') return { rows, error: at + 'лінія — free або paid' };
    const key = `${n}:${l}`;
    if (seen.has(key)) return { rows, error: `${at}рівень ${n} (${l}) уже є` };
    seen.add(key);
    rows.push({ level: n, reward, line: l });
  }
  return { rows, error: null };
}

/* повний опис івенту → блоки (формат інструкцій: блоки через порожній рядок, «Знімок: https://…» — картинка).
   Додатково: «## Заголовок» — підзаголовок; блок з «Порада:» — виділена порада; блок з «Квест: Назва» — картка
   квесту з рядками «Завдання:», «Нагорода:», «Коли:», «Порада:» (порад може бути кілька; решта рядків — до завдання).
   Квести нумеруються в порядку тексту — це і є порядок виконання */
export type EventBlock =
  | { k: 'p'; text: string; image: string | null }
  | { k: 'h'; text: string }
  | { k: 'tip'; text: string }
  | { k: 'quest'; n: number; title: string; task: string; reward: string; when: string; tips: string[] };
const IMG = /^\s*знімок:\s*(https:\/\/\S+)\s*$/i;
const FIELD = /^\s*(квест|завдання|нагорода|коли|порада):\s*(.*)$/i;
export function eventBlocks(text: string): EventBlock[] {
  const out: EventBlock[] = []; let n = 0;
  for (const raw of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = FIELD.exec(lines[0]);
    if (head && head[1].toLowerCase() === 'квест') {
      const q = { k: 'quest' as const, n: ++n, title: head[2].trim(), task: '', reward: '', when: '', tips: [] as string[] };
      let last: 'task' | 'reward' | 'when' | 'tip' = 'task';
      for (const l of lines.slice(1)) {
        const m = FIELD.exec(l), key = m?.[1].toLowerCase();
        if (key === 'завдання') { q.task = (q.task ? q.task + '\n' : '') + m![2]; last = 'task'; }
        else if (key === 'нагорода') { q.reward = m![2]; last = 'reward'; }
        else if (key === 'коли') { q.when = m![2]; last = 'when'; }
        else if (key === 'порада') { q.tips.push(m![2]); last = 'tip'; }
        else if (last === 'tip') q.tips[q.tips.length - 1] += ' ' + l;
        else if (last === 'reward') q.reward += ' ' + l;
        else if (last === 'when') q.when += ' ' + l;
        else q.task = (q.task ? q.task + '\n' : '') + l;
      }
      out.push(q); continue;
    }
    if (head && head[1].toLowerCase() === 'порада') { out.push({ k: 'tip', text: [head[2], ...lines.slice(1)].join(' ').trim() }); continue; }
    if (lines.length === 1 && lines[0].startsWith('## ')) { out.push({ k: 'h', text: lines[0].slice(3).trim() }); continue; }
    let image: string | null = null;
    const body = lines.filter(l => { const m = IMG.exec(l); if (m) { image = m[1]; return false; } return true; }).join('\n');
    if (body || image) out.push({ k: 'p', text: body, image });
  }
  return out;
}

/* велика мапа лише з категоріями івенту — наявний ?show= (кілька id через кому, mapFilters.onlyIds) */
export const mapLink = (categoryIds: string[]) => '/mapa?show=' + categoryIds.join(',');
