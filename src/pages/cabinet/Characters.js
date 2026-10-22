import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { money, parseMoney } from '../../lib/format';
export default function Characters({ first }) {
    const { characters, reloadCharacters, setCurrent } = useAuth();
    const [name, setName] = useState('');
    const [start, setStart] = useState('');
    const [goalName, setGoalName] = useState('');
    const [goal, setGoal] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    async function add(e) {
        e.preventDefault();
        setMsg('');
        if (!name.trim()) {
            setMsg('Вкажи ім\'я персонажа, як у грі.');
            return;
        }
        setBusy(true);
        const { data, error } = await supabase.from('characters').insert({ name: name.trim(), start_balance: parseMoney(start), goal_name: goalName.trim(), goal: parseMoney(goal) }).select('id').single();
        setBusy(false);
        if (error) {
            setMsg('Не вдалося створити персонажа. Спробуй ще раз.');
            return;
        }
        await reloadCharacters();
        setCurrent(data.id);
        setName('');
        setStart('');
        setGoalName('');
        setGoal('');
    }
    return (_jsxs("div", { className: "grid side", children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: first ? 'Додай свого персонажа' : 'Новий персонаж' }), first && _jsxs("p", { className: "muted", children: ["\u0423 \u043A\u043E\u0436\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0441\u0432\u0456\u0439 \u043E\u0431\u043B\u0456\u043A, \u0441\u043A\u043B\u0430\u0434 \u0456 \u0433\u0430\u0440\u0430\u0436. \u0412\u0436\u0435 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0432\u0441\u044F Quant Hub? \u0421\u0442\u0432\u043E\u0440\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0447\u0435\u0440\u0435\u0437 ", _jsx(Link, { to: "/kabinet/import", children: "\u0456\u043C\u043F\u043E\u0440\u0442 \u043A\u043E\u043F\u0456\u0457" }), " \u2014 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u0442\u044C\u0441\u044F \u0432\u0441\u0435."] }), _jsxs("form", { className: "form cols", onSubmit: add, children: [_jsxs("label", { className: "fld", children: ["\u0406\u043C'\u044F \u0432 \u0433\u0440\u0456", _jsx("input", { value: name, onChange: e => setName(e.target.value), placeholder: "Dmitriy_Core", maxLength: 40 })] }), _jsxs("label", { className: "fld", children: ["\u0411\u0430\u043B\u0430\u043D\u0441 \u0437\u0430\u0440\u0430\u0437 (\u0433\u043E\u0442\u0456\u0432\u043A\u0430 + \u0431\u0430\u043D\u043A)", _jsx("input", { value: start, onChange: e => setStart(e.target.value), inputMode: "numeric", placeholder: "6 900 661" })] }), _jsxs("label", { className: "fld", children: ["\u0426\u0456\u043B\u044C", _jsx("input", { value: goalName, onChange: e => setGoalName(e.target.value), placeholder: "Ubermacht I5", maxLength: 60 })] }), _jsxs("label", { className: "fld", children: ["\u0421\u0443\u043C\u0430 \u0446\u0456\u043B\u0456", _jsx("input", { value: goal, onChange: e => setGoal(e.target.value), inputMode: "numeric", placeholder: "13 000 000" })] }), _jsx("button", { className: "btn acc", disabled: busy, children: "\u0414\u043E\u0434\u0430\u0442\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430" })] }), msg && _jsx("p", { className: "err", children: msg })] }), characters.length > 0 && (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "\u0422\u0432\u043E\u0457 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0456" }), _jsx("div", { className: "list", children: characters.map(c => (_jsxs("div", { className: "li", children: [_jsxs("div", { children: [_jsx("b", { children: c.name }), _jsx("br", {}), _jsxs("small", { children: ["\u0441\u0442\u0430\u0440\u0442 ", money(c.start_balance), c.goal ? ' · ціль ' + (c.goal_name || '') + ' ' + money(c.goal) : ''] })] }), _jsx("button", { className: "btn sm", onClick: () => setCurrent(c.id), children: "\u041E\u0431\u0440\u0430\u0442\u0438" })] }, c.id))) })] }))] }));
}
