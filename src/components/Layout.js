import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import StaticGate from './StaticGate';
import Icon from './Icon';
import Backdrop from './Backdrop';
const NAV = [
    ['/', 'Головна', 'home'], ['/tsiny', 'Скупник', 'buyer'], ['/transport', 'Транспорт', 'car'],
    ['/roboty', 'Роботи', 'jobs'], ['/mapa', 'Мапа', 'map'], ['/programa', 'Програма', 'download']
];
export default function Layout() {
    const { session, name, avatar, signIn } = useAuth();
    return (_jsxs("div", { className: "app", children: [_jsx(Backdrop, {}), _jsxs("header", { className: "top", children: [_jsxs(NavLink, { to: "/", className: "brand", "aria-label": "Q-Hub \u2014 \u0433\u043E\u043B\u043E\u0432\u043D\u0430", children: [_jsx("span", { className: "logo", "aria-hidden": "true", children: "Q" }), _jsx("b", { children: "Q-Hub" })] }), _jsx("nav", { className: "nav", "aria-label": "\u0420\u043E\u0437\u0434\u0456\u043B\u0438", children: NAV.map(([to, label, ico]) => _jsxs(NavLink, { to: to, end: to === '/', children: [_jsx(Icon, { name: ico, size: 16 }), label] }, to)) }), _jsxs("div", { className: "who", children: [_jsx(ThemeToggle, {}), session
                                ? _jsxs(NavLink, { to: "/kabinet", className: "btn acc sm", children: [avatar && _jsx("img", { src: avatar, alt: "", width: 22, height: 22, style: { width: 22, height: 22 } }), name || 'Кабінет'] })
                                : _jsx("button", { className: "btn acc sm", onClick: signIn, children: "\u0423\u0432\u0456\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 Discord" })] })] }), _jsx("main", { children: _jsx(Outlet, {}) }), _jsx(StaticGate, {}), _jsx("footer", { className: "foot", children: "Q-Hub \u2014 \u0444\u0430\u043D-\u043F\u0440\u043E\u0454\u043A\u0442 \u0433\u0440\u0430\u0432\u0446\u0456\u0432, \u043D\u0435 \u043F\u043E\u0432'\u044F\u0437\u0430\u043D\u0438\u0439 \u0437 \u0430\u0434\u043C\u0456\u043D\u0456\u0441\u0442\u0440\u0430\u0446\u0456\u0454\u044E QuantRP. \u0426\u0456\u043D\u0438 \u0432\u043D\u043E\u0441\u044F\u0442\u044C \u0433\u0440\u0430\u0432\u0446\u0456 \u0439 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u044F\u044E\u0442\u044C \u043E\u0434\u043D\u0435 \u043E\u0434\u043D\u043E\u0433\u043E." })] }));
}
