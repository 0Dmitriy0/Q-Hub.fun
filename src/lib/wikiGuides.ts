/* Гайди у WIKI (вкладка «Гайди», таблиця public.guides з category, 0046). Текст — у форматі інструкцій (guide.ts):
   кроки, «Етап:», «Важливо:», [кнопки], посилання. Тут — те, чого інструкції мапи не треба: посилання на сторінки сайту
   й порядок розділів */
import { pieces, type Piece } from './guide';

export interface WikiGuide { slug: string; title: string; category: string; summary: string; body: string; sort: number; checked_on: string | null; published: boolean }

/* розділи WIKI в такому порядку; новий розділ, якого тут немає, стає в кінець */
export const CATEGORIES = ['Новачку', 'Заробіток', 'RP-процеси', 'Q-Hub'];

/* сторінки сайту, які в тексті гайду стають посиланнями; «/me», «/do» й інші команди гри — ні */
const SITE = /(^|[\s(«])(\/(?:wiki|mapa|tsiny|programa|kabinet)(?:[\w\-/?=&.%]*[\w/=])?)/g;

export type GuidePiece = Piece | { k: 'site'; v: string };
export function guidePieces(text: string): GuidePiece[] {
  const out: GuidePiece[] = [];
  for (const p of pieces(text)) {
    if (p.k !== 'text') { out.push(p); continue; }
    let at = 0;
    for (const m of p.v.matchAll(SITE)) {
      const start = m.index! + m[1].length;
      if (start > at) out.push({ k: 'text', v: p.v.slice(at, start) });
      out.push({ k: 'site', v: m[2] });
      at = start + m[2].length;
    }
    if (at < p.v.length) out.push({ k: 'text', v: p.v.slice(at) });
  }
  return out;
}

/* гайди розділами: розділи — за CATEGORIES, у розділі — за sort, далі за назвою */
export function byCategory(list: WikiGuide[]): { category: string; guides: WikiGuide[] }[] {
  const rank = (c: string) => { const i = CATEGORIES.indexOf(c); return i < 0 ? CATEGORIES.length : i; };
  const cats = [...new Set(list.map(g => g.category))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'uk'));
  return cats.map(category => ({ category, guides: list.filter(g => g.category === category).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'uk')) }));
}

/* адреса нового гайду з латиниці: «Перший день» → pershyi-den (адмін може змінити) */
const UA: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', '’': '' };
export const slugOf = (title: string) => [...title.toLowerCase()].map(c => UA[c] ?? c).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
export const slugOk = (s: string) => /^[a-z0-9-]{2,40}$/.test(s);
