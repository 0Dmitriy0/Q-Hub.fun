import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { when } from '../lib/format';
import Icon from './Icon';
const PERIODS = [['week', '7 днів'], ['month', 'Місяць'], ['year', 'Рік'], ['total', 'Весь час']];
/* рейтинг у вікні: кнопка в блоці оновлень, перемикач періоду, Esc або клік повз вікно закриває */
export default function Leaderboard({ list }) {
    const dlg = useRef(null);
    const [period, setPeriod] = useState('week');
    const [open, setOpen] = useState(false);
    useEffect(() => { if (open)
        dlg.current?.showModal();
    else
        dlg.current?.close(); }, [open]);
    /* міграцію 0005 могли ще не запустити — тоді місяця й року в даних немає */
    const has = (p) => list.length === 0 || list.some(c => c[p] !== undefined);
    const rows = list.map(c => ({ c, n: Number(c[period] ?? 0) })).filter(x => x.n > 0)
        .sort((a, b) => b.n - a.n || b.c.total - a.c.total).slice(0, 50);
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: "btn sm", onClick: () => setOpen(true), "aria-haspopup": "dialog", children: [_jsx(Icon, { name: "trophy" }), "\u0420\u0435\u0439\u0442\u0438\u043D\u0433"] }), _jsx("dialog", { ref: dlg, className: "modal", "aria-labelledby": "lb-title", onClose: () => setOpen(false), onClick: e => { if (e.target === dlg.current)
                    setOpen(false); }, children: _jsxs("div", { className: "modal-box", children: [_jsxs("div", { className: "row between", children: [_jsx("h2", { id: "lb-title", children: "\u0420\u0435\u0439\u0442\u0438\u043D\u0433 \u0442\u0438\u0445, \u0445\u0442\u043E \u0432\u043D\u043E\u0441\u0438\u0442\u044C \u0446\u0456\u043D\u0438" }), _jsx("button", { type: "button", className: "btn sm ghost", onClick: () => setOpen(false), "aria-label": "\u0417\u0430\u043A\u0440\u0438\u0442\u0438 \u0440\u0435\u0439\u0442\u0438\u043D\u0433", children: "\u2715" })] }), _jsx("div", { className: "seg", role: "group", "aria-label": "\u041F\u0435\u0440\u0456\u043E\u0434", children: PERIODS.map(([p, label]) => _jsx("button", { type: "button", "aria-pressed": period === p, className: period === p ? 'on' : '', disabled: !has(p), onClick: () => setPeriod(p), children: label }, p)) }), _jsx("p", { className: "muted note", children: "\u0411\u0430\u043B \u2014 \u0437\u0430 \u043A\u043E\u0436\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0446\u0456\u043D\u0438. \u0412\u0438\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044F \u0432\u043F\u0440\u043E\u0434\u043E\u0432\u0436 10 \u0445\u0432 \u0431\u0430\u043B\u0430 \u043D\u0435 \u0434\u043E\u0434\u0430\u0454, \u0430 \u0442\u0443 \u0441\u0430\u043C\u0443 \u0441\u0432\u0456\u0436\u0443 \u0446\u0456\u043D\u0443 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u0432\u043D\u0435\u0441\u0442\u0438 \u043D\u0435 \u043C\u043E\u0436\u043D\u0430." }), rows.length
                            ? _jsx("div", { className: "scroll", children: _jsxs("table", { className: "t", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "#" }), _jsx("th", { children: "\u0413\u0440\u0430\u0432\u0435\u0446\u044C" }), _jsx("th", { className: "n", children: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u044C" }), _jsx("th", { children: "\u041E\u0441\u0442\u0430\u043D\u043D\u0454" })] }) }), _jsx("tbody", { children: rows.map(({ c, n }, i) => _jsxs("tr", { className: i < 3 ? 'podium' : '', children: [_jsx("td", { className: "mono", children: i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1 }), _jsx("td", { children: _jsxs("span", { className: "row who-cell", children: [c.avatar_url && _jsx("img", { src: c.avatar_url, alt: "", width: 22, height: 22, className: "ava" }), _jsx("b", { children: (c.game_name || '').trim() || c.name || 'гравець' }), c.static_id ? _jsxs("span", { className: "muted mono", children: ["#", c.static_id] }) : null] }) }), _jsx("td", { className: "n", children: n }), _jsx("td", { children: when(c.last_at) })] }, c.id)) })] }) })
                            : _jsx("div", { className: "empty", children: list.length ? 'За цей період ще ніхто не оновлював ціни.' : 'Рейтинг поки порожній. Перше оновлення ціни — і ти на першому місці.' })] }) })] }));
}
