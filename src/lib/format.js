const nf = new Intl.NumberFormat('uk-UA');
export const fmt = (n) => nf.format(Math.round(Number(n) || 0));
export const money = (n) => fmt(n) + ' $';
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)) + ' $';
export const qty = (n) => (Number(n) % 1 === 0 ? fmt(n) : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 }));
/* час гри — київський, незалежно від того, де гравець */
const df = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const when = (ts) => df.format(new Date(ts));
/* «150 000», «150к», «1,5кк», «1.5m» → число */
export function parseMoney(s) {
    const t = String(s).trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
    const m = t.match(/^(\d+(?:\.\d+)?)(кк|kk|m|млн|к|k|тис)?\$?$/);
    if (!m)
        return Number(t.replace(/[^\d]/g, '')) || 0;
    const v = parseFloat(m[1]);
    const mul = m[2] === 'кк' || m[2] === 'kk' || m[2] === 'm' || m[2] === 'млн' ? 1e6 : m[2] ? 1e3 : 1;
    return Math.round(v * mul);
}
