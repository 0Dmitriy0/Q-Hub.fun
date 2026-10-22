import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { ledger } from '../../lib/ledger';
import { money, parseMoney, qty as fq, signed, when } from '../../lib/format';
import { DEAL_CATS, OPS } from '../../lib/cats';
import Select from '../../components/Select';
export default function DealsPage({ c }) {
    const { rows, error, reload } = useRows('deals', c.id, 'ts', false);
    const [op, setOp] = useState('buy');
    const [item, setItem] = useState('');
    const [q, setQ] = useState('');
    const [price, setPrice] = useState('');
    const [cat, setCat] = useState('');
    const [toLedger, setToLedger] = useState(true);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [sure, setSure] = useState('');
    const [catalog, setCatalog] = useState([]);
    useEffect(() => { supabase?.from('items').select('name').order('name').limit(2000).then(({ data }) => setCatalog((data || []).map(r => r.name))); }, []);
    const names = useMemo(() => Array.from(new Set([...catalog, ...rows.map(r => r.item)])).sort((a, b) => a.localeCompare(b, 'uk')), [catalog, rows]);
    const L = useMemo(() => ledger(rows), [rows]);
    async function add(e) {
        e.preventDefault();
        setMsg('');
        const n = Number(String(q).replace(',', '.')), p = op === 'farm' ? 0 : parseMoney(price);
        if (!item.trim()) {
            setMsg('Вкажи товар.');
            return;
        }
        if (!(n > 0)) {
            setMsg('Вкажи кількість.');
            return;
        }
        if (op !== 'farm' && !(p > 0)) {
            setMsg('Вкажи ціну за штуку.');
            return;
        }
        setBusy(true);
        let txId = null;
        if (op !== 'farm' && toLedger) {
            const had = (L.items[item.trim()]?.boughtQty || 0) > 0;
            const { data, error } = await supabase.from('transactions').insert({
                character_id: c.id, type: op === 'buy' ? 'out' : 'in', amount: Math.round(n * p), source: 'deal',
                category: op === 'buy' || had ? 'Перекуп' : 'Продаж фарму', note: `${OPS[op]}: ${item.trim()} × ${fq(n)} по ${money(p)}`
            }).select('id').single();
            if (error) {
                setBusy(false);
                setMsg('Не вдалося записати в облік.');
                return;
            }
            txId = data.id;
        }
        const { error } = await supabase.from('deals').insert({ character_id: c.id, op, item: item.trim(), qty: n, price: p, category: cat, tx_id: txId });
        setBusy(false);
        if (error) {
            if (txId)
                await supabase.from('transactions').delete().eq('id', txId);
            setMsg('Не вдалося зберегти угоду.');
            return;
        }
        setItem('');
        setQ('');
        setPrice('');
        reload();
    }
    async function del(d) {
        if (sure !== d.id) {
            setSure(d.id);
            setTimeout(() => setSure(s => (s === d.id ? '' : s)), 3000);
            return;
        }
        await supabase.from('deals').delete().eq('id', d.id);
        if (d.tx_id && !rows.some(x => x.id !== d.id && x.tx_id === d.tx_id))
            await supabase.from('transactions').delete().eq('id', d.tx_id);
        setSure('');
        reload();
    }
    return (_jsxs("div", { className: "grid side", children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "\u041D\u043E\u0432\u0430 \u0443\u0433\u043E\u0434\u0430" }), _jsx("div", { className: "seg", role: "group", "aria-label": "\u0429\u043E \u0437\u0440\u043E\u0431\u0438\u0432", children: ['buy', 'farm', 'sell'].map(o => _jsx("button", { type: "button", "aria-pressed": op === o, onClick: () => setOp(o), children: OPS[o] }, o)) }), _jsxs("form", { className: "form cols", onSubmit: add, children: [_jsxs("label", { className: "fld", children: ["\u0422\u043E\u0432\u0430\u0440", _jsx("input", { list: "items", value: item, onChange: e => setItem(e.target.value), placeholder: "Stage 1, \u0413\u043B\u0438\u0432\u0430\u2026", maxLength: 80 })] }), _jsx("datalist", { id: "items", children: names.map(n => _jsx("option", { value: n }, n)) }), _jsxs("label", { className: "fld", children: ["\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C", _jsx("input", { value: q, onChange: e => setQ(e.target.value), inputMode: "decimal", placeholder: "1" })] }), op !== 'farm' && _jsxs("label", { className: "fld", children: ["\u0426\u0456\u043D\u0430 \u0437\u0430 \u0448\u0442, $", _jsx("input", { value: price, onChange: e => setPrice(e.target.value), inputMode: "numeric", placeholder: "150\u043A" })] }), _jsxs("label", { className: "fld", children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", _jsx(Select, { value: cat, onChange: setCat, options: DEAL_CATS.map(([k, l]) => ({ value: k, label: l })) })] }), op !== 'farm' && _jsxs("label", { className: "row", style: { gap: 8 }, children: [_jsx("input", { type: "checkbox", checked: toLedger, onChange: e => setToLedger(e.target.checked) }), " \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u0432 \u043E\u0431\u043B\u0456\u043A"] }), _jsx("button", { className: "btn acc", disabled: busy, children: op === 'buy' ? 'Записати покупку' : op === 'sell' ? 'Записати продаж' : 'Додати на склад' })] }), msg && _jsx("p", { className: "err", children: msg })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "row between", children: [_jsx("h2", { children: "\u0423\u0433\u043E\u0434\u0438" }), _jsxs("span", { className: "muted", children: ["\u043F\u0435\u0440\u0435\u043A\u0443\u043F ", signed(L.resale)] })] }), error && _jsx("p", { className: "err", children: error }), rows.length ? _jsx("div", { className: "list", children: rows.slice(0, 200).map(d => {
                            const p = L.perDeal[d.id];
                            return (_jsxs("div", { className: "li", children: [_jsxs("div", { children: [_jsx("span", { className: 'pill ' + (d.op === 'sell' ? 'good' : d.op === 'buy' ? 'bad' : 'warn'), children: OPS[d.op] }), " ", _jsxs("b", { children: [d.item, " \u00D7 ", fq(d.qty)] }), d.receipt_id && _jsx("small", { children: " \u00B7 \u0447\u0435\u043A" }), _jsx("br", {}), _jsxs("small", { children: [when(d.ts), d.op !== 'farm' ? ` · ${money(d.price)}/шт · ${money(d.qty * d.price)}` : '', p && p.fromBought ? ' · ' : '', p && p.fromBought ? _jsx("span", { className: p.profit >= 0 ? 'good' : 'bad', children: signed(p.profit) }) : null] })] }), _jsx("button", { className: "btn sm ghost", onClick: () => del(d), children: sure === d.id ? 'Так, видалити' : 'Видалити' })] }, d.id));
                        }) }) : _jsx("div", { className: "empty", children: "\u0423\u0433\u043E\u0434 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0417\u0430\u043F\u0438\u0448\u0438 \u043F\u0435\u0440\u0448\u0443 \u043F\u043E\u043A\u0443\u043F\u043A\u0443 \u043B\u0456\u0432\u043E\u0440\u0443\u0447." })] })] }));
}
