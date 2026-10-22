/* останні завантажені ціни скупників: показуються одразу при відкритті сторінки, поки база відповідає.
   Сховище браузера може бути недоступне (приватний режим) — тоді просто працюємо без нього */
const KEY = 'qhub:prices:v1';

export interface PriceData<B, R, U, C, N> { at: string; buyers: B[]; rows: R[]; ups: U[]; top: C[]; next: N[] }

export function readCache<T extends { at: string; buyers: unknown[] }>(): T | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.buyers) && v.buyers.length ? v : null; } catch { return null; }
}
export function writeCache(v: { at: string; buyers: unknown[] }) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* немає місця або заборонено — не страшно */ }
}
/* знімок, зроблений під час збірки сайту (scripts/snapshot.mjs) */
export async function readSnapshot<T extends { at: string; buyers: unknown[] }>(): Promise<T | null> {
  try { const r = await fetch('/snapshot/prices.json', { cache: 'no-cache' }); if (!r.ok) return null; const v = await r.json(); return v && Array.isArray(v.buyers) && v.buyers.length ? v : null; } catch { return null; }
}
