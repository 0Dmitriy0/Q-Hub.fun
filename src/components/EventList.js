import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { dur, eventStatus, kyHM } from '../lib/events';
export default function EventList({ compact }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
    const list = eventStatus(now).sort((a, b) => (a.now ? 0 : 1) - (b.now ? 0 : 1) || (a.next?.s ?? Infinity) - (b.next?.s ?? Infinity));
    return (_jsx("div", { className: "list", style: { gap: 8 }, children: (compact ? list.slice(0, 4) : list).map(s => {
            const soon = !s.now && s.next && s.next.s - now <= 15 * 60000;
            return (_jsxs("div", { className: 'ev' + (s.now ? ' on' : soon ? ' soon' : ''), children: [_jsx("b", { children: s.ev.name }), _jsx("small", { children: s.now ? `${kyHM(s.now.s)}–${kyHM(s.now.e)}` : s.ev.sched }), _jsx("span", { className: "st", children: s.now ? `зараз · ще ${dur(s.now.e - now)}` : s.next ? `о ${kyHM(s.next.s)} · через ${dur(s.next.s - now)}` : '—' })] }, s.ev.id));
        }) }));
}
