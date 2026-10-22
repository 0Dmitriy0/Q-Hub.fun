import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import Dashboard from './Dashboard';
import LedgerPage from './LedgerPage';
import StockPage from './StockPage';
import DealsPage from './DealsPage';
import GaragePage from './GaragePage';
import Characters from './Characters';
import ImportPage from './ImportPage';
import { useState } from 'react';
import { StaticForm } from '../../components/StaticGate';
import Select from '../../components/Select';
const TABS = [['', 'Дашборд'], ['oblik', 'Облік'], ['uhody', 'Угоди'], ['sklad', 'Склад'], ['harazh', 'Гараж'], ['personazhi', 'Персонажі'], ['import', 'Імпорт з хабу']];
export default function Cabinet() {
    const { ready, session, signIn, signOut, characters, current, setCurrent, name, staticId, gameName } = useAuth();
    const [editStatic, setEditStatic] = useState(false);
    if (!supabase)
        return _jsx("div", { className: "card empty", children: "\u041A\u0430\u0431\u0456\u043D\u0435\u0442 \u0437\u0430\u043F\u0440\u0430\u0446\u044E\u0454 \u043F\u0456\u0441\u043B\u044F \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F Supabase (\u0434\u0438\u0432. README)." });
    if (!ready)
        return _jsx("div", { className: "card empty", children: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026" });
    if (!session)
        return (_jsxs("section", { className: "card hero", children: [_jsx("h1", { children: "\u041A\u0430\u0431\u0456\u043D\u0435\u0442" }), _jsx("p", { className: "muted", children: "\u041E\u0431\u043B\u0456\u043A, \u0441\u043A\u043B\u0430\u0434, \u0433\u0430\u0440\u0430\u0436 \u0456 \u0443\u0433\u043E\u0434\u0438 \u0442\u0432\u043E\u0433\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430. \u0411\u0430\u0447\u0438\u0448 \u0457\u0445 \u043B\u0438\u0448\u0435 \u0442\u0438 \u2014 \u0446\u0435 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u044F\u0454 \u0441\u0430\u043C\u0430 \u0431\u0430\u0437\u0430." }), _jsx("div", { className: "row", children: _jsx("button", { className: "btn acc", onClick: signIn, children: "\u0423\u0432\u0456\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Discord" }) })] }));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row between", children: [_jsxs("div", { children: [_jsxs("span", { className: "lbl", children: [name, staticId ? _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("b", { children: gameName }), " ", _jsxs("b", { className: "mono", children: ["#", staticId] }), " ", _jsx("button", { type: "button", className: "link", onClick: () => setEditStatic(v => !v), children: editStatic ? 'скасувати' : 'змінити' })] }) : null] }), _jsx("h1", { children: current ? current.name : 'Кабінет' })] }), _jsxs("div", { className: "row", children: [characters.length > 1 && (_jsxs("label", { className: "fld", style: { minWidth: 200 }, children: [_jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436" }), _jsx(Select, { value: current?.id || '', onChange: setCurrent, options: characters.map(c => ({ value: c.id, label: c.name, icon: 'user' })) })] })), _jsx("button", { className: "btn ghost sm", onClick: signOut, children: "\u0412\u0438\u0439\u0442\u0438" })] })] }), editStatic && _jsx("section", { className: "card", children: _jsx(StaticForm, { submitLabel: "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438", onDone: () => setEditStatic(false) }) }), _jsx("nav", { className: "tabs", "aria-label": "\u041A\u0430\u0431\u0456\u043D\u0435\u0442", children: TABS.map(([p, l]) => _jsx(NavLink, { to: '/kabinet' + (p ? '/' + p : ''), end: true, children: l }, p)) }), !current ? _jsx(Characters, { first: true }) : (_jsxs(Routes, { children: [_jsx(Route, { index: true, element: _jsx(Dashboard, { c: current }) }), _jsx(Route, { path: "oblik", element: _jsx(LedgerPage, { c: current }) }), _jsx(Route, { path: "uhody", element: _jsx(DealsPage, { c: current }) }), _jsx(Route, { path: "sklad", element: _jsx(StockPage, { c: current }) }), _jsx(Route, { path: "harazh", element: _jsx(GaragePage, { c: current }) }), _jsx(Route, { path: "personazhi", element: _jsx(Characters, {}) }), _jsx(Route, { path: "import", element: _jsx(ImportPage, {}) })] }))] }));
}
