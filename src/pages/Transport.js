import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import PicUpload from '../components/PicUpload';
import VehicleDialog from '../components/VehicleDialog';
import Select from '../components/Select';
import { priceKind, priceSortKey, salonLabel } from '../lib/vehiclePrice';
const KINDS = [['all', 'Усі', 'car'], ['auto', 'Авто', 'car'], ['moto', 'Мото', 'moto'], ['avia', 'Авіа', 'plane']];
const SORT_ICON = { price: 'tag', speed: 'speed', trunk: 'box', rating: 'star', name: 'search' };
const SORTS = [['price', 'Ціна'], ['speed', 'Швидкість'], ['trunk', 'Багажник'], ['rating', 'Оцінка гравців'], ['name', 'Назва']];
const seatsWord = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'місце' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'місця' : 'місць'; };
/* середня оцінка всіх гравців — зірки з дробовим заповненням (3,5 = три з половиною) */
function AvgStars({ avg, votes }) {
    const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
    return (_jsxs("div", { className: "avg", "aria-label": votes ? `Середня оцінка ${avg.toFixed(1)} з 5, ${votes} ${votesWord(votes)}` : 'Ще без оцінок', children: [_jsxs("span", { className: "avg-stars", "aria-hidden": "true", children: [_jsx("span", { className: "avg-bg", children: [1, 2, 3, 4, 5].map(n => _jsx(Icon, { name: "star", size: 20 }, n)) }), _jsx("span", { className: "avg-fg", style: { width: pct + '%' }, children: [1, 2, 3, 4, 5].map(n => _jsx(Icon, { name: "star", size: 20 }, n)) })] }), votes ? _jsxs("span", { children: [_jsx("b", { className: "mono", children: avg.toFixed(1) }), _jsxs("span", { className: "muted", children: [" \u0437 5 \u00B7 ", votes, " ", votesWord(votes)] })] }) : _jsx("span", { className: "muted", children: "\u0449\u0435 \u0431\u0435\u0437 \u043E\u0446\u0456\u043D\u043E\u043A" })] }));
}
const votesWord = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'оцінка' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'оцінки' : 'оцінок'; };
/* своя оцінка — окремо від середньої: клік по зірці ставить або змінює */
function MyStars({ mine, onRate }) {
    const [hover, setHover] = useState(0);
    const shown = hover || mine;
    return (_jsxs("div", { className: "mine-row", children: [_jsx("small", { className: "muted", children: mine ? 'Твоя оцінка' : 'Оціни' }), _jsx("div", { className: "stars-row", role: "radiogroup", "aria-label": "\u0422\u0432\u043E\u044F \u043E\u0446\u0456\u043D\u043A\u0430", onMouseLeave: () => setHover(0), children: [1, 2, 3, 4, 5].map(n => _jsx("button", { type: "button", role: "radio", "aria-checked": mine === n, "aria-label": `${n} з 5`, className: 'star sm' + (n <= shown ? ' on' : ''), onMouseEnter: () => setHover(n), onFocus: () => setHover(n), onBlur: () => setHover(0), onClick: () => onRate(n), children: _jsx(Icon, { name: "star", size: 16 }) }, n)) })] }));
}
export default function Transport() {
    const { session, signIn, role } = useAuth();
    const isAdmin = role === 'admin';
    const [list, setList] = useState([]);
    const [scores, setScores] = useState({});
    const [mine, setMine] = useState({});
    const [kind, setKind] = useState('all');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('price');
    const [fuel, setFuel] = useState('all');
    const [cur, setCur] = useState('all');
    const [err, setErr] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [openId, setOpenId] = useState(null);
    async function load() {
        if (!supabase)
            return;
        const [v, s] = await Promise.all([
            supabase.from('vehicles').select('*').order('price', { ascending: false }).limit(1000),
            supabase.from('vehicle_scores').select('*')
        ]);
        setLoaded(true);
        if (v.error) {
            setErr('Не вдалося завантажити транспорт. Онови сторінку.');
            return;
        }
        /* фото з маркетплейсу гри лежать на самому сайті (public/vehicles/map.json); фото, завантажене адміном, важливіше */
        const pics = await fetch('/vehicles/map.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
        setList(v.data.map(x => (x.image_url || !pics[x.name] ? x : { ...x, image_url: pics[x.name] })));
        setScores(Object.fromEntries((s.data || []).map(x => [x.vehicle_id, { ...x, avg: Number(x.avg), votes: Number(x.votes) }])));
    }
    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (!supabase || !session) {
            setMine({});
            return;
        }
        supabase.from('vehicle_ratings').select('vehicle_id,stars').then(({ data }) => setMine(Object.fromEntries((data || []).map(r => [r.vehicle_id, r.stars]))));
    }, [session?.user.id]);
    async function rate(id, stars) {
        if (!supabase || !session)
            return;
        /* середня перераховується одразу; потім база дасть точне значення */
        const prev = mine[id] ?? 0, cur = scores[id] ?? { vehicle_id: id, avg: 0, votes: 0 };
        const votes = cur.votes + (prev ? 0 : 1), avg = (cur.avg * cur.votes - prev + stars) / votes;
        setScores(sc => ({ ...sc, [id]: { vehicle_id: id, avg, votes } }));
        setMine(m => ({ ...m, [id]: stars }));
        const { error } = await supabase.from('vehicle_ratings').upsert({ vehicle_id: id, user_id: session.user.id, stars, updated_at: new Date().toISOString() });
        if (error) {
            alert('Не вдалося зберегти оцінку. Спробуй ще раз.');
            return;
        }
        const { data } = await supabase.from('vehicle_scores').select('*').eq('vehicle_id', id).maybeSingle();
        if (data)
            setScores(sc => ({ ...sc, [id]: { vehicle_id: id, avg: Number(data.avg), votes: Number(data.votes) } }));
    }
    const counts = useMemo(() => ({ all: list.length, auto: list.filter(v => v.kind === 'auto').length, moto: list.filter(v => v.kind === 'moto').length, avia: list.filter(v => v.kind === 'avia').length }), [list]);
    const shown = useMemo(() => {
        const ql = q.trim().toLowerCase();
        const r = list.filter(v => (kind === 'all' || v.kind === kind) && (fuel === 'all' || (v.fuel || 'petrol') === fuel) && (cur === 'all' || priceKind(v) === cur) && (!ql || (v.name + ' ' + v.brand).toLowerCase().includes(ql)));
        const num = (x) => x ?? -1;
        return r.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'uk')
            : sort === 'rating' ? (scores[b.id]?.avg ?? 0) - (scores[a.id]?.avg ?? 0) || (scores[b.id]?.votes ?? 0) - (scores[a.id]?.votes ?? 0)
                : sort === 'speed' ? num(b.speed) - num(a.speed) : sort === 'trunk' ? num(b.trunk) - num(a.trunk) : (() => { const x = priceSortKey(a), y = priceSortKey(b); return x[0] - y[0] || y[1] - x[1]; })());
    }, [list, kind, q, sort, scores, fuel, cur]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("h1", { children: "\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442" }), _jsx("p", { className: "muted", children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0430\u0432\u0442\u043E\u0441\u0430\u043B\u043E\u043D\u0456\u0432: \u0434\u0435\u0440\u0436. \u0446\u0456\u043D\u0430 \u0439 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043A\u0438. \u0417\u0456\u0440\u043A\u0438 \u043D\u0430 \u043A\u0430\u0440\u0442\u0446\u0456 \u2014 \u0441\u0435\u0440\u0435\u0434\u043D\u044F \u043E\u0446\u0456\u043D\u043A\u0430 \u0432\u0441\u0456\u0445 \u0433\u0440\u0430\u0432\u0446\u0456\u0432. \u0423\u0432\u0456\u0439\u0434\u0438, \u0449\u043E\u0431 \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u0438 \u0441\u0432\u043E\u044E \u0432\u0456\u0434 1 \u0434\u043E 5: \u0432\u043E\u043D\u0430 \u043E\u0434\u0440\u0430\u0437\u0443 \u0432\u0440\u0430\u0445\u0443\u0454\u0442\u044C\u0441\u044F \u0432 \u0441\u0435\u0440\u0435\u0434\u043D\u0456\u0439." })] }), !supabase && _jsx("div", { className: "card empty", children: "\u0411\u0430\u0437\u0430 \u0449\u0435 \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430." }), err && _jsx("div", { className: "card err", children: err }), _jsxs("div", { className: "tbar", children: [_jsx("div", { className: "tabs", role: "tablist", "aria-label": "\u0422\u0438\u043F \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0443", children: KINDS.map(([k, label, ico]) => (_jsxs("a", { href: '#' + k, role: "tab", "aria-selected": kind === k, className: 'tabpic' + (kind === k ? ' active' : ''), onClick: e => { e.preventDefault(); setKind(k); }, children: [_jsx(Icon, { name: ico, size: 16 }), label, _jsx("span", { className: "cnt", children: counts[k] })] }, k))) }), _jsxs("div", { className: "tbar-row", children: [_jsxs("div", { className: "fld has-ico grow", children: [_jsx(Icon, { name: "search" }), _jsx("input", { type: "search", placeholder: "\u041F\u043E\u0448\u0443\u043A \u0437\u0430 \u043D\u0430\u0437\u0432\u043E\u044E \u0430\u0431\u043E \u043C\u0430\u0440\u043A\u043E\u044E", value: q, onChange: e => setQ(e.target.value), "aria-label": "\u041F\u043E\u0448\u0443\u043A \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0443" })] }), _jsx("div", { className: "fld sortf", children: _jsx(Select, { label: "\u0412\u0430\u043B\u044E\u0442\u0430", value: cur, onChange: setCur, options: [{ value: 'all', label: 'Будь-яка валюта', icon: 'tag' }, { value: 'game', label: 'Ігрова валюта', icon: 'tag' }, { value: 'donate', label: 'Донатна валюта', icon: 'coin' }, { value: 'exclusive', label: 'Ексклюзив', icon: 'star' }] }) }), _jsx("div", { className: "fld sortf", children: _jsx(Select, { label: "\u0414\u0432\u0438\u0433\u0443\u043D", value: fuel, onChange: setFuel, options: [{ value: 'all', label: 'Пальне й електро', icon: 'car' }, { value: 'petrol', label: 'Лише на пальному', icon: 'fuel' }, { value: 'electric', label: 'Лише електро', icon: 'bolt' }] }) }), _jsx("div", { className: "fld sortf", children: _jsx(Select, { label: "\u0421\u043E\u0440\u0442\u0443\u0432\u0430\u043D\u043D\u044F", value: sort, onChange: setSort, options: SORTS.map(([k, l]) => ({ value: k, label: l, icon: SORT_ICON[k] })) }) })] })] }), !session && list.length > 0 && _jsxs("div", { className: "card row between", children: [_jsx("span", { children: "\u0423\u0432\u0456\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 Discord, \u0449\u043E\u0431 \u043E\u0446\u0456\u043D\u044E\u0432\u0430\u0442\u0438 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442." }), _jsx("button", { className: "btn acc sm", onClick: signIn, children: "\u0423\u0432\u0456\u0439\u0442\u0438" })] }), loaded && !err && !list.length && _jsx("div", { className: "card empty", children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0443 \u0449\u0435 \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u0439 \u2014 \u0439\u043E\u0433\u043E \u0441\u0430\u043C\u0435 \u0437\u0430\u043F\u043E\u0432\u043D\u044E\u0454\u043C\u043E." }), shown.length > 0 && (_jsx("div", { className: "vgrid", children: shown.map(v => {
                    const sc = scores[v.id];
                    return (_jsxs("article", { className: 'card vcard' + (v.exclusive ? ' excl' : ''), onClick: e => { if (!e.target.closest('button, input, label, select, a'))
                            setOpenId(v.id); }, children: [_jsxs("div", { className: "vpic", children: [v.exclusive && _jsxs("span", { className: "excl-badge", title: "\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432\u043D\u0438\u0439 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442 \u2014 \u0443 \u0441\u0430\u043B\u043E\u043D\u0456 \u043D\u0435 \u043A\u0443\u043F\u0438\u0442\u0438", children: [_jsx(Icon, { name: "star", size: 14 }), "\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432"] }), v.image_url ? _jsx("img", { src: v.image_url, alt: v.name, loading: "lazy" }) : _jsx(Icon, { name: v.kind === 'moto' ? 'moto' : v.kind === 'avia' ? 'plane' : 'car', size: 40 }), isAdmin && _jsx("span", { className: "vpic-up", children: _jsx(PicUpload, { label: 'Фото транспорту ' + v.name, path: `vehicles/${v.id}.webp`, frame: { w: 640, h: 360 }, onDone: async (url) => {
                                                const { error } = await supabase.from('vehicles').update({ image_url: url }).eq('id', v.id);
                                                if (error)
                                                    throw error;
                                                setList(l => l.map(x => (x.id === v.id ? { ...x, image_url: url } : x)));
                                            } }) })] }), _jsxs("div", { className: "vhead", children: [_jsx("h3", { children: _jsx("button", { type: "button", className: "vopen", onClick: () => setOpenId(v.id), children: v.name }) }), v.brand && _jsxs("small", { className: "muted", children: [v.brand, v.salon ? ' · ' + v.salon : ''] })] }), _jsxs("b", { className: 'mono vprice' + (priceKind(v) === 'donate' ? ' donate-c' : priceKind(v) === 'exclusive' ? ' excl-c' : ''), title: priceKind(v) === 'donate' ? 'Купується за донатну валюту' : undefined, children: [priceKind(v) === 'donate' && _jsx(Icon, { name: "coin", size: 17 }), priceKind(v) === 'exclusive' && _jsx(Icon, { name: "star", size: 16 }), salonLabel(v)] }), _jsxs("ul", { className: "vspec", children: [v.speed != null && _jsxs("li", { children: [_jsx(Icon, { name: "speed", size: 15 }), v.speed, " \u043A\u043C/\u0433\u043E\u0434"] }), v.trunk != null && _jsxs("li", { children: [_jsx(Icon, { name: "box", size: 15 }), v.trunk, " \u0441\u043B\u043E\u0442(\u0456\u0432)"] }), v.fuel === 'electric' ? _jsxs("li", { className: "fuel-tag el", children: [_jsx(Icon, { name: "bolt", size: 15 }), "\u0415\u043B\u0435\u043A\u0442\u0440\u043E"] }) : _jsxs("li", { className: "fuel-tag", children: [_jsx(Icon, { name: "fuel", size: 15 }), "\u041F\u0430\u043B\u044C\u043D\u0435", v.tank != null ? ` · ${v.tank} л` : ''] }), v.seats != null && _jsxs("li", { children: [_jsx(Icon, { name: "user", size: 15 }), v.seats, " ", seatsWord(v.seats)] })] }), _jsxs("div", { className: "stars", children: [_jsx(AvgStars, { avg: sc?.avg ?? 0, votes: sc?.votes ?? 0 }), session && _jsx(MyStars, { mine: mine[v.id] ?? 0, onRate: n => rate(v.id, n) })] })] }, v.id));
                }) })), _jsx(VehicleDialog, { v: list.find(x => x.id === openId) ?? null, onClose: () => setOpenId(null) }), loaded && list.length > 0 && !shown.length && _jsx("div", { className: "card empty", children: "\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E. \u0421\u043F\u0440\u043E\u0431\u0443\u0439 \u0456\u043D\u0448\u0443 \u043D\u0430\u0437\u0432\u0443 \u0430\u0431\u043E \u0442\u0438\u043F." })] }));
}
