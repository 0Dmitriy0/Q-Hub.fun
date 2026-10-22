import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { balance } from '../../lib/ledger';
import { money, parseMoney, signed, when } from '../../lib/format';
import { TX_CATS } from '../../lib/cats';
import Select from '../../components/Select';
export default function LedgerPage({ c }) {
    const { rows, error, reload } = useRows('transactions', c.id);
    const [type, setType] = useState('in');
    const [amount, setAmount] = useState('');
    const [cat, setCat] = useState(TX_CATS.in[0]);
    const [note, setNote] = useState('');
    const [real, setReal] = useState('');
    const [msg, setMsg] = useState('');
    const [sure, setSure] = useState('');
    const bal = balance(c.start_balance, rows);
    async function add(e) {
        e.preventDefault();
        setMsg('');
        const a = parseMoney(amount);
        if (!(a > 0)) {
            setMsg('Вкажи суму більше 0.');
            return;
        }
        const { error } = await supabase.from('transactions').insert({ character_id: c.id, type, amount: a, category: cat, note: note.trim() });
        if (error) {
            setMsg('Не вдалося записати.');
            return;
        }
        setAmount('');
        setNote('');
        reload();
    }
    async function reconcile() {
        const r = parseMoney(real), diff = r - bal;
        if (!(r > 0) || !diff) {
            setMsg(diff ? 'Введи баланс із гри.' : 'Збігається з грою.');
            return;
        }
        const { error } = await supabase.from('transactions').insert({ character_id: c.id, type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), category: 'Коригування', note: 'Звірка з грою', source: 'reconcile' });
        if (error) {
            setMsg('Не вдалося звірити.');
            return;
        }
        setReal('');
        setMsg('Звірено: ' + signed(diff));
        reload();
    }
    async function del(id) {
        if (sure !== id) {
            setSure(id);
            setTimeout(() => setSure(s => (s === id ? '' : s)), 3000);
            return;
        }
        await supabase.from('transactions').delete().eq('id', id);
        setSure('');
        reload();
    }
    return (_jsxs("div", { className: "grid side", children: [_jsxs("div", { className: "grid", children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "\u041D\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441" }), _jsxs("div", { className: "seg", role: "group", "aria-label": "\u0422\u0438\u043F", children: [_jsx("button", { type: "button", "aria-pressed": type === 'in', onClick: () => { setType('in'); setCat(TX_CATS.in[0]); }, children: "\u041F\u0440\u0438\u0431\u0443\u0442\u043E\u043A" }), _jsx("button", { type: "button", "aria-pressed": type === 'out', onClick: () => { setType('out'); setCat(TX_CATS.out[0]); }, children: "\u0412\u0438\u0442\u0440\u0430\u0442\u0430" })] }), _jsxs("form", { className: "form cols", onSubmit: add, children: [_jsxs("label", { className: "fld", children: ["\u0421\u0443\u043C\u0430, $", _jsx("input", { value: amount, onChange: e => setAmount(e.target.value), inputMode: "numeric", placeholder: "150\u043A \u0430\u0431\u043E 150 000" })] }), _jsxs("label", { className: "fld", children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", _jsx(Select, { value: cat, onChange: setCat, options: TX_CATS[type].map(x => ({ value: x, label: x })) })] }), _jsxs("label", { className: "fld", children: ["\u041D\u043E\u0442\u0430\u0442\u043A\u0430", _jsx("input", { value: note, onChange: e => setNote(e.target.value), maxLength: 200, placeholder: "\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E" })] }), _jsx("button", { className: "btn acc", children: "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u0438" })] }), msg && _jsx("p", { className: msg.startsWith('Звірено') || msg.startsWith('Збігається') ? 'ok' : 'err', children: msg })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "row between", children: [_jsx("h2", { children: "\u0406\u0441\u0442\u043E\u0440\u0456\u044F" }), _jsxs("span", { className: "muted", children: [rows.length, " \u0437\u0430\u043F\u0438\u0441\u0456\u0432"] })] }), error && _jsx("p", { className: "err", children: error }), rows.length ? _jsx("div", { className: "list", children: rows.slice(0, 200).map(t => (_jsxs("div", { className: "li", children: [_jsxs("div", { children: [_jsx("b", { className: t.type === 'in' ? 'good' : 'bad', children: signed(t.type === 'in' ? t.amount : -t.amount) }), " \u00B7 ", t.category, _jsx("br", {}), _jsxs("small", { children: [when(t.ts), t.note ? ' · ' + t.note : ''] })] }), _jsx("button", { className: "btn sm ghost", onClick: () => del(t.id), children: sure === t.id ? 'Так, видалити' : 'Видалити' })] }, t.id))) }) : _jsx("div", { className: "empty", children: "\u0417\u0430\u043F\u0438\u0441\u0456\u0432 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454." })] })] }), _jsxs("section", { className: "card", children: [_jsx("span", { className: "lbl", children: "\u0411\u0430\u043B\u0430\u043D\u0441 \u0432 \u043E\u0431\u043B\u0456\u043A\u0443" }), _jsx("div", { className: "big", style: { fontSize: 30 }, children: money(bal) }), _jsx("h3", { children: "\u0417\u0432\u0456\u0440\u043A\u0430 \u0437 \u0433\u0440\u043E\u044E" }), _jsx("p", { className: "muted", children: "\u0412\u0432\u0435\u0434\u0438 \u0441\u0443\u043C\u0443 \u0437 \u0433\u0440\u0438 (\u0433\u043E\u0442\u0456\u0432\u043A\u0430 + \u0431\u0430\u043D\u043A). \u0420\u0456\u0437\u043D\u0438\u0446\u044F \u0437\u0430\u043F\u0438\u0448\u0435\u0442\u044C\u0441\u044F \u044F\u043A \u043A\u043E\u0440\u0438\u0433\u0443\u0432\u0430\u043D\u043D\u044F." }), _jsxs("div", { className: "row", children: [_jsxs("label", { className: "fld", style: { flex: 1 }, children: [_jsx("span", { children: "\u0411\u0430\u043B\u0430\u043D\u0441 \u0443 \u0433\u0440\u0456" }), _jsx("input", { value: real, onChange: e => setReal(e.target.value), inputMode: "numeric" })] }), _jsx("button", { className: "btn", onClick: reconcile, children: "\u0417\u0432\u0456\u0440\u0438\u0442\u0438" })] })] })] }));
}
