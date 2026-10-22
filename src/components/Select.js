import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
/* Випадний список у стилі сайту замість стандартного браузерного.
   Клавіатура: ↑/↓ — вибір, Enter/Пробіл — підтвердити, Esc — закрити, Home/End; у довгих списках є пошук.
   Вікно позиціюється над усім (fixed), тож не обрізається таблицями з прокруткою, і саме розгортається вгору біля низу екрана. */
export default function Select({ value, options, onChange, label, placeholder = 'Вибери…', className = '', searchable }) {
    const id = useId(), btn = useRef(null), pop = useRef(null), find = useRef(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState({ left: 0, top: 0, width: 0, up: false, max: 320 });
    const withSearch = searchable ?? options.length > 10;
    const ql = q.trim().toLowerCase();
    const list = ql ? options.filter(o => o.label.toLowerCase().includes(ql)) : options;
    const cur = options.find(o => o.value === value);
    function place() {
        const r = btn.current.getBoundingClientRect(), below = innerHeight - r.bottom - 12, above = r.top - 12;
        const up = below < 240 && above > below;
        setPos({ left: Math.min(r.left, innerWidth - Math.max(r.width, 220) - 8), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 220), up, max: Math.min(340, Math.max(160, up ? above : below)) });
    }
    function show() { place(); setQ(''); setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); }
    function pick(o) { onChange(o.value); setOpen(false); btn.current?.focus(); }
    useLayoutEffect(() => { if (open)
        (withSearch ? find.current : pop.current)?.focus(); }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const away = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target))
            setOpen(false); };
        const close = (e) => { if (!pop.current?.contains(e.target))
            setOpen(false); };
        addEventListener('pointerdown', away);
        addEventListener('scroll', close, true);
        addEventListener('resize', close);
        return () => { removeEventListener('pointerdown', away); removeEventListener('scroll', close, true); removeEventListener('resize', close); };
    }, [open]);
    useEffect(() => { pop.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
    function key(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            btn.current?.focus();
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(a => Math.min(list.length - 1, a + 1));
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(a => Math.max(0, a - 1));
        }
        else if (e.key === 'Home') {
            e.preventDefault();
            setActive(0);
        }
        else if (e.key === 'End') {
            e.preventDefault();
            setActive(list.length - 1);
        }
        else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) {
            e.preventDefault();
            if (list[active])
                pick(list[active]);
        }
        else if (e.key === 'Tab')
            setOpen(false);
    }
    return (_jsxs(_Fragment, { children: [_jsxs("button", { ref: btn, type: "button", className: 'sel ' + className + (open ? ' open' : ''), "aria-haspopup": "listbox", "aria-expanded": open, "aria-controls": id, "aria-label": label, onClick: () => (open ? setOpen(false) : show()), onKeyDown: e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    e.preventDefault();
                    show();
                } }, children: [cur?.icon && _jsx(Icon, { name: cur.icon, size: 16 }), _jsx("span", { className: 'sel-v' + (cur ? '' : ' ph'), children: cur ? cur.label : placeholder }), _jsx("svg", { className: "sel-chev", width: "16", height: "16", viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), open && createPortal(_jsxs("div", { ref: pop, className: 'sel-pop' + (pos.up ? ' up' : ''), tabIndex: -1, onKeyDown: key, style: { left: pos.left, width: pos.width, ...(pos.up ? { bottom: innerHeight - pos.top } : { top: pos.top }) }, children: [withSearch && _jsxs("div", { className: "sel-find", children: [_jsx(Icon, { name: "search", size: 15 }), _jsx("input", { ref: find, value: q, placeholder: "\u041F\u043E\u0448\u0443\u043A\u2026", "aria-label": "\u041F\u043E\u0448\u0443\u043A \u0443 \u0441\u043F\u0438\u0441\u043A\u0443", "aria-controls": id, onChange: e => { setQ(e.target.value); setActive(0); } })] }), _jsxs("ul", { id: id, role: "listbox", "aria-label": label, style: { maxHeight: pos.max - (withSearch ? 52 : 0) }, "aria-activedescendant": list[active] ? `${id}-${active}` : undefined, children: [list.map((o, i) => (_jsxs("li", { id: `${id}-${i}`, "data-i": i, role: "option", "aria-selected": o.value === value, className: (i === active ? 'act' : '') + (o.value === value ? ' on' : ''), onPointerMove: () => setActive(i), onClick: () => pick(o), children: [o.icon && _jsx(Icon, { name: o.icon, size: 16 }), _jsxs("span", { className: "sel-l", children: [o.label, o.hint && _jsx("small", { children: o.hint })] }), o.value === value && _jsx("svg", { className: "sel-ok", width: "16", height: "16", viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M5 12l5 5 9-10" }) })] }, String(o.value)))), !list.length && _jsx("li", { className: "sel-none", "aria-disabled": "true", children: "\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E" })] })] }), document.body)] }));
}
