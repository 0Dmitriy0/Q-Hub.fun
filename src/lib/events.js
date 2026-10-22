const every = (from, step, minute) => { const a = []; for (let h = from; h < 24; h += step)
    a.push([h, minute]); return a; };
export const EVENTS = [
    { id: 'lottery', name: 'Лотерея', sched: 'щогодини, :00–:05', dur: 5, slots: every(0, 1, 0) },
    { id: 'race', name: 'Перегони', sched: 'щогодини, :02–:07', dur: 5, slots: every(0, 1, 2) },
    { id: 'gungame', name: 'GunGame', sched: 'непарні години, :20–:25', dur: 5, slots: every(1, 2, 20) },
    { id: 'ufo', name: 'НЛО', sched: '12:15–14:15 · 17:15–19:15 · 22:15–00:15', dur: 120, slots: [[12, 15], [17, 15], [22, 15]] },
    { id: 'restart', name: 'Рестарт сервера', sched: 'щодня о 05:15', dur: 0, slots: [[5, 15]] }
];
const MIN = 60000;
let fmt = null;
try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
catch {
    fmt = null;
}
export function kyParts(ts) {
    if (!fmt) {
        const d = new Date(ts);
        return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
    }
    const o = {};
    for (const p of fmt.formatToParts(new Date(ts)))
        o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
}
/* київська дата й час → мітка часу, з урахуванням переходу на літній/зимовий час */
export function kyTs(y, mo, d, h, mi) {
    const want = Date.UTC(y, mo - 1, d, h, mi);
    let g = want;
    for (let i = 0; i < 3; i++) {
        const p = kyParts(g);
        g += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    }
    return g;
}
const shift = (p, n) => { const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
export const kyHM = (ts) => { const p = kyParts(ts); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); };
export function dur(ms) {
    if (ms < MIN)
        return 'менше хвилини';
    let m = Math.ceil(ms / MIN);
    const h = Math.floor(m / 60);
    m %= 60;
    return h ? `${h} год${m ? ` ${m} хв` : ''}` : `${m} хв`;
}
export function eventStatus(now) {
    const p = kyParts(now);
    const occ = [];
    for (const n of [-1, 0, 1]) {
        const d = shift(p, n);
        for (const ev of EVENTS)
            for (const [h, mi] of ev.slots) {
                const s = kyTs(d.y, d.mo, d.d, h, mi);
                occ.push({ ev, s, e: s + ev.dur * MIN });
            }
    }
    occ.sort((a, b) => a.s - b.s);
    return EVENTS.map(ev => {
        const mine = occ.filter(o => o.ev === ev);
        const cur = ev.dur > 0 ? mine.find(o => o.s <= now && now < o.e) : undefined;
        const next = mine.find(o => o.s > now);
        return { ev, now: cur ? { s: cur.s, e: cur.e } : null, next: next ? { s: next.s, e: next.e } : null };
    });
}
