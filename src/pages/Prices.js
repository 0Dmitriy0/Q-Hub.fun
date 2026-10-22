import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { money, parseMoney, when } from '../lib/format';
import { GOOD, STALE, priceRange, rangePos, series } from '../lib/pricestats';
import { dur } from '../lib/events';
import { PriceChart, RangeBar, Spark } from '../components/PriceChart';
import Icon from '../components/Icon';
import ShotImport from '../components/ShotImport';
import PicUpload from '../components/PicUpload';
import Leaderboard from '../components/Leaderboard';
import { groupUpdates, who } from '../lib/updates';
import { readCache, readSnapshot, writeCache } from '../lib/priceCache';
const DAY = 864e5;
/* історію тягнемо за рік із запасом: остання ціна до вікна графіка стає початком лінії */
const HIST_DAYS = 400;
const ms = (ts) => (ts ? new Date(ts).getTime() : 0);
function Pic({ url, alt, size = 40 }) {
    return url
        ? _jsx("img", { className: "pic", src: url, alt: alt, width: size, height: size, loading: "lazy" })
        : _jsx("span", { className: "pic none", style: { width: size, height: size }, "aria-hidden": "true", children: alt.slice(0, 1) });
}
export default function Prices() {
    const { isStaff, role, session, signIn } = useAuth();
    const isAdmin = role === 'admin';
    /* останні ціни з цього браузера видно одразу, без очікування бази */
    const [cached] = useState(() => readCache());
    const [buyers, setBuyers] = useState(cached?.buyers || []);
    const [rows, setRows] = useState(cached?.rows || []);
    const [ups, setUps] = useState(cached?.ups || []);
    const [top, setTop] = useState(cached?.top || []);
    const [saving, setSaving] = useState('');
    const [next, setNext] = useState(cached?.next || []);
    /* «через скільки» зміна цін: години й хвилини, як показує гра; null — форма закрита */
    const [nextEdit, setNextEdit] = useState(null);
    const [nextErr, setNextErr] = useState('');
    const [tick, setTick] = useState(Date.now());
    useEffect(() => { const id = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(id); }, []);
    const [tab, setTab] = useState(cached?.buyers[0]?.id || '');
    const [q, setQ] = useState('');
    const [err, setErr] = useState('');
    const [loaded, setLoaded] = useState(false);
    /* звідки зараз ціни: жива база, збережені в браузері чи знімок сайту */
    const [from, setFrom] = useState(cached ? 'saved' : '');
    const [savedAt, setSavedAt] = useState(cached?.at || '');
    const gotLive = useRef(false);
    const [edit, setEdit] = useState({});
    const [hist, setHist] = useState({});
    const [histFor, setHistFor] = useState(new Set());
    const [open, setOpen] = useState('');
    const [lim, setLim] = useState({ min: '', max: '' });
    const now = useMemo(() => Date.now(), [hist]);
    async function load() {
        if (!supabase)
            return;
        const [b, r, u, c, n] = await Promise.all([
            supabase.from('buyers').select('id,name,updated_at,image_url').order('sort'),
            supabase.from('buyer_items').select('buyer_id,item_id,min_price,max_price,price,price_at,items(id,name,unit,image_url)'),
            supabase.from('price_updates').select('*').order('created_at', { ascending: false }).limit(500),
            supabase.from('contributors').select('*').order('total', { ascending: false }).limit(500),
            supabase.from('buyer_next_change').select('*')
        ]);
        setLoaded(true);
        if (b.error || r.error) {
            setErr('Не вдалося завантажити ціни. Перевір інтернет і онови сторінку.');
            return;
        }
        /* хто оновлював і рейтинг — доповнення: без них ціни все одно показуються */
        show({ at: new Date().toISOString(), buyers: b.data, rows: r.data,
            ups: u.error ? [] : u.data, top: c.error ? [] : c.data, next: n.error ? [] : n.data }, 'live');
    }
    function show(d, src) {
        if (src === 'live')
            setErr('');
        setBuyers(d.buyers);
        setRows(d.rows);
        setUps(d.ups || []);
        setTop(d.top || []);
        setNext(d.next || []);
        setFrom(src);
        setSavedAt(d.at);
        if (d.buyers.length)
            setTab(t => t || d.buyers[0].id);
        if (src === 'live') {
            gotLive.current = true;
            writeCache(d);
        }
    }
    useEffect(() => {
        load().catch(() => { setLoaded(true); setErr('Не вдалося завантажити ціни. Перевір інтернет і онови сторінку.'); });
        /* знімок сайту — для першого відкриття; новіших збережених чи живих цін він не перекриває */
        readSnapshot().then(s => { if (s && !gotLive.current && s.at > (cached?.at || ''))
            show(s, 'saved'); });
    }, []);
    async function loadHist(ids) {
        if (!supabase || !ids.length)
            return;
        setHistFor(s => new Set([...s, ...ids]));
        const { data, error } = await supabase.from('price_history').select('buyer_id,item_id,price,at')
            .in('buyer_id', ids).gte('at', new Date(Date.now() - HIST_DAYS * DAY).toISOString()).order('at').limit(5000);
        if (error)
            return; /* графік — доповнення: без історії сторінка цін працює як раніше */
        setHist(h => {
            const n = { ...h };
            for (const id of ids)
                for (const k of Object.keys(n))
                    if (k.startsWith(id + ':'))
                        delete n[k];
            for (const r of data)
                (n[r.buyer_id + ':' + r.item_id] ||= []).push({ t: new Date(r.at).getTime(), p: Number(r.price) });
            return n;
        });
    }
    const cur = useMemo(() => {
        const ql = q.trim().toLowerCase();
        return rows.filter(r => r.items && (ql ? r.items.name.toLowerCase().includes(ql) : r.buyer_id === tab))
            .map(r => {
            /* автор поточної ціни — останнє внесення гравця, якщо воно і є цією ціною; інакше ціна з імпорту */
            const u = ups.find(x => x.buyer_id === r.buyer_id && x.item_id === r.item_id);
            const mine = u && Math.abs(ms(u.created_at) - ms(r.price_at)) < 2000;
            return { ...r, shown: r.price, at: r.price_at, by: mine ? who(u) + (u.reporter_static ? ' #' + u.reporter_static : '') : r.price_at ? 'редактор' : '' };
        })
            .sort((a, b) => a.items.name.localeCompare(b.items.name, 'uk'));
    }, [rows, ups, tab, q]);
    const buyer = buyers.find(b => b.id === tab);
    useEffect(() => { loadHist([...new Set(cur.map(r => r.buyer_id))].filter(id => !histFor.has(id))); }, [cur]);
    const reload = (buyerId) => { load(); loadHist([buyerId]); };
    function toggle(key, r) {
        setOpen(o => (o === key ? '' : key));
        setLim({ min: r.min_price ? String(r.min_price) : '', max: r.max_price ? String(r.max_price) : '' });
    }
    async function saveLimits(r) {
        const min = parseMoney(lim.min), max = parseMoney(lim.max);
        if ((min || max) && !(min > 0 && max > min)) {
            alert('Мінімум має бути більшим за нуль, а максимум — більшим за мінімум. Щоб прибрати межі, зітри обидва числа.');
            return;
        }
        const { error } = await supabase.from('buyer_items').update({ min_price: min, max_price: max }).eq('buyer_id', r.buyer_id).eq('item_id', r.item_id);
        if (error) {
            alert('Не вдалося зберегти межі.');
            return;
        }
        load();
    }
    /* і гравці, і редактори вносять ціну однаково — так кожне оновлення має автора і йде в рейтинг.
       Межі й «раз за цикл» перевіряє база; її пояснення показуємо як є */
    const [msg, setMsg] = useState({});
    async function savePrice(r) {
        const key = r.buyer_id + ':' + r.item_id, v = parseMoney(edit[key] ?? '');
        if (!(v > 0)) {
            setMsg(m => ({ ...m, [key]: 'Впиши ціну числом, наприклад 450 або 1,5к.' }));
            return;
        }
        setSaving(key);
        const { error } = await supabase.from('price_reports').insert({ kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: v });
        setSaving('');
        if (error) {
            setMsg(m => ({ ...m, [key]: error.message.startsWith('Ціна') || error.message.startsWith('Забагато') || error.message.startsWith('У цього') ? error.message : 'Не вдалося зберегти ціну. Спробуй ще раз.' }));
            return;
        }
        setEdit(e => { const n = { ...e }; delete n[key]; return n; });
        setMsg(m => { const n = { ...m }; delete n[key]; return n; });
        reload(r.buyer_id);
    }
    const cs = tick - STALE;
    const fresh = cur.filter(r => ms(r.at) >= cs).length;
    const lastAt = cur.reduce((m, r) => Math.max(m, ms(r.at)), 0);
    /* час наступної зміни цін, який вписав гравець; після нього три години показуємо «мала бути» */
    const nx = next.find(x => x.buyer_id === tab), nxAt = ms(nx?.next_change_at ?? null);
    const nxState = !nxAt ? 'none' : nxAt > tick ? 'soon' : tick - nxAt < STALE ? 'passed' : 'none';
    async function saveNext() {
        const h = Number(nextEdit?.h || 0), m = Number(nextEdit?.m || 0), mins = h * 60 + m;
        if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || mins < 1 || mins > 24 * 60) {
            setNextErr('Вкажи, через скільки зміна: від 1 хв до 24 год, наприклад 1 год 25 хв.');
            return;
        }
        const at = Date.now() + mins * 60000;
        const { error } = await supabase.rpc('set_next_change', { p_buyer: tab, p_at: new Date(at).toISOString() });
        if (error) {
            setNextErr(/^(Спершу|Час|Немає)/.test(error.message) ? error.message : 'Не вдалося зберегти час. Спробуй ще раз.');
            return;
        }
        setNextEdit(null);
        setNextErr('');
        load();
    }
    const [allUps, setAllUps] = useState(false);
    const groups = useMemo(() => groupUpdates(ups), [ups]);
    /* видно лише два останні оновлення, решта — під кнопкою */
    const SHOWN = 2;
    const recent = groups.slice(0, allUps ? 30 : SHOWN);
    const buyerSize = (id) => rows.filter(r => r.buyer_id === id).length;
    const buyerName = (id) => buyers.find(b => b.id === id)?.name || '';
    const itemName = (id) => rows.find(r => r.item_id === id)?.items?.name || '—';
    return (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("h1", { children: "\u0426\u0456\u043D\u0438 \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0456\u0432" }), _jsxs("p", { className: "muted", children: ["\u0421\u043A\u0443\u043F\u043D\u0438\u043A\u0438 \u043C\u0456\u043D\u044F\u044E\u0442\u044C \u0446\u0456\u043D\u0438 \u0432 \u0440\u0456\u0437\u043D\u0438\u0439 \u0447\u0430\u0441. \u041F\u043E\u0431\u0430\u0447\u0438\u0432 \u043D\u043E\u0432\u0443 \u0446\u0456\u043D\u0443 \u0432 \u0433\u0440\u0456 \u2014 \u043E\u043D\u043E\u0432\u0438 \u0457\u0457 \u0442\u0443\u0442: \u0432\u043E\u043D\u0430 \u043E\u0434\u0440\u0430\u0437\u0443 \u0441\u0442\u0430\u043D\u0435 \u043F\u043E\u0442\u043E\u0447\u043D\u043E\u044E, \u0430 \u0442\u0438 \u043E\u0442\u0440\u0438\u043C\u0430\u0454\u0448 \u0431\u0430\u043B \u0443 \u0440\u0435\u0439\u0442\u0438\u043D\u0433\u0443. \u0421\u043C\u0443\u0436\u043A\u0430 \u043F\u043E\u043A\u0430\u0437\u0443\u0454, \u0434\u0435 \u0446\u0456\u043D\u0430 \u0437\u0430\u0440\u0430\u0437 \u043C\u0456\u0436 \u043C\u0456\u043D\u0456\u043C\u0443\u043C\u043E\u043C \u0456 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C\u043E\u043C \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0430: \u0432\u0456\u0434 ", GOOD, "% \u2014 \u0432\u0438\u0433\u0456\u0434\u043D\u043E \u0437\u0434\u0430\u0432\u0430\u0442\u0438. \u041D\u0430\u0442\u0438\u0441\u043D\u0438 \u043D\u0430 \u0442\u043E\u0432\u0430\u0440, \u0449\u043E\u0431 \u043F\u043E\u0431\u0430\u0447\u0438\u0442\u0438 \u0433\u0440\u0430\u0444\u0456\u043A \u0437\u0430 30 \u0434\u043D\u0456\u0432."] })] }), !supabase && _jsx("div", { className: "card empty", children: "\u0411\u0430\u0437\u0430 \u0449\u0435 \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430." }), err && !buyers.length && _jsx("div", { className: "card err", children: err }), supabase && !loaded && !buyers.length && _jsx("div", { className: "card empty", role: "status", children: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0443\u0454\u043C\u043E \u0446\u0456\u043D\u0438\u2026" }), from === 'saved' && err && _jsxs("p", { className: "muted", role: "status", children: ["\u041F\u043E\u043A\u0430\u0437\u0443\u0454\u043C\u043E \u0446\u0456\u043D\u0438 \u0441\u0442\u0430\u043D\u043E\u043C \u043D\u0430 ", when(ms(savedAt)), " \u2014 \u0441\u0432\u0456\u0436\u0456 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0430\u0442\u044C\u0441\u044F, \u0449\u043E\u0439\u043D\u043E \u0437'\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u0437\u0432'\u044F\u0437\u043E\u043A."] }), loaded && !err && !buyers.length && _jsx("div", { className: "card empty", children: "\u0421\u043A\u0443\u043F\u043D\u0438\u043A\u0456\u0432 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454 \u2014 \u0441\u043A\u043E\u0440\u043E \u0437'\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F." }), buyers.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card recent", children: [_jsxs("div", { className: "row between rhead", children: [_jsxs("h2", { className: "ih", children: [_jsx(Icon, { name: "clock" }), "\u041E\u0441\u0442\u0430\u043D\u043D\u0456 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0446\u0456\u043D"] }), _jsx(Leaderboard, { list: top })] }), recent.length
                                ? _jsx("ul", { className: "ulist", children: recent.map(g => {
                                        /* один стиль для всіх записів: нік жирним на початку, під ним що саме оновлено */
                                        const buyerLink = _jsx("a", { href: '#' + g.buyer_id, onClick: e => { e.preventDefault(); setQ(''); setTab(g.buyer_id); }, children: buyerName(g.buyer_id) });
                                        const one = g.items.length === 1, all = !one && g.items.length >= buyerSize(g.buyer_id);
                                        return _jsxs("li", { children: [_jsxs("div", { className: "ug-head", children: [_jsx("b", { children: g.who }), g.stat ? _jsxs("span", { className: "mono stat", children: ["#", g.stat] }) : null, _jsxs("span", { className: "muted", children: [one ? 'оновив ціну' : all ? 'оновив усі ціни' : `оновив ${g.items.length} цін`, " \u00B7 ", buyerLink] }), _jsx("span", { className: 'ug-at' + (ms(g.at) < cs ? ' muted' : ''), children: when(g.at) })] }), _jsx("div", { className: "ug-items", children: one
                                                        ? _jsxs(_Fragment, { children: [itemName(g.items[0].item_id), " \u2014 ", _jsx("b", { className: "mono", children: money(g.items[0].price) })] })
                                                        : g.items.map(u => itemName(u.item_id)).sort((a, b) => a.localeCompare(b, 'uk')).join(', ') })] }, g.key);
                                    }) })
                                : _jsx("div", { className: "empty", children: "\u0413\u0440\u0430\u0432\u0446\u0456 \u0449\u0435 \u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u043B\u0438 \u0446\u0456\u043D\u0438. \u0411\u0443\u0434\u044C \u043F\u0435\u0440\u0448\u0438\u043C \u2014 \u043D\u0430\u0442\u0438\u0441\u043D\u0438 \u00AB\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u0446\u0456\u043D\u0443\u00BB \u0431\u0456\u043B\u044F \u0442\u043E\u0432\u0430\u0440\u0443 \u043D\u0438\u0436\u0447\u0435." }), groups.length > SHOWN && _jsx("button", { type: "button", className: "btn sm ghost", "aria-expanded": allUps, onClick: () => setAllUps(v => !v), children: allUps ? 'Сховати' : `Показати ще ${Math.min(groups.length, 30) - SHOWN}` })] }), session && _jsx("div", { className: "shot-wrap", children: _jsx(ShotImport, { catalog: rows.filter(r => r.items).map(r => ({ id: r.item_id, name: r.items.name, buyer_id: r.buyer_id, min: r.min_price, max: r.max_price, price: r.price })), buyerName: buyerName, onBuyer: id => { setQ(''); setTab(id); }, onDone: () => load() }) }), _jsxs("div", { className: "fld has-ico", children: [_jsx(Icon, { name: "search" }), _jsx("input", { type: "search", placeholder: "\u041F\u043E\u0448\u0443\u043A \u0442\u043E\u0432\u0430\u0440\u0443 \u0441\u0435\u0440\u0435\u0434 \u0443\u0441\u0456\u0445 \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0456\u0432", value: q, onChange: e => setQ(e.target.value), "aria-label": "\u041F\u043E\u0448\u0443\u043A \u0442\u043E\u0432\u0430\u0440\u0443" })] }), !q && _jsx("div", { className: "tabs", role: "tablist", children: buyers.map(b => (_jsxs("a", { href: '#' + b.id, role: "tab", "aria-selected": b.id === tab, className: 'tabpic' + (b.id === tab ? ' active' : ''), onClick: e => { e.preventDefault(); setTab(b.id); }, children: [_jsx(Pic, { url: b.image_url, alt: b.name, size: 24 }), b.name] }, b.id))) }), !session && _jsxs("div", { className: "card row between", children: [_jsx("span", { children: "\u0423\u0432\u0456\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 Discord, \u0449\u043E\u0431 \u043E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u0442\u0438 \u0446\u0456\u043D\u0438 \u0439 \u043F\u043E\u0442\u0440\u0430\u043F\u0438\u0442\u0438 \u0432 \u0440\u0435\u0439\u0442\u0438\u043D\u0433." }), _jsx("button", { className: "btn acc sm", onClick: signIn, children: "\u0423\u0432\u0456\u0439\u0442\u0438" })] }), _jsxs("section", { className: "card", children: [!q && buyer && (_jsxs("div", { className: "row between", children: [_jsxs("div", { className: "row", children: [_jsx(Pic, { url: buyer.image_url, alt: buyer.name, size: 48 }), _jsxs("div", { children: [_jsx("h2", { children: buyer.name }), _jsx("span", { className: "muted", children: buyer.updated_at ? 'оновлено ' + when(buyer.updated_at) : 'ще не оновлювали' })] })] }), isAdmin && _jsx(PicUpload, { label: 'Картинка скупника ' + buyer.name, path: `buyers/${buyer.id}.webp`, onDone: async (url) => {
                                            const { error } = await supabase.from('buyers').update({ image_url: url }).eq('id', buyer.id);
                                            if (error)
                                                throw error;
                                            load();
                                        } })] })), !q && buyer && (_jsxs("div", { className: "cycle", role: "status", children: [_jsxs("div", { children: [_jsx("small", { children: "\u0421\u0432\u0456\u0436\u0456 \u0446\u0456\u043D\u0438 (\u0434\u043E 3 \u0433\u043E\u0434)" }), _jsxs("b", { className: "mono", children: [fresh, " \u0437 ", cur.length] })] }), _jsxs("div", { children: [_jsx("small", { children: "\u041E\u0441\u0442\u0430\u043D\u043D\u0454 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F" }), _jsx("b", { className: "mono", children: lastAt ? when(lastAt) : '—' })] }), _jsxs("div", { className: 'nextc' + (nxState === 'passed' ? ' due' : ''), children: [_jsxs("small", { children: [_jsx(Icon, { name: "clock", size: 14 }), " \u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0430 \u0437\u043C\u0456\u043D\u0430 \u0446\u0456\u043D"] }), nextEdit !== null
                                                ? _jsxs("form", { className: "row upd", onSubmit: e => { e.preventDefault(); saveNext(); }, children: [_jsx("span", { className: "muted", children: "\u0447\u0435\u0440\u0435\u0437" }), _jsxs("label", { className: "fld dur", children: [_jsx("input", { type: "number", inputMode: "numeric", min: 0, max: 24, "aria-label": "\u0413\u043E\u0434\u0438\u043D \u0434\u043E \u0437\u043C\u0456\u043D\u0438 \u0446\u0456\u043D", value: nextEdit.h, onChange: e => { setNextEdit({ ...nextEdit, h: e.target.value }); setNextErr(''); }, autoFocus: true }), _jsx("span", { children: "\u0433\u043E\u0434" })] }), _jsxs("label", { className: "fld dur", children: [_jsx("input", { type: "number", inputMode: "numeric", min: 0, max: 59, "aria-label": "\u0425\u0432\u0438\u043B\u0438\u043D \u0434\u043E \u0437\u043C\u0456\u043D\u0438 \u0446\u0456\u043D", value: nextEdit.m, onChange: e => { setNextEdit({ ...nextEdit, m: e.target.value }); setNextErr(''); } }), _jsx("span", { children: "\u0445\u0432" })] }), _jsx("button", { className: "btn sm acc", children: "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438" }), _jsx("button", { type: "button", className: "btn sm ghost", onClick: () => { setNextEdit(null); setNextErr(''); }, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" })] })
                                                : _jsx("b", { className: "mono", children: nxState === 'soon' ? `${when(nxAt).slice(-5)} · через ${dur(nxAt - tick)}` : nxState === 'passed' ? `була о ${when(nxAt).slice(-5)} — онови ціни` : 'невідомо' }), nextEdit === null && nxState !== 'none' && nx?.game_name && _jsxs("small", { className: "muted", children: ["\u0432\u043F\u0438\u0441\u0430\u0432 ", nx.game_name, nx.static_id ? ' #' + nx.static_id : ''] }), nextErr && _jsx("small", { className: "err", role: "alert", children: nextErr }), nextEdit === null && session && _jsx("button", { type: "button", className: "btn sm ghost", onClick: () => setNextEdit({ h: '', m: '' }), children: nxState === 'soon' ? 'Оновити' : 'Вписати, через скільки' })] })] })), cur.length ? (_jsx("div", { className: "plist", children: cur.map(r => {
                                    const key = r.buyer_id + ':' + r.item_id, old = !!r.at && ms(r.at) < cs, isOpen = open === key, editing = edit[key] !== undefined;
                                    const raw = hist[key] || [], pts = series(raw, now), range = priceRange(raw, r.min_price, r.max_price, now), pos = rangePos(r.shown, range);
                                    return (_jsxs("div", { className: 'prow' + (isOpen ? ' open' : ''), children: [_jsx(Pic, { url: r.items.image_url, alt: r.items.name }), _jsxs("button", { type: "button", className: "pname", "aria-expanded": isOpen, "aria-controls": 'pd-' + key, onClick: () => toggle(key, r), children: [_jsx("b", { children: r.items.name }), _jsxs("small", { children: [q ? (buyers.find(b => b.id === r.buyer_id)?.name || '') + ' · ' : '', r.at ? _jsxs("span", { className: old ? 'warn' : '', children: [when(r.at), " \u00B7 ", r.by, old ? ' · може бути застаріла' : ''] }) : 'ціни ще немає'] }), _jsx(RangeBar, { pos: pos, range: range })] }), _jsx(Spark, { pts: pts, now: now }), _jsxs("div", { className: "pval", children: [editing
                                                        ? _jsxs("form", { className: "row upd", onSubmit: e => { e.preventDefault(); savePrice(r); }, children: [_jsx("label", { className: "fld", children: _jsx("input", { autoFocus: true, "aria-label": 'Нова ціна ' + r.items.name, inputMode: "numeric", value: edit[key], onChange: e => setEdit({ ...edit, [key]: e.target.value }), style: { width: 110 } }) }), _jsx("button", { className: "btn sm acc", disabled: saving === key, children: saving === key ? 'Зберігаю…' : 'Зберегти' }), _jsx("button", { type: "button", className: "btn sm ghost", onClick: () => { setEdit(e => { const n = { ...e }; delete n[key]; return n; }); setMsg(m => { const n = { ...m }; delete n[key]; return n; }); }, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" })] })
                                                        : _jsx("b", { className: "mono", children: r.shown ? money(r.shown) : '—' }), !editing && _jsxs("small", { className: "muted", children: ["\u0437\u0430 ", r.items.unit] }), !editing && session && _jsx("button", { type: "button", className: 'btn sm ' + (old || !r.at ? 'acc' : 'ghost'), onClick: () => setEdit({ ...edit, [key]: r.shown ? String(r.shown) : '' }), children: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u0446\u0456\u043D\u0443" }), msg[key] && _jsx("small", { className: "err", role: "alert", children: msg[key] })] }), isAdmin && _jsx(PicUpload, { label: 'Картинка товару ' + r.items.name, path: `items/${r.item_id}.webp`, onDone: async (url) => {
                                                    const { error } = await supabase.from('items').update({ image_url: url }).eq('id', r.item_id);
                                                    if (error)
                                                        throw error;
                                                    load();
                                                } }), isOpen && (_jsxs("div", { className: "pdetail", id: 'pd-' + key, children: [_jsxs("div", { className: "stats", children: [_jsxs("div", { children: [_jsx("small", { children: "\u0417\u0430\u0440\u0430\u0437" }), _jsx("b", { className: "mono", children: r.shown ? money(r.shown) : '—' })] }), _jsxs("div", { children: [_jsx("small", { children: "\u041C\u0456\u043D\u0456\u043C\u0443\u043C" }), _jsx("b", { className: "mono", children: range ? money(range.min) : '—' })] }), _jsxs("div", { children: [_jsx("small", { children: "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C" }), _jsx("b", { className: "mono", children: range ? money(range.max) : '—' })] }), _jsxs("div", { children: [_jsx("small", { children: "\u041F\u043E\u043B\u043E\u0436\u0435\u043D\u043D\u044F" }), _jsx("b", { className: "mono", children: pos === null ? '—' : pos + '%' })] })] }), _jsx("p", { className: "muted note", children: range?.from === 'editor' ? 'Межі мінімум і максимум вписав редактор з гри.' : range ? 'Межі — найнижча і найвища ціна, що траплялися за 30 днів. Коли редактор впише межі з гри, вони будуть точнішими.' : 'Меж поки немає: потрібно щонайменше дві різні ціни за 30 днів або межі від редактора.' }), _jsx(PriceChart, { raw: raw, range: range, name: r.items.name }), isStaff && (_jsxs("form", { className: "row lims", onSubmit: e => { e.preventDefault(); saveLimits(r); }, children: [_jsxs("label", { className: "fld", children: [_jsx("span", { children: "\u041C\u0456\u043D\u0456\u043C\u0443\u043C \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0430" }), _jsx("input", { inputMode: "numeric", value: lim.min, onChange: e => setLim({ ...lim, min: e.target.value }), style: { width: 120 } })] }), _jsxs("label", { className: "fld", children: [_jsx("span", { children: "\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0430" }), _jsx("input", { inputMode: "numeric", value: lim.max, onChange: e => setLim({ ...lim, max: e.target.value }), style: { width: 120 } })] }), _jsx("button", { className: "btn sm acc", children: "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u043C\u0435\u0436\u0456" })] }))] }))] }, key));
                                }) })) : _jsx("div", { className: "empty", children: q ? 'Нічого не знайдено.' : 'У цього скупника ще немає товарів.' })] })] }))] }));
}
