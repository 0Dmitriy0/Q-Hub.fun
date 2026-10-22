import { kyParts, kyTs } from './events';
export const DAY = 864e5;
export const PERIOD = 30 * DAY;
/* від цієї частки діапазону ціна вважається вигідною для здачі (як зелена зона в хабі) */
export const GOOD = 80;
export function priceRange(pts, minSet, maxSet, now = Date.now(), period = PERIOD) {
    if (minSet > 0 && maxSet > minSet)
        return { min: minSet, max: maxSet, from: 'editor' };
    const seen = pts.filter(x => x.t >= now - period).map(x => x.p);
    if (seen.length < 2)
        return null;
    const min = Math.min(...seen), max = Math.max(...seen);
    return max > min ? { min, max, from: 'seen' } : null;
}
/* де ціна між мінімумом (0) і максимумом (100); ціна поза межами притискається до краю */
export function rangePos(price, r) {
    if (!r || !(price > 0))
        return null;
    return Math.round(Math.min(100, Math.max(0, ((price - r.min) / (r.max - r.min)) * 100)));
}
/* точки за період у хронологічному порядку; остання ціна до початку періоду стає першою точкою,
   щоб лінія не починалася з порожнечі */
export function series(pts, now = Date.now(), period = PERIOD) {
    const from = now - period, sorted = [...pts].sort((a, b) => a.t - b.t);
    const before = sorted.filter(x => x.t < from).pop();
    const inside = sorted.filter(x => x.t >= from && x.t <= now);
    return before ? [{ t: from, p: before.p }, ...inside] : inside;
}
/* скупники міняють ціни в різний час — ціна, якій більше 3 годин, підсвічується як «може бути застаріла» */
export const STALE = 3 * 36e5;
export function chartWindow(p, now = Date.now()) {
    const k = kyParts(now), midnight = kyTs(k.y, k.mo, k.d, 0, 0);
    if (p === 'today')
        return { from: midnight, to: now };
    if (p === 'yesterday') {
        const d = new Date(Date.UTC(k.y, k.mo - 1, k.d - 1));
        return { from: kyTs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0), to: midnight };
    }
    return { from: now - (p === 'month' ? 30 : 365) * DAY, to: now };
}
/* точки в довільному вікні: остання ціна перед вікном стає його першою точкою, остання — тягнеться до кінця вікна */
export function seriesIn(pts, from, to) {
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    const before = sorted.filter(x => x.t < from).pop();
    const inside = sorted.filter(x => x.t >= from && x.t <= to);
    return before ? [{ t: from, p: before.p }, ...inside] : inside;
}
