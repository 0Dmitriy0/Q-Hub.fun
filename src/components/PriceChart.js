import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { money, when } from '../lib/format';
import { GOOD, PERIOD, chartWindow, seriesIn } from '../lib/pricestats';
/* маленька лінія в рядку списку — лише форма руху ціни, без осей */
export function Spark({ pts, now }) {
    if (pts.length < 2)
        return _jsx("span", { className: "spark none", "aria-hidden": "true" });
    const W = 72, H = 24, lo = Math.min(...pts.map(p => p.p)), hi = Math.max(...pts.map(p => p.p)), span = hi - lo || 1;
    const x = (t) => ((t - (now - PERIOD)) / PERIOD) * W, y = (p) => H - 3 - ((p - lo) / span) * (H - 6);
    const xy = pts.map(p => [x(p.t), y(p.p)]);
    xy.push([W, y(pts[pts.length - 1].p)]);
    return _jsx("svg", { className: "spark", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true", children: _jsx("path", { d: smoothPath(xy) }) });
}
export function RangeBar({ pos, range }) {
    if (pos === null || !range)
        return _jsx("span", { className: "rbar-none", children: "\u043C\u0435\u0436 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454" });
    const good = pos >= GOOD;
    return (_jsxs("span", { className: 'rbar' + (good ? ' good' : ''), title: `${pos}% між мінімумом ${money(range.min)} і максимумом ${money(range.max)}`, children: [_jsx("span", { className: "rtrack", children: _jsx("span", { className: "rfill", style: { width: pos + '%' } }) }), _jsxs("span", { className: "rtxt mono", children: [good ? '▲ ' : '', pos, "%", good ? ' вигідно' : ''] })] }));
}
const fDay = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
const fHour = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
const fMonth = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', month: 'short' });
const PERIODS = [['today', 'Сьогодні'], ['yesterday', 'Вчора'], ['month', 'Місяць'], ['year', 'Рік']];
/* плавна лінія через точки без «перелітів» вище чи нижче сусідніх цін (монотонна кубічна, Fritsch–Carlson) */
function smoothPath(xy) {
    const n = xy.length;
    if (!n)
        return '';
    if (n === 1)
        return `M${xy[0][0]},${xy[0][1]}`;
    const d = [], m = [];
    for (let i = 0; i < n - 1; i++)
        d.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0] || 1));
    m.push(d[0]);
    for (let i = 1; i < n - 1; i++)
        m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (let i = 0; i < n - 1; i++)
        if (d[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
        }
        else {
            const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
            if (h > 9) {
                const t = 3 / Math.sqrt(h);
                m[i] = t * a * d[i];
                m[i + 1] = t * b * d[i];
            }
        }
    let path = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = xy[i], [x1, y1] = xy[i + 1], dx = (x1 - x0) / 3;
        path += `C${(x0 + dx).toFixed(1)},${(y0 + m[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - m[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return path;
}
/* графік ціни за вибраний період: плавна лінія з точками на кожній зміні, легка заливка під нею,
   межі мін/макс пунктиром; наведення підсвічує найближчу зміну ціни */
export function PriceChart({ raw, range, name }) {
    const box = useRef(null);
    const wrap = useRef(null);
    const [period, setPeriod] = useState('month');
    const [hov, setHov] = useState(null);
    /* ширина в справжніх пікселях, щоб підписи осей не роздувались і не дрібніли разом з картинкою */
    const [W, setW] = useState(640);
    useEffect(() => {
        const el = wrap.current;
        if (!el)
            return;
        const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const { from, to } = chartWindow(period);
    const pts = seriesIn(raw, from, to);
    const changes = pts.filter(p => p.t > from); // справжні зміни ціни (без точки «на початок вікна»)
    const H = W < 480 ? 200 : 250, L = 52, R = 14, T = 16, B = 28;
    const vals = pts.map(p => p.p).concat(range ? [range.min, range.max] : []);
    let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
    const pad = (hi - lo || hi || 1) * 0.14;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const span = to - from;
    const x = (t) => L + ((t - from) / span) * (W - L - R), y = (p) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map(k => lo + ((hi - lo) * k) / 3);
    /* на вузькому екрані підписів менше, щоб вони не налазили один на одного */
    const narrow = W < 520, step = narrow ? 6 : 3, parts = period === 'year' ? (narrow ? 3 : 6) : 3;
    const xt = period === 'today' || period === 'yesterday' ? Array.from({ length: 24 / step }, (_, k) => from + k * step * 36e5).filter(t => t <= to)
        : Array.from({ length: parts + 1 }, (_, k) => from + (span * k) / parts);
    const xl = (t) => (period === 'today' || period === 'yesterday' ? fHour.format(t) : period === 'month' ? fDay.format(t) : fMonth.format(t).replace('.', ''));
    const xy = pts.map(p => [x(p.t), y(p.p)]);
    if (pts.length)
        xy.push([x(to), y(pts[pts.length - 1].p)]); // ціна тримається до кінця вікна
    const line = smoothPath(xy);
    const area = xy.length ? `${line}L${xy[xy.length - 1][0].toFixed(1)},${H - B}L${xy[0][0].toFixed(1)},${H - B}Z` : '';
    function move(e) {
        if (!changes.length)
            return;
        const r = box.current.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        changes.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(changes[best].t) - px))
            best = i; });
        setHov(best);
    }
    const h = hov !== null ? changes[hov] : null;
    return (_jsxs("figure", { className: "chart", children: [_jsxs("div", { className: "row between chart-head", children: [_jsx("div", { className: "seg chart-seg", role: "group", "aria-label": "\u041F\u0435\u0440\u0456\u043E\u0434 \u0433\u0440\u0430\u0444\u0456\u043A\u0430", children: PERIODS.map(([p, l]) => _jsx("button", { type: "button", "aria-pressed": period === p, className: period === p ? 'on' : '', onClick: () => { setPeriod(p); setHov(null); }, children: l }, p)) }), _jsx("small", { className: "muted", children: changes.length ? `${changes.length} ${changes.length === 1 ? 'зміна' : changes.length < 5 ? 'зміни' : 'змін'} ціни` : 'змін ціни не було' })] }), _jsxs("div", { className: "chart-box", ref: wrap, children: [!pts.length ? _jsx("div", { className: "empty", children: "\u0417\u0430 \u0446\u0435\u0439 \u043F\u0435\u0440\u0456\u043E\u0434 \u0456\u0441\u0442\u043E\u0440\u0456\u0457 \u0446\u0456\u043D \u0449\u0435 \u043D\u0435\u043C\u0430\u0454." }) :
                        _jsxs("svg", { ref: box, viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Ціна «${name}»: ${PERIODS.find(p => p[0] === period)[1].toLowerCase()}`, onPointerMove: move, onPointerLeave: () => setHov(null), children: [ticks.map(v => _jsxs("g", { children: [_jsx("line", { className: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }), _jsx("text", { className: "ax", x: L - 8, y: y(v) + 4, textAnchor: "end", children: Math.round(v).toLocaleString('uk-UA') })] }, v)), xt.map((t, i) => _jsxs("g", { children: [_jsx("line", { className: "grid v", x1: x(t), x2: x(t), y1: T, y2: H - B }), _jsx("text", { className: "ax", x: x(t), y: H - 8, textAnchor: i === 0 ? 'start' : t >= to - 1 ? 'end' : 'middle', children: xl(t) })] }, t)), range && _jsxs(_Fragment, { children: [_jsx("line", { className: "lim", x1: L, x2: W - R, y1: y(range.max), y2: y(range.max) }), _jsxs("text", { className: "ax lab", x: W - R - 4, y: y(range.max) - 6, textAnchor: "end", children: ["\u043C\u0430\u043A\u0441 ", money(range.max)] }), _jsx("line", { className: "lim", x1: L, x2: W - R, y1: y(range.min), y2: y(range.min) }), _jsxs("text", { className: "ax lab", x: W - R - 4, y: y(range.min) + 15, textAnchor: "end", children: ["\u043C\u0456\u043D ", money(range.min)] })] }), _jsx("path", { className: "area", d: area }), _jsx("path", { className: "line", d: line }), h && _jsx("line", { className: "cross", x1: x(h.t), x2: x(h.t), y1: T, y2: H - B }), changes.map((p, i) => _jsx("circle", { className: 'pt' + (i === hov ? ' on' : ''), cx: x(p.t), cy: y(p.p), r: i === hov ? 7 : 5 }, p.t))] }), h && _jsxs("div", { className: "tip", style: { left: `${Math.min(88, Math.max(12, (x(h.t) / W) * 100))}%` }, children: [_jsx("b", { className: "mono", children: money(h.p) }), _jsx("small", { children: when(h.t) })] })] }), _jsxs("details", { className: "chart-table", children: [_jsx("summary", { children: "\u0417\u043C\u0456\u043D\u0438 \u0446\u0456\u043D\u0438 \u0442\u0430\u0431\u043B\u0438\u0446\u0435\u044E" }), _jsxs("table", { className: "t", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041A\u043E\u043B\u0438" }), _jsx("th", { className: "n", children: "\u0426\u0456\u043D\u0430" })] }) }), _jsx("tbody", { children: changes.slice().reverse().map(p => _jsxs("tr", { children: [_jsx("td", { children: when(p.t) }), _jsx("td", { className: "n", children: money(p.p) })] }, p.t + ':' + p.p)) })] })] })] }));
}
