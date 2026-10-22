import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { money, parseMoney, signed } from '../../lib/format';
export default function GaragePage({ c }) {
    const { rows, error, reload } = useRows('cars', c.id, 'pos', true);
    const [f, setF] = useState({ name: '', plate: '', gov: '', paid: '', tune: '' });
    const [sell, setSell] = useState({});
    const [msg, setMsg] = useState('');
    const own = rows.filter(r => r.status === 'own'), sold = rows.filter(r => r.status === 'sold');
    async function add(e) {
        e.preventDefault();
        setMsg('');
        if (!f.name.trim()) {
            setMsg('Вкажи модель.');
            return;
        }
        const { error } = await supabase.from('cars').insert({ character_id: c.id, name: f.name.trim(), plate: f.plate.trim().toUpperCase(), gov: parseMoney(f.gov), paid: parseMoney(f.paid), tune: f.tune.trim(), pos: rows.length });
        if (error) {
            setMsg('Не вдалося додати авто.');
            return;
        }
        setF({ name: '', plate: '', gov: '', paid: '', tune: '' });
        reload();
    }
    async function markSold(car) {
        const p = parseMoney(sell[car.id] || '');
        if (!(p > 0)) {
            setMsg('Вкажи, за скільки продав ' + car.name + '.');
            return;
        }
        await supabase.from('cars').update({ status: 'sold', sold_price: p, sold_at: new Date().toISOString() }).eq('id', car.id);
        reload();
    }
    return (_jsxs("div", { className: "grid side", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "row between", children: [_jsx("h2", { children: "\u0413\u0430\u0440\u0430\u0436" }), _jsxs("span", { className: "muted", children: [own.length, " \u0430\u0432\u0442\u043E"] })] }), error && _jsx("p", { className: "err", children: error }), own.length ? _jsx("div", { className: "list", children: own.map(car => (_jsxs("div", { className: "li", children: [_jsxs("div", { children: [_jsx("b", { children: car.name }), car.plate && _jsx("span", { className: "pill", style: { marginLeft: 8 }, children: car.plate }), _jsx("br", {}), _jsxs("small", { children: ["\u0434\u0435\u0440\u0436. ", car.gov ? money(car.gov) : '—', " \u00B7 \u043A\u0443\u043F\u0438\u0432 \u0437\u0430 ", car.paid ? money(car.paid) : '—', car.tune ? ' · ' + car.tune : ''] })] }), _jsxs("div", { className: "row", children: [_jsx("label", { className: "fld", style: { width: 130 }, children: _jsx("input", { "aria-label": 'Ціна продажу ' + car.name, placeholder: "\u043F\u0440\u043E\u0434\u0430\u0432 \u0437\u0430", value: sell[car.id] || '', onChange: e => setSell({ ...sell, [car.id]: e.target.value }) }) }), _jsx("button", { className: "btn sm", onClick: () => markSold(car), children: "\u041F\u0440\u043E\u0434\u0430\u043D\u043E" })] })] }, car.id))) }) : _jsx("div", { className: "empty", children: "\u0410\u0432\u0442\u043E \u0449\u0435 \u043D\u0435\u043C\u0430\u0454." }), sold.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "\u041F\u0440\u043E\u0434\u0430\u043D\u0456" }), _jsx("div", { className: "list", children: sold.map(car => (_jsx("div", { className: "li", children: _jsxs("div", { children: [_jsx("b", { children: car.name }), _jsx("br", {}), _jsxs("small", { children: ["\u043F\u0440\u043E\u0434\u0430\u0432 \u0437\u0430 ", money(car.sold_price), car.paid ? ' · ' : '', car.paid ? _jsx("span", { className: car.sold_price - car.paid >= 0 ? 'good' : 'bad', children: signed(car.sold_price - car.paid) }) : null] })] }) }, car.id))) })] })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0430\u0432\u0442\u043E" }), _jsxs("form", { className: "form", onSubmit: add, children: [_jsxs("label", { className: "fld", children: ["\u041C\u043E\u0434\u0435\u043B\u044C", _jsx("input", { value: f.name, onChange: e => setF({ ...f, name: e.target.value }), placeholder: "Zeekr 001", maxLength: 60 })] }), _jsxs("label", { className: "fld", children: ["\u041D\u043E\u043C\u0435\u0440", _jsx("input", { value: f.plate, onChange: e => setF({ ...f, plate: e.target.value }), maxLength: 16 })] }), _jsxs("label", { className: "fld", children: ["\u0414\u0435\u0440\u0436. \u0432\u0430\u0440\u0442\u0456\u0441\u0442\u044C, $", _jsx("input", { value: f.gov, onChange: e => setF({ ...f, gov: e.target.value }), inputMode: "numeric" })] }), _jsxs("label", { className: "fld", children: ["\u041A\u0443\u043F\u0438\u0432 \u0437\u0430, $", _jsx("input", { value: f.paid, onChange: e => setF({ ...f, paid: e.target.value }), inputMode: "numeric" })] }), _jsxs("label", { className: "fld", children: ["\u0422\u044E\u043D\u0456\u043D\u0433", _jsx("input", { value: f.tune, onChange: e => setF({ ...f, tune: e.target.value }), placeholder: "Stage 2, \u043A\u0441\u0435\u043D\u043E\u043D\u2026" })] }), _jsx("button", { className: "btn acc", children: "\u0414\u043E\u0434\u0430\u0442\u0438" })] }), msg && _jsx("p", { className: "err", children: msg })] })] }));
}
