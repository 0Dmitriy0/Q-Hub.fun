const LOOK = {
    A: 'А', a: 'а', B: 'В', b: 'ь', C: 'С', c: 'с', E: 'Е', e: 'е', H: 'Н', K: 'К', k: 'к', M: 'М', m: 'т', O: 'О', o: 'о',
    P: 'Р', p: 'р', T: 'Т', t: 'т', X: 'Х', x: 'х', y: 'у', Y: 'У', u: 'и', r: 'г', n: 'п', i: 'і', I: 'І', '3': 'з'
};
export const norm = (s) => [...s].map(ch => LOOK[ch] ?? ch).join('').toLowerCase().replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = d[0];
        d[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const t = d[j];
            d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = t;
        }
    }
    return d[b.length];
}
const sim = (a, b) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);
/* найкраща назва з каталогу для рядка: пробуємо всі суцільні шматки слів рядка (сміття від картинок по краях відкидається) */
export function bestItem(text, items) {
    const words = norm(text).split(' ').filter(Boolean);
    if (!words.length)
        return null;
    let best = null;
    for (const it of items) {
        const target = norm(it.name), n = target.split(' ').length;
        for (let len = Math.max(1, n - 1); len <= n + 1; len++)
            for (let i = 0; i + len <= words.length; i++) {
                const sc = sim(words.slice(i, i + len).join(' '), target);
                if (!best || sc > best.score)
                    best = { item: it, score: sc };
            }
    }
    return best;
}
/* ціна в рядку: «$485», «$1 10», «Продати 140»; S і 5 на місці «$» теж трапляються */
export function readPrice(text) {
    const m = text.match(/(?:\$|Продати)\s*\$?\s*(\d[\d ]{0,8})/);
    if (!m)
        return null;
    const v = Number(m[1].replace(/\s/g, ''));
    return v > 0 && v < 1e8 ? v : null;
}
export const MIN_SCORE = 0.6;
/* скупник — той, чиїх товарів на скріні впізнано найбільше */
export function detectBuyer(lines, items) {
    const votes = {};
    for (const l of lines) {
        if (readPrice(l.text) != null)
            continue;
        const b = bestItem(l.text, items);
        if (b && b.score >= MIN_SCORE)
            votes[b.item.buyer_id] = (votes[b.item.buyer_id] || 0) + b.score;
    }
    const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
}
export function parseShot(lines, items) {
    const rows = [];
    const cols = [...new Set(lines.map(l => l.col))].sort();
    for (const c of cols) {
        let pending = null;
        for (const l of lines.filter(x => x.col === c).sort((a, b) => a.y - b.y)) {
            const price = readPrice(l.text);
            if (price != null) {
                if (pending && pending.price == null)
                    pending.price = price;
                else
                    rows.push({ item: null, read: '', price, score: 0 }); // ціна без упізнаної назви — гравець вибере товар сам
                continue;
            }
            const b = bestItem(l.text, items);
            if (b && b.score >= MIN_SCORE) {
                pending = { item: b.item, read: l.text.trim(), price: null, score: b.score };
                rows.push(pending);
            }
        }
    }
    /* одна й та сама назва могла впізнатись двічі — лишаємо впевненіший варіант з ціною */
    const seen = new Map();
    return rows.filter(r => {
        if (!r.item)
            return true;
        const prev = seen.get(r.item.id);
        if (!prev) {
            seen.set(r.item.id, r);
            return true;
        }
        if ((r.price != null && prev.price == null) || r.score > prev.score) {
            prev.price = r.price ?? prev.price;
            prev.score = Math.max(prev.score, r.score);
        }
        return false;
    });
}
