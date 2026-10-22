/* Дані мапи: категорії й мітки з бази плюс вбудовані (роботи, скупники) з даних сайту. */
export interface MapCategory { id: string; name: string; grp: string; icon: string; color: string; sort: number; shown: boolean; builtin?: boolean }
export interface MapMark { id: string; dbId?: number; category: string; name: string; note: string; x: number; y: number; owner?: number | null; icon?: string; link?: { href: string; label: string } }

/* «Нік #статік» власника; ніка може не бути, якщо гравець не зареєстрований на сайті */
export const ownerLabel = (st: number, names: Record<number, string>) => (names[st] ? `${names[st]} #${st}` : `#${st}`);

export const GROUP_ORDER = ['Магазини', 'Структури', 'Транспорт', 'Розваги', 'Заробіток', 'Вендингові апарати', 'Міні-ігри, квести й контракти'];

/* групи в порядку QuantFun; нові групи адміна — після них, за найменшим sort їхніх категорій */
export function groupCategories(cats: MapCategory[]): { grp: string; cats: MapCategory[] }[] {
  const by = new Map<string, MapCategory[]>();
  for (const c of [...cats].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'uk'))) {
    if (!by.has(c.grp)) by.set(c.grp, []);
    by.get(c.grp)!.push(c);
  }
  const rank = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 100 + Math.min(...by.get(g)!.map(c => c.sort)) / 1000 : i; };
  return [...by.keys()].sort((a, b) => rank(a) - rank(b)).map(grp => ({ grp, cats: by.get(grp)! }));
}

const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'io' };
/* id категорії з назви: латиниця, цифри й дефіси (так вимагає база) */
export function slugify(name: string): string {
  const s = [...name.toLowerCase()].map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s.length >= 2 ? s : 'cat-' + Date.now().toString(36);
}

/* масове додавання: рядок «X, Y, назва» або «X Y назва»; коми в числах не плутаємо з роздільником */
export function parseBulk(text: string): { ok: { x: number; y: number; name: string }[]; bad: number[] } {
  const ok: { x: number; y: number; name: string }[] = [], bad: number[] = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim(); if (!t) return;
    const m = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*(?:[,;\s]\s*(.*))?$/.exec(t);
    if (!m) { bad.push(i + 1); return; }
    const x = +m[1], y = +m[2];
    if (x < -6000 || x > 6800 || y < -4400 || y > 8500) { bad.push(i + 1); return; }
    ok.push({ x, y, name: (m[3] || '').trim() });
  });
  return { ok, bad };
}
