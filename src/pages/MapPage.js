import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, TILE, ZMAX, makeHash, parseHash, toGame, toPx } from '../lib/mapGeo';
import { groupCategories, ownerLabel } from '../lib/mapData';
import { POINTS } from '../data/mapPoints';
import { JOBS } from '../data/jobs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import MapAdmin from '../components/MapAdmin';
const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ON_KEY = 'qhub:map:on';
/* роботи й скупники — вбудовані категорії з даних сайту, решта — з бази (додає адмін) */
const BUILTIN = [
    { id: 'jobs', name: 'Роботи', grp: 'Заробіток', icon: '/icons/map/jobs.svg', color: '#ff6a1f', sort: 52, shown: true, builtin: true },
    { id: 'buyers', name: 'Скупники', grp: 'Заробіток', icon: '/icons/harvest/buyer.svg', color: '#f5b301', sort: 53, shown: true, builtin: true }
];
const BUILTIN_MARKS = POINTS.map(p => {
    const j = p.kind === 'job' ? JOBS.find(x => x.id === p.job) : undefined;
    return p.kind === 'job'
        ? { id: p.id, category: 'jobs', name: p.name, note: j ? (j.legal ? 'Легальна' : 'Нелегальна') + ' · з ' + j.level + ' рівня' : '', x: p.x, y: p.y, icon: `/icons/jobs/${p.job}.svg`, link: { href: `/roboty?job=${p.job}`, label: 'Опис роботи →' } }
        : { id: p.id, category: 'buyers', name: p.name, note: p.note || '', x: p.x, y: p.y, icon: p.id === 'buyer-junk' ? '/icons/junk/buyer.svg' : '/icons/harvest/buyer.svg', link: { href: '/tsiny', label: 'Ціни скупників →' } };
});
function readOn() { try {
    return JSON.parse(localStorage.getItem(ON_KEY) || '{}');
}
catch {
    return {};
} }
function saveOn(v) { try {
    localStorage.setItem(ON_KEY, JSON.stringify(v));
}
catch { /* приватний режим */ } }
export default function MapPage() {
    const box = useRef(null);
    const map = useRef(null);
    const layers = useRef({});
    const markers = useRef({});
    const pickRef = useRef(false);
    const pickMarker = useRef(null);
    const nav = useNavigate();
    const { role } = useAuth();
    const isAdmin = role === 'admin';
    const [cats, setCats] = useState(BUILTIN);
    const [marks, setMarks] = useState(BUILTIN_MARKS);
    const [saved] = useState(readOn);
    const [on, setOn] = useState({});
    const [q, setQ] = useState('');
    const [pos, setPos] = useState(null);
    const [picking, setPicking] = useState(false);
    const [picked, setPicked] = useState(null);
    const [dbMissing, setDbMissing] = useState(false);
    const [owners, setOwners] = useState({});
    /* комп'ютер: мапа на весь екран під шапкою, панель фільтрів поверх мапи і згортається.
       телефон: звичайна сторінка — мапа зверху, фільтри під нею */
    const mq = typeof matchMedia === 'function' ? matchMedia('(min-width: 861px)') : null;
    const [wide, setWide] = useState(() => !!mq?.matches);
    const [panel, setPanel] = useState(true);
    const [top, setTop] = useState(64);
    useEffect(() => {
        if (!mq)
            return;
        const f = () => setWide(mq.matches);
        mq.addEventListener('change', f);
        return () => mq.removeEventListener('change', f);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        map.current?.invalidateSize();
        if (!wide)
            return;
        const h = document.querySelector('header.top');
        if (!h)
            return;
        const upd = () => { setTop(Math.round(h.getBoundingClientRect().height)); map.current?.invalidateSize(); };
        upd();
        const ro = new ResizeObserver(upd);
        ro.observe(h);
        document.body.classList.add('map-open');
        return () => { ro.disconnect(); document.body.classList.remove('map-open'); };
    }, [wide]);
    const isOn = (c) => on[c.id] ?? saved[c.id] ?? c.shown;
    const count = useMemo(() => { const n = {}; for (const m of marks)
        n[m.category] = (n[m.category] || 0) + 1; return n; }, [marks]);
    /* гостям порожні категорії не показуємо — лише адміну, щоб він міг їх наповнити */
    const visibleCats = useMemo(() => cats.filter(c => c.builtin || isAdmin || count[c.id]), [cats, count, isAdmin]);
    const groups = useMemo(() => groupCategories(visibleCats), [visibleCats]);
    const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);
    const found = useMemo(() => {
        const ql = q.trim().toLowerCase();
        if (!ql)
            return [];
        return marks.filter(m => (m.name + ' ' + (catById[m.category]?.name || '')).toLowerCase().includes(ql)).slice(0, 10);
    }, [q, marks, catById]);
    useEffect(() => {
        if (!supabase)
            return;
        Promise.all([supabase.from('map_categories').select('*').order('sort'), supabase.from('map_points').select('id,category_id,name,note,x,y,owner_static').limit(20000), supabase.from('map_owners').select('static_id,game_name')]).then(([c, p, o]) => {
            if (c.error || p.error) {
                setDbMissing(true);
                return;
            }
            if (!o.error)
                setOwners(Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id, r.game_name])));
            setCats([...BUILTIN, ...c.data]);
            setMarks([...BUILTIN_MARKS, ...(p.data || []).map(r => ({ id: 'db-' + r.id, dbId: r.id, category: r.category_id, name: r.name, note: r.note, x: r.x, y: r.y, owner: r.owner_static }))]);
        });
    }, []);
    useEffect(() => {
        const el = box.current;
        if (!el)
            return;
        const m = L.map(el, { crs: L.CRS.Simple, minZoom: 1, maxZoom: ZMAX + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: false });
        L.control.zoom({ position: 'bottomright' }).addTo(m);
        const full = TILE * 2 ** ZMAX;
        const bounds = L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX));
        m.setMaxBounds(bounds.pad(0.05));
        L.tileLayer('/map/{z}/{x}/{y}.webp', { maxNativeZoom: ZMAX, maxZoom: ZMAX + 2, tileSize: TILE, noWrap: true, bounds,
            errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }).addTo(m);
        const ll = (x, y) => m.unproject(toPx(x, y), ZMAX);
        const h = parseHash(location.hash);
        if (h)
            m.setView(ll(h.x, h.y), h.z);
        else
            m.setView(ll(0, -800), 3);
        const game = (e) => { const pt = m.project(e.latlng, ZMAX); return toGame(pt.x, pt.y); };
        m.on('mousemove', e => setPos(game(e)));
        m.on('mouseout', () => setPos(null));
        m.on('click', e => {
            if (!pickRef.current)
                return;
            const g = game(e);
            setPicked(g);
            pickMarker.current?.remove();
            pickMarker.current = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#ff6a1f', fillOpacity: 1 }).addTo(m);
            pickRef.current = false;
            setPicking(false);
        });
        m.on('moveend', () => { const c = m.project(m.getCenter(), ZMAX); const [x, y] = toGame(c.x, c.y); history.replaceState(null, '', makeHash(x, y, Math.round(m.getZoom()))); });
        map.current = m;
        return () => { m.remove(); map.current = null; layers.current = {}; markers.current = {}; };
    }, []);
    /* мітки перебудовуються, коли змінюються дані; видимість — окремо, без перебудови */
    useEffect(() => {
        const m = map.current;
        if (!m)
            return;
        for (const g of Object.values(layers.current))
            g.remove();
        layers.current = {};
        markers.current = {};
        for (const c of cats)
            layers.current[c.id] = L.layerGroup();
        for (const mk of marks) {
            const c = catById[mk.category];
            if (!c)
                continue;
            const icon = L.divIcon({ className: 'mpin-wrap', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
                html: `<span class="mpin" style="border-color:${c.color};box-shadow:0 0 0 3px ${c.color}38,0 6px 14px rgba(0,0,0,.5)"><img src="${esc(mk.icon || c.icon)}" alt="" width="24" height="24"></span>` });
            const html = `<div class="mpop"><b>${esc(mk.name || c.name)}</b>${mk.name ? `<span>${esc(c.name)}</span>` : ''}${mk.note ? `<span>${esc(mk.note)}</span>` : ''}`
                + (mk.owner ? `<span class="mowner">Власник: <b>${esc(ownerLabel(mk.owner, owners))}</b></span>` : '')
                + `<span class="mono mxy">X ${Math.round(mk.x)} · Y ${Math.round(mk.y)}</span>`
                + (mk.link ? `<a data-nav href="${mk.link.href}">${mk.link.label}</a>` : '')
                + (isAdmin && mk.dbId ? `<span class="mrow"><button type="button" class="medit" data-owner="${mk.dbId}">Власник</button><button type="button" class="mdel" data-del="${mk.dbId}">Видалити</button></span>` : '') + '</div>';
            markers.current[mk.id] = L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon, title: mk.name || c.name, keyboard: true }).bindPopup(html).addTo(layers.current[c.id]);
        }
        for (const c of cats)
            if (isOn(c))
                layers.current[c.id].addTo(m);
    }, [cats, marks, isAdmin, owners]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const m = map.current;
        if (!m)
            return;
        for (const c of cats) {
            const g = layers.current[c.id];
            if (!g)
                continue;
            if (isOn(c))
                g.addTo(m);
            else
                g.remove();
        }
    }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
    function setMany(ids, v) { setOn(o => { const n = { ...saved, ...o }; for (const id of ids)
        n[id] = v; saveOn(n); return n; }); }
    function pick(v) { pickRef.current = v; setPicking(v); if (v) {
        box.current?.focus();
        if (!wide)
            box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } }
    function go(mk) {
        const m = map.current;
        if (!m)
            return;
        const c = catById[mk.category];
        if (c && !isOn(c))
            setMany([c.id], true);
        m.flyTo(m.unproject(toPx(mk.x, mk.y), ZMAX), 5, { duration: 0.8 });
        if (!wide)
            box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => markers.current[mk.id]?.openPopup(), 850);
        setQ('');
    }
    async function del(id) {
        if (!confirm('Видалити цю мітку з мапи?'))
            return;
        const { error } = await supabase.from('map_points').delete().eq('id', id);
        if (error) {
            alert('Не вдалося видалити: ' + error.message);
            return;
        }
        map.current?.closePopup();
        setMarks(ms => ms.filter(x => x.dbId !== id));
    }
    async function setOwner(id) {
        const cur = marks.find(x => x.dbId === id)?.owner;
        const v = prompt('Статік власника бізнесу (порожньо — прибрати власника):', cur ? String(cur) : '');
        if (v === null)
            return;
        const st = v.trim() ? Number(v.trim().replace('#', '')) : null;
        if (st !== null && !(Number.isInteger(st) && st > 0)) {
            alert('Статік — ціле число, напр. 12345.');
            return;
        }
        const { error } = await supabase.from('map_points').update({ owner_static: st }).eq('id', id);
        if (error) {
            alert('Не вдалося зберегти: ' + error.message);
            return;
        }
        map.current?.closePopup();
        setMarks(ms => ms.map(x => (x.dbId === id ? { ...x, owner: st } : x)));
        const o = await supabase.from('map_owners').select('static_id,game_name');
        if (!o.error)
            setOwners(Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id, r.game_name])));
    }
    async function delCat(c) {
        if (!confirm(`Видалити категорію «${c.name}» разом з усіма її мітками (${count[c.id] || 0})?`))
            return;
        const { error } = await supabase.from('map_categories').delete().eq('id', c.id);
        if (error) {
            alert('Не вдалося видалити: ' + error.message);
            return;
        }
        setCats(cs => cs.filter(x => x.id !== c.id));
        setMarks(ms => ms.filter(x => x.category !== c.id));
    }
    const allIds = visibleCats.map(c => c.id);
    return (_jsxs("div", { className: wide ? 'mapfull' : 'mapflow', style: wide ? { top } : undefined, children: [_jsx("h1", { className: "vh", children: "\u041C\u0430\u043F\u0430 \u0448\u0442\u0430\u0442\u0443" }), _jsxs("div", { className: 'mapbox' + (picking ? ' picking' : ''), style: { background: OCEAN }, onClick: e => {
                    const t = e.target;
                    const a = t.closest('a[data-nav]');
                    if (a) {
                        e.preventDefault();
                        nav(a.getAttribute('href'));
                        return;
                    }
                    const d = t.closest('button[data-del]');
                    if (d)
                        del(Number(d.getAttribute('data-del')));
                    const ow = t.closest('button[data-owner]');
                    if (ow)
                        setOwner(Number(ow.getAttribute('data-owner')));
                }, children: [_jsx("div", { ref: box, className: "mapel", role: "region", "aria-label": "\u041C\u0430\u043F\u0430 \u0448\u0442\u0430\u0442\u0443", tabIndex: -1 }), picking && _jsx("span", { className: "mpick", children: "\u041A\u043B\u0456\u043A\u043D\u0438 \u043D\u0430 \u043C\u0430\u043F\u0456, \u0449\u043E\u0431 \u0432\u0437\u044F\u0442\u0438 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0438" }), pos && _jsxs("span", { className: "mcoord mono", children: ["X ", Math.round(pos[0]), " \u00B7 Y ", Math.round(pos[1])] }), _jsxs("span", { className: "mbrand", children: [_jsx("img", { src: "/brand/q-hub-logo.svg", alt: "", width: "22", height: "22" }), "Q-Hub"] })] }), wide && _jsxs("button", { type: "button", className: "mtoggle btn sm", onClick: () => setPanel(v => !v), "aria-expanded": panel, "aria-controls": "map-panel", children: [_jsx(Icon, { name: "map", size: 16 }), panel ? 'Сховати панель' : 'Фільтри'] }), _jsxs("aside", { id: "map-panel", className: 'mside' + (panel || !wide ? '' : ' hidden'), children: [_jsxs("div", { className: "fld has-ico msearch", children: [_jsx(Icon, { name: "search" }), _jsx("input", { type: "search", placeholder: "\u0417\u043D\u0430\u0439\u0442\u0438 \u043C\u0456\u0442\u043A\u0443", value: q, onChange: e => setQ(e.target.value), "aria-label": "\u041F\u043E\u0448\u0443\u043A \u043D\u0430 \u043C\u0430\u043F\u0456" }), found.length > 0 && _jsx("ul", { className: "mfound", children: found.map(mk => _jsx("li", { children: _jsxs("button", { type: "button", onClick: () => go(mk), children: [_jsx("img", { src: mk.icon || catById[mk.category]?.icon, alt: "", width: 18, height: 18 }), mk.name || catById[mk.category]?.name, _jsx("small", { children: mk.name ? catById[mk.category]?.name : '' })] }) }, mk.id)) })] }), _jsxs("details", { className: "mfilters", open: true, children: [_jsx("summary", { children: "\u0424\u0456\u043B\u044C\u0442\u0440\u0438" }), _jsxs("div", { className: "mseg", role: "group", "aria-label": "\u0423\u0441\u0456 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457", children: [_jsx("button", { type: "button", onClick: () => setMany(allIds, true), "aria-pressed": allIds.length > 0 && visibleCats.every(isOn), children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0435" }), _jsx("button", { type: "button", onClick: () => setMany(allIds, false), "aria-pressed": visibleCats.length > 0 && !visibleCats.some(isOn), children: "\u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u0432\u0441\u0435" })] }), groups.map(({ grp, cats: gc }) => {
                                const allOn = gc.every(isOn);
                                return (_jsxs("section", { className: "mgrp", children: [_jsxs("button", { type: "button", className: "mgrp-h", onClick: () => setMany(gc.map(c => c.id), !allOn), role: "switch", "aria-checked": allOn, title: allOn ? 'Сховати групу' : 'Показати групу', children: [_jsx("span", { children: grp }), _jsx("span", { className: "msw", "aria-hidden": "true" })] }), _jsx("div", { className: "mchips", children: gc.map(c => {
                                                const v = isOn(c);
                                                return (_jsxs("span", { className: 'mchip' + (v ? ' on' : ''), style: { '--c': c.color }, children: [_jsxs("button", { type: "button", className: "mchip-b", "aria-pressed": v, onClick: () => setMany([c.id], !v), children: [_jsx("img", { src: c.icon, alt: "", width: 22, height: 22, loading: "lazy" }), _jsx("span", { className: "mcat-n", children: c.name }), _jsx("span", { className: "cnt", children: count[c.id] || 0 })] }), isAdmin && !c.builtin && _jsx("button", { type: "button", className: "mcat-del", onClick: () => delCat(c), "aria-label": 'Видалити категорію ' + c.name, children: "\u2715" })] }, c.id));
                                            }) })] }, grp));
                            })] }), isAdmin && (dbMissing
                        ? _jsx("p", { className: "card err", children: "\u0422\u0430\u0431\u043B\u0438\u0446\u044C \u043C\u0430\u043F\u0438 \u0432 \u0431\u0430\u0437\u0456 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454 \u0430\u0431\u043E \u0432\u043E\u043D\u0438 \u0441\u0442\u0430\u0440\u043E\u0457 \u0432\u0435\u0440\u0441\u0456\u0457. \u0417\u0430\u043F\u0443\u0441\u0442\u0438 \u043E\u0441\u0442\u0430\u043D\u043D\u0456\u0439 q-hub-map.sql \u0443 Supabase \u2192 SQL Editor \u0456 \u043E\u043D\u043E\u0432\u0438 \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0443 \u2014 \u0442\u043E\u0434\u0456 \u0442\u0443\u0442 \u0437'\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u0456\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0438 \u0430\u0434\u043C\u0456\u043D\u0430." })
                        : _jsx(MapAdmin, { cats: cats, picked: picked, picking: picking, onPick: pick, onMarks: ms => { setMarks(x => [...x, ...ms]); setMany([...new Set(ms.map(m => m.category))], true); }, onCat: c => { setCats(x => [...x, c]); setMany([c.id], true); } }))] })] }));
}
