/* Категорія мітки за набраним текстом (вікно F9 «Точку не знайдено»): «бак» → «Сміттєві баки».
   Спершу ті, що починаються з набраного, потім де з нього починається слово, потім будь-де в назві, наприкінці — збіг групи. */
export interface Cat { id: string; name: string; grp: string }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim();

export function matchCats(cats: Cat[], text: string, limit = 6): Cat[] {
  const q = norm(text); if (!q) return [];
  const rank = (c: Cat) => {
    const n = norm(c.name);
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s/-]+/).some(w => w.startsWith(q))) return 1;
    if (n.includes(q)) return 2;
    if (norm(c.grp).includes(q)) return 3;
    return -1;
  };
  return cats.map(c => ({ c, r: rank(c) })).filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name, 'uk'))
    .slice(0, limit).map(x => x.c);
}
