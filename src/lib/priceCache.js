/* останні завантажені ціни скупників: показуються одразу при відкритті сторінки, поки база відповідає.
   Сховище браузера може бути недоступне (приватний режим) — тоді просто працюємо без нього */
const KEY = 'qhub:prices:v1';
export function readCache() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        return v && Array.isArray(v.buyers) && v.buyers.length ? v : null;
    }
    catch {
        return null;
    }
}
export function writeCache(v) {
    try {
        localStorage.setItem(KEY, JSON.stringify(v));
    }
    catch { /* немає місця або заборонено — не страшно */ }
}
/* знімок, зроблений під час збірки сайту (scripts/snapshot.mjs) */
export async function readSnapshot() {
    try {
        const r = await fetch('/snapshot/prices.json', { cache: 'no-cache' });
        if (!r.ok)
            return null;
        const v = await r.json();
        return v && Array.isArray(v.buyers) && v.buyers.length ? v : null;
    }
    catch {
        return null;
    }
}
