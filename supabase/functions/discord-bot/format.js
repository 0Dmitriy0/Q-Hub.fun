export const COLOR = 0xff6b00; // --accent сайту
const TZ = 'Europe/Kyiv';
/* ліміти Discord: 10 embed і 6000 символів на повідомлення, 25 полів і 1024 символи на поле */
const MAX_EMBEDS = 10, MAX_TOTAL = 6000;
export const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' $';
const hm = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dm = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: 'numeric', month: 'long' });
export const kyivTime = (d) => hm.format(d);
/* «сьогодні о 18:00» / «завтра о 00:30» / «7 листопада о 10:00»; минула чи невідома — null */
export function nextChange(at, now) {
    if (!at)
        return null;
    const d = new Date(at);
    if (!(d.getTime() > now.getTime()))
        return null;
    const day = ymd.format(d), today = ymd.format(now), tomorrow = ymd.format(new Date(now.getTime() + 86_400_000));
    const when = day === today ? 'сьогодні' : day === tomorrow ? 'завтра' : dm.format(d);
    return `${when} о ${hm.format(d)}`;
}
/* розмітка Discord у назвах предметів не повинна ламати рядок */
export const escape = (s) => s.replace(/([\\*_~`|>[\]])/g, '\\$1');
function mark(price, prev) {
    if (prev === null)
        return '● нове';
    const d = price - prev;
    return d > 0 ? `▲ +${money(d).slice(0, -2)}` : `▼ −${money(-d).slice(0, -2)}`;
}
/* вигідність — де ціна між мінімумом і максимумом скупника, 0–100 (як «за вигідністю» на сайті); без меж — null */
export function profit(price, min, max) {
    if (!(max > min) || !(min > 0))
        return null;
    return Math.max(0, Math.min(100, Math.round((price - min) * 100 / (max - min))));
}
export const tier = (p) => (p === null ? '⚪' : p >= 90 ? '🔥' : p >= 70 ? '🟢' : p >= 40 ? '🟡' : '🔴');
/* значок скупника в заголовку; невідомий — кошик */
const BUYER_ICON = {
    harvest: '🌾', mush: '🍄', wood: '🪵', metal: '🔩', junk: '🧰', fuel: '⛽', fish: '🐟', food: '🍞', hide: '🦌',
};
export const buyerIcon = (id) => BUYER_ICON[id] ?? '🛒';
/* рядки → шматки не довші за max символів, ділимо по рядках */
function chunks(lines, max) {
    const out = [];
    let cur = '';
    for (const l of lines) {
        if (cur && cur.length + 1 + l.length > max) {
            out.push(cur);
            cur = '';
        }
        cur = cur ? cur + '\n' + l : l;
    }
    if (cur)
        out.push(cur);
    return out;
}
const size = (e) => (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0)
    + (e.fields ?? []).reduce((t, f) => t + f.name.length + f.value.length, 0);
/* «Змінилось 34 з 40: ▲ 19 · ▼ 15» */
function summary(rows, total) {
    if (!rows.length)
        return `**Поточні ціни** · ${total} ${total % 10 === 1 && total % 100 !== 11 ? 'предмет' : [2, 3, 4].includes(total % 10) && ![12, 13, 14].includes(total % 100) ? 'предмети' : 'предметів'}`;
    const up = rows.filter(r => r.prev !== null && r.price > r.prev).length;
    const down = rows.filter(r => r.prev !== null && r.price < r.prev).length;
    const fresh = rows.filter(r => r.prev === null).length;
    const parts = [up && `▲ ${up}`, down && `▼ ${down}`, fresh && `● ${fresh} нове`].filter(Boolean);
    return `**Змінилось ${rows.length} з ${Math.max(total, rows.length)}:** ${parts.join(' · ')}`;
}
/* розділи за вигідністю — замість кружка в кожному рядку: розділ сам каже, що робити */
const SECTIONS = [
    { name: '🔥 Вигідно продавати', has: p => p !== null && p >= 90 },
    { name: '🟢 Добре', has: p => p !== null && p >= 70 && p < 90 },
    { name: '🟡 Середньо', has: p => p !== null && p >= 40 && p < 70 },
    { name: '🔴 Краще почекати', has: p => p !== null && p < 40 },
    { name: '⚪ Без меж', has: p => p === null },
];
const MAX_FIELD = 1024, MAX_FIELDS = 25;
const FIGURE = ' '; // цифровий пробіл: « 7%» і «98%» однакової ширини в плашці
/* один рядок: «`98%` Рапана — **493 $** ▲ +235»; без меж — без плашки */
function line(b, change) {
    const p = profit(b.price, b.min, b.max);
    const chip = p === null ? '' : `\`${String(p).padStart(3, FIGURE)}%\` `;
    return `${chip}${escape(b.name)} — **${money(b.price)}**${change ? ' ' + mark(change.price, change.prev) : ''}`;
}
/* одне вікно змін → одне чи кілька повідомлень: embed на скупника з усім його прайсом розділами за вигідністю
   (найвигідніше зверху), змінене — з ▲/▼; без прайсу (board) — лише змінені предмети. Довгий список — продовженнями */
export function pricesMessage(groups, opt) {
    const embeds = [];
    for (const g of groups) {
        const changed = new Map(g.rows.map(r => [r.item_id, r]));
        const board = (g.board?.length ? g.board : g.rows.map(r => ({ item_id: r.item_id, name: r.name, price: r.price, min: 0, max: 0 })))
            .filter(b => b.price > 0)
            .sort((a, b) => (profit(b.price, b.min, b.max) ?? -1) - (profit(a.price, a.min, a.max) ?? -1) || a.name.localeCompare(b.name, 'uk'));
        const next = nextChange(g.buyer.next_change_at, opt.now);
        /* поля: розділ → рядки, задовгий розділ ділиться на кілька полів (≤ 1024 символи), продовження без назви */
        const fields = [];
        for (const s of SECTIONS) {
            const items = board.filter(b => s.has(profit(b.price, b.min, b.max)));
            if (!items.length)
                continue;
            chunks(items.map(b => line(b, changed.get(b.item_id))), MAX_FIELD).forEach((value, i) => fields.push({ name: i === 0 ? `${s.name} · ${items.length}` : '​', value }));
        }
        const description = [summary(g.rows, board.length), next ? `⏰ Наступна зміна: **${next}**` : ''].filter(Boolean).join('\n');
        const title = `${buyerIcon(g.buyer.id)} ${escape(g.buyer.name)} — ${g.rows.length ? 'нові' : 'поточні'} ціни`;
        const base = { url: `${opt.site}/tsiny#${encodeURIComponent(g.buyer.id)}`, color: COLOR, timestamp: opt.now.toISOString(),
            footer: { text: 'Відсоток — де ціна між мінімумом і максимумом скупника · Q-Hub · q-hub.fun' } };
        /* поля по embed: ≤ 25 і ≤ ~5000 символів, щоб кілька embed влазили в повідомлення */
        let cur = { ...base, title, description, fields: [] };
        for (const f of fields) {
            if (cur.fields.length && (cur.fields.length >= MAX_FIELDS || size(cur) + f.name.length + f.value.length > MAX_TOTAL - 1000)) {
                embeds.push(cur);
                cur = { ...base, title: `${title} (продовження)`, fields: [] };
            }
            cur.fields.push(f);
        }
        embeds.push(cur);
    }
    /* пакування: ≤ 10 embed і ≤ 6000 символів (з запасом на content) на повідомлення */
    const packs = [];
    let cur = [], total = 0;
    for (const e of embeds) {
        if (cur.length && (cur.length >= MAX_EMBEDS || total + size(e) > MAX_TOTAL - 100)) {
            packs.push(cur);
            cur = [];
            total = 0;
        }
        cur.push(e);
        total += size(e);
    }
    if (cur.length)
        packs.push(cur);
    /* без тексту над карткою: він повторював заголовок (рішення власника 2026-11-05); час — у timestamp картки */
    return packs.map(p => ({ embeds: p }));
}
export const NEWS_MAX = 4096; // ліміт опису embed у Discord
const NEWS_GROUPS = [['added', '✨ Додано'], ['changed', '🔧 Змінено'], ['removed', '🗑️ Прибрано']];
export function newsDescription(d) {
    return NEWS_GROUPS.map(([k, name]) => {
        const items = (d[k] ?? []).map(s => s.trim()).filter(Boolean);
        return items.length ? `**${name}**\n${items.map(s => '• ' + s).join('\n')}` : '';
    }).filter(Boolean).join('\n\n');
}
/* лише картка, без тексту над нею (він дублював заголовок); картинка й посилання — лише якщо задані */
export function newsMessage(d) {
    const e = { title: d.title.trim(), description: newsDescription(d), color: COLOR, footer: { text: 'Q-Hub · q-hub.fun' } };
    if (d.link)
        e.url = d.link;
    /* банер — окремою карткою над текстом: в одній картці Discord ставить картинку лише внизу (рішення власника 2026-11-05).
       Без url у банера — інакше Discord зливає картки з однаковим url в одну галерею */
    return { embeds: d.image_url ? [{ color: COLOR, image: { url: d.image_url } }, e] : [e] };
}
/* на скільки символів опис довший за дозволене; 0 — влазить */
export const newsTooLong = (d) => Math.max(0, newsDescription(d).length - NEWS_MAX);
export const TEST_MESSAGE = { content: 'Пробне повідомлення Q-Hub — бот бачить цей канал і може писати.' };
