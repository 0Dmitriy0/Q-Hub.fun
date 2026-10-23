/* Розбір скріншота скупника після розпізнавання тексту.
   У грі кожна картка — «Назва» великим білим, опис дрібно, «Продати $ціна ЗА ШТ./КГ.».
   Розпізнавання часто читає кирилицю латиницею (Curapa = Сигара), тож порівнюємо назви після заміни схожих літер
   і з допуском на помилки. Ціна в колонці належить найближчій назві над нею. */
export interface OcrLine { text: string; y: number; col: number }
export interface CatalogItem { id: number; name: string; buyer_id: string }
export interface ShotRow { item: CatalogItem | null; read: string; price: number | null; score: number }

const LOOK: Record<string, string> = {
  A: 'А', a: 'а', B: 'В', b: 'ь', C: 'С', c: 'с', E: 'Е', e: 'е', H: 'Н', K: 'К', k: 'к', M: 'М', m: 'т', O: 'О', o: 'о',
  P: 'Р', p: 'р', T: 'Т', t: 'т', X: 'Х', x: 'х', y: 'у', Y: 'У', u: 'и', r: 'г', n: 'п', i: 'і', I: 'І', '3': 'з'
};
export const norm = (s: string) => [...s].map(ch => LOOK[ch] ?? ch).join('').toLowerCase().replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
const sim = (a: string, b: string) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);

/* найкраща назва з каталогу для рядка: пробуємо всі суцільні шматки слів рядка (сміття від картинок по краях відкидається) */
export function bestItem(text: string, items: CatalogItem[]): { item: CatalogItem; score: number } | null {
  const words = norm(text).split(' ').filter(Boolean); if (!words.length) return null;
  let best: { item: CatalogItem; score: number } | null = null;
  for (const it of items) {
    const target = norm(it.name), n = target.split(' ').length;
    for (let len = Math.max(1, n - 1); len <= n + 1; len++)
      for (let i = 0; i + len <= words.length; i++) {
        const sc = sim(words.slice(i, i + len).join(' '), target);
        if (!best || sc > best.score) best = { item: it, score: sc };
      }
  }
  return best;
}

/* ціна в рядку: «$485», «$1 10», «Продати 140»; S і 5 на місці «$» теж трапляються */
export function readPrice(text: string): number | null {
  const m = text.match(/(?:\$|Продати)\s*\$?\s*(\d[\d ]{0,8})/);
  if (!m) return null;
  const v = Number(m[1].replace(/\s/g, ''));
  return v > 0 && v < 1e8 ? v : null;
}

export const MIN_SCORE = 0.6;

/* скупник — той, чиїх товарів на скріні впізнано найбільше */
export function detectBuyer(lines: OcrLine[], items: CatalogItem[]): string | null {
  const votes: Record<string, number> = {};
  for (const l of lines) { if (readPrice(l.text) != null) continue; const b = bestItem(l.text, items); if (b && b.score >= MIN_SCORE) votes[b.item.buyer_id] = (votes[b.item.buyer_id] || 0) + b.score; }
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

export function parseShot(lines: OcrLine[], items: CatalogItem[]): ShotRow[] {
  const rows: ShotRow[] = [];
  const cols = [...new Set(lines.map(l => l.col))].sort();
  for (const c of cols) {
    let pending: ShotRow | null = null;
    for (const l of lines.filter(x => x.col === c).sort((a, b) => a.y - b.y)) {
      const price = readPrice(l.text);
      if (price != null) {
        if (pending && pending.price == null) pending.price = price;
        else rows.push({ item: null, read: '', price, score: 0 });   // ціна без упізнаної назви — гравець вибере товар сам
        continue;
      }
      const b = bestItem(l.text, items);
      if (b && b.score >= MIN_SCORE) { pending = { item: b.item, read: l.text.trim(), price: null, score: b.score }; rows.push(pending); }
    }
  }
  /* одна й та сама назва могла впізнатись двічі — лишаємо впевненіший варіант з ціною */
  const seen = new Map<number, ShotRow>();
  return rows.filter(r => {
    if (!r.item) return true;
    const prev = seen.get(r.item.id);
    if (!prev) { seen.set(r.item.id, r); return true; }
    if ((r.price != null && prev.price == null) || r.score > prev.score) { prev.price = r.price ?? prev.price; prev.score = Math.max(prev.score, r.score); }
    return false;
  });
}

/* Відео: кожен кадр розібрано окремо. Товар бере ціну, яку прочитали найчастіше (помилки розпізнавання
   випадкові, а правильна ціна повторюється з кадру в кадр); при рівності — з пізнішого кадру. Ціни без назви
   з відео не беремо: на сусідніх кадрах той самий товар зазвичай впізнається з назвою */
export function mergeFrames(frames: ShotRow[][]): ShotRow[] {
  const by = new Map<number, { row: ShotRow; votes: Map<number, { n: number; last: number }> }>();
  frames.forEach((rows, f) => {
    for (const r of rows) {
      if (!r.item) continue;
      let e = by.get(r.item.id);
      if (!e) { e = { row: { ...r, price: null }, votes: new Map() }; by.set(r.item.id, e); }
      if (r.score > e.row.score) e.row = { ...r, price: e.row.price };
      if (r.price != null) { const v = e.votes.get(r.price) || { n: 0, last: 0 }; v.n++; v.last = f; e.votes.set(r.price, v); }
    }
  });
  return [...by.values()].map(({ row, votes }) => {
    const top = [...votes.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0];
    return { ...row, price: top ? top[0] : null };
  });
}
